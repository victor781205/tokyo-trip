import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ReservationChecklist,
  RESERVATION_TASKS,
  RESERVATION_TASKS_BY_DEADLINE,
} from "@/components/ReservationChecklist";

const mocks = vi.hoisted(() => ({
  updatePackingList: vi.fn(),
  packingList: [] as Array<{ id: string; name: string; packed: boolean; category: string }>,
}));

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({
    isLoaded: true,
    packingList: mocks.packingList,
    updatePackingList: mocks.updatePackingList,
  }),
}));

describe("ReservationChecklist", () => {
  beforeEach(() => {
    mocks.updatePackingList.mockClear();
    mocks.packingList = [];
  });

  it("shows the high-value reservations with official links and no sensitive upload", () => {
    render(<ReservationChecklist />);

    expect(screen.getByText("SHIBUYA SKY 指定時段門票")).toBeInTheDocument();
    expect(screen.getByText("teamLab Planets 指定時段門票")).toBeInTheDocument();
    expect(screen.getByText("吉卜力美術館 9 月門票")).toBeInTheDocument();
    expect(screen.getByText(/不會上傳護照、票券 QR Code/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "官方售票說明" })).toHaveAttribute("href", "https://www.ghibli-museum.jp/en/tickets/");
  });

  it("stores completion in the existing synchronized packing list", () => {
    render(<ReservationChecklist />);

    fireEvent.click(screen.getByRole("button", { name: "標記「吉卜力美術館 9 月門票」為完成" }));
    const updater = mocks.updatePackingList.mock.calls[0][0] as (items: unknown[]) => Array<Record<string, unknown>>;
    expect(updater([])).toEqual([
      expect.objectContaining({
        id: "reservation:ghibli-museum",
        packed: true,
        category: "預約與門票",
      }),
    ]);
  });

  it("can add every reservation to the preparation checklist without duplicates", () => {
    render(<ReservationChecklist />);
    fireEvent.click(screen.getByRole("button", { name: "加入行前清單" }));

    const updater = mocks.updatePackingList.mock.calls[0][0] as (items: Array<{ id: string }>) => Array<{ id: string }>;
    const existing = [{ id: RESERVATION_TASKS[0].id }];
    const next = updater(existing);
    expect(next).toHaveLength(RESERVATION_TASKS.length);
    expect(new Set(next.map((item) => item.id)).size).toBe(RESERVATION_TASKS.length);
  });

  it("shows tasks in deadline order", () => {
    const { container } = render(<ReservationChecklist />);
    const titles = Array.from(container.querySelectorAll("article h3"), (heading) => heading.textContent);

    expect(titles).toEqual(RESERVATION_TASKS_BY_DEADLINE.map((task) => task.title));
    expect(titles[0]).toBe("teamLab Planets 指定時段門票");
    expect(titles.at(-1)).toBe("JX805 回程線上報到");
  });

  it("reports how many tasks remain and disables add-all once every task is stored", () => {
    mocks.packingList = RESERVATION_TASKS.slice(0, 2).map((task) => ({
      id: task.id,
      name: task.title,
      packed: false,
      category: "預約與門票",
    }));
    const { rerender } = render(<ReservationChecklist />);

    expect(screen.getByRole("button", { name: `加入剩餘 ${RESERVATION_TASKS.length - 2} 項` })).toBeEnabled();

    mocks.packingList = RESERVATION_TASKS.map((task) => ({
      id: task.id,
      name: task.title,
      packed: false,
      category: "預約與門票",
    }));
    rerender(<ReservationChecklist />);

    expect(screen.getByRole("button", { name: "已加入行前清單" })).toBeDisabled();
  });
});
