import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Itinerary } from "@/components/Itinerary";

const mocks = vi.hoisted(() => ({
  itinerary: {} as Record<string, { title: string; date: string; activities: Array<{ time: string; name: string; desc: string; tag: string }> }>,
  updateItinerary: vi.fn(),
  updateBudgetItems: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true),
  alert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({
    isLoaded: true,
    itinerary: mocks.itinerary,
    updateItinerary: mocks.updateItinerary,
    budgetItems: [],
    updateBudgetItems: mocks.updateBudgetItems,
  }),
}));

vi.mock("@/context/DialogContext", () => ({
  useDialog: () => ({ confirm: mocks.confirm, alert: mocks.alert }),
}));

function twoDayItinerary() {
  return {
    day1: {
      title: "🌸 Day 1 — 抵達東京",
      date: "9/1",
      activities: [{ time: "10:00", name: "原始活動", desc: "第一站", tag: "景點" }],
    },
    day2: {
      title: "🗼 Day 2 — 市區散步",
      date: "9/2",
      activities: [{ time: "09:00", name: "第二天活動", desc: "第二站", tag: "景點" }],
    },
  };
}

beforeEach(() => {
  mocks.itinerary = twoDayItinerary();
  mocks.updateItinerary.mockReset();
  mocks.updateBudgetItems.mockReset();
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.alert.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("Itinerary accessibility and state safety", () => {
  it("shows required-field feedback, keeps the source immutable, and supports short-screen scrolling", () => {
    const originalDay = mocks.itinerary.day1;
    const originalActivities = originalDay.activities;
    render(<Itinerary />);

    fireEvent.click(screen.getAllByRole("button", { name: "新增行程活動" })[0]);
    const dialog = screen.getByRole("dialog", { name: "新增計畫" });
    expect(dialog).toHaveClass("flex", "flex-col");
    expect(dialog.className).toContain("max-h-[calc(100dvh-1.5rem-var(--sat)-var(--sab))]");

    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    expect(screen.getByText("請選擇抵達時間")).toHaveAttribute("role", "alert");
    expect(screen.getByText("請輸入景點或店名")).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText(/抵達時間/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/景點或店名/)).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText(/抵達時間/), { target: { value: "08:30" } });
    fireEvent.change(screen.getByLabelText(/景點或店名/), { target: { value: "  新活動  " } });
    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));

    expect(mocks.updateItinerary).toHaveBeenCalledTimes(1);
    const updated = mocks.updateItinerary.mock.calls[0][0];
    expect(mocks.itinerary.day1).toBe(originalDay);
    expect(mocks.itinerary.day1.activities).toBe(originalActivities);
    expect(originalActivities).toHaveLength(1);
    expect(updated.day1).not.toBe(originalDay);
    expect(updated.day1.activities).not.toBe(originalActivities);
    expect(updated.day1.activities[0]).toMatchObject({ time: "08:30", name: "新活動" });
  });

  it("clamps the active day when synchronized itinerary data becomes shorter", () => {
    const { rerender } = render(<Itinerary />);
    fireEvent.click(screen.getByRole("button", { name: "前往第 2 天" }));
    expect(screen.getAllByText("🗼 Day 2 — 市區散步").length).toBeGreaterThan(0);

    mocks.itinerary = { day1: twoDayItinerary().day1 };
    expect(() => rerender(<Itinerary />)).not.toThrow();
    expect(screen.getAllByText("🌸 Day 1 — 抵達東京").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "前一天" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "後一天" })).toBeDisabled();
  });

  it("uses a non-shrinking responsive action grid and reveals desktop actions on keyboard focus", () => {
    render(<Itinerary />);
    const editButtons = screen.getAllByRole("button", { name: "編輯「原始活動」" });
    expect(editButtons[0].parentElement).toHaveClass("grid", "grid-cols-2", "min-[390px]:grid-cols-4");
    expect(editButtons[1].parentElement).toHaveClass("md:group-focus-within:opacity-100");
    expect(editButtons[1]).toHaveClass("shrink-0", "focus-visible:ring-2");
  });
});
