import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Itinerary } from "@/components/Itinerary";

const mocks = vi.hoisted(() => ({
  itinerary: {} as Record<string, { title: string; date: string; activities: Array<{ time: string; name: string; desc: string; tag: string; syncId?: string; sourceId?: string }> }>,
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
      activities: [{ time: "10:00", name: "原始活動", desc: "第一站", tag: "景點", syncId: "activity:day1-original" }],
    },
    day2: {
      title: "🗼 Day 2 — 市區散步",
      date: "9/2",
      activities: [{ time: "09:00", name: "第二天活動", desc: "第二站", tag: "景點", syncId: "activity:day2-original" }],
    },
  };
}

beforeEach(() => {
  mocks.itinerary = twoDayItinerary();
  mocks.updateItinerary.mockReset().mockImplementation((value: typeof mocks.itinerary | ((previous: typeof mocks.itinerary) => typeof mocks.itinerary)) => {
    mocks.itinerary = typeof value === "function" ? value(mocks.itinerary) : value;
  });
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
    mocks.itinerary = {
      ...mocks.itinerary,
      day1: {
        ...mocks.itinerary.day1,
        activities: [{ ...mocks.itinerary.day1.activities[0], syncId: undefined }],
      },
    };
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
    const updated = mocks.itinerary;
    expect(originalDay.activities).toBe(originalActivities);
    expect(originalActivities).toHaveLength(1);
    expect(originalActivities[0].syncId).toBeUndefined();
    expect(updated.day1).not.toBe(originalDay);
    expect(updated.day1.activities).not.toBe(originalActivities);
    expect(updated.day1.activities[0]).toMatchObject({ time: "08:30", name: "新活動" });
    expect(updated.day1.activities.every((activity) => activity.syncId)).toBe(true);
  });

  it("edits the intended activity by sync identity after a remote reorder", () => {
    const { rerender } = render(<Itinerary />);
    fireEvent.click(screen.getAllByRole("button", { name: "編輯「原始活動」" })[0]);

    const original = mocks.itinerary.day1.activities[0];
    const remoteActivity = {
      time: "08:00",
      name: "另一台裝置新增",
      desc: "同步進來的活動",
      tag: "景點",
      syncId: "activity:remote-added",
    };
    mocks.itinerary = {
      ...mocks.itinerary,
      day1: { ...mocks.itinerary.day1, activities: [remoteActivity, original] },
    };
    rerender(<Itinerary />);

    fireEvent.change(screen.getByLabelText(/景點或店名/), { target: { value: "正確編輯原始活動" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));

    expect(mocks.itinerary.day1.activities.find((activity) => activity.syncId === "activity:remote-added")?.name).toBe("另一台裝置新增");
    expect(mocks.itinerary.day1.activities.find((activity) => activity.syncId === "activity:day1-original")?.name).toBe("正確編輯原始活動");
  });

  it("shows a conflict and does not resurrect an activity removed during editing", () => {
    const { rerender } = render(<Itinerary />);
    fireEvent.click(screen.getAllByRole("button", { name: "編輯「原始活動」" })[0]);

    const remoteActivity = {
      time: "08:00",
      name: "遠端保留活動",
      desc: "最新資料",
      tag: "景點",
      syncId: "activity:remote-kept",
    };
    mocks.itinerary = {
      ...mocks.itinerary,
      day1: { ...mocks.itinerary.day1, activities: [remoteActivity] },
    };
    rerender(<Itinerary />);

    fireEvent.change(screen.getByLabelText(/景點或店名/), { target: { value: "不應復活" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/其他裝置.*未儲存/);
    expect(screen.getByRole("dialog", { name: "編輯計畫" })).toBeInTheDocument();
    expect(mocks.itinerary.day1.activities).toEqual([remoteActivity]);
  });

  it("deletes by sync identity against the latest itinerary after confirmation", async () => {
    let resolveConfirm!: (confirmed: boolean) => void;
    mocks.confirm.mockReturnValueOnce(new Promise<boolean>((resolve) => {
      resolveConfirm = resolve;
    }));
    const { rerender } = render(<Itinerary />);

    fireEvent.click(screen.getAllByRole("button", { name: "刪除「原始活動」" })[0]);
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));

    const original = mocks.itinerary.day1.activities[0];
    const remoteActivity = {
      time: "08:00",
      name: "確認期間同步進來",
      desc: "不可被舊快照覆寫",
      tag: "景點",
      syncId: "activity:remote-during-confirm",
    };
    mocks.itinerary = {
      ...mocks.itinerary,
      day1: { ...mocks.itinerary.day1, activities: [remoteActivity, original] },
    };
    rerender(<Itinerary />);

    await act(async () => resolveConfirm(true));
    await waitFor(() => expect(mocks.itinerary.day1.activities).toEqual([remoteActivity]));
  });

  it("reports a delete conflict without overwriting the latest day", async () => {
    let resolveConfirm!: (confirmed: boolean) => void;
    mocks.confirm.mockReturnValueOnce(new Promise<boolean>((resolve) => {
      resolveConfirm = resolve;
    }));
    const { rerender } = render(<Itinerary />);

    fireEvent.click(screen.getAllByRole("button", { name: "刪除「原始活動」" })[0]);
    const remoteActivity = {
      time: "08:00",
      name: "遠端唯一活動",
      desc: "保持不變",
      tag: "景點",
      syncId: "activity:remote-only",
    };
    mocks.itinerary = {
      ...mocks.itinerary,
      day1: { ...mocks.itinerary.day1, activities: [remoteActivity] },
    };
    rerender(<Itinerary />);

    await act(async () => resolveConfirm(true));
    await waitFor(() => expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({
      title: "行程已在其他裝置變更",
    })));
    expect(mocks.itinerary.day1.activities).toEqual([remoteActivity]);
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

  it("keeps export actions in a compact More disclosure so the first itinerary stays prominent", () => {
    render(<Itinerary />);

    const more = screen.getByText("更多").closest("summary");
    expect(more).not.toBeNull();
    expect(more?.parentElement).not.toHaveAttribute("open");
    expect(screen.getAllByText("原始活動").length).toBeGreaterThan(0);

    fireEvent.click(more!);
    expect(more?.parentElement).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "匯出圖片" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "匯出 ICS" })).toBeInTheDocument();
  });

  it("uses a positive suggested budget and rejects zero-yen expenses", () => {
    render(<Itinerary />);

    fireEvent.click(screen.getAllByRole("button", { name: "將「原始活動」加入預算" })[0]);
    const amount = screen.getByLabelText(/金額（日圓 ¥，最低 ¥1）/);
    expect(amount).toHaveValue(1000);
    expect(amount).toHaveAttribute("min", "1");

    fireEvent.change(amount, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "確認加入" }));
    expect(screen.getByRole("alert")).toHaveTextContent("0 元不會列入支出");
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(mocks.updateBudgetItems).not.toHaveBeenCalled();

    fireEvent.change(amount, { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "確認加入" }));
    const updater = mocks.updateBudgetItems.mock.calls[0][0] as (items: unknown[]) => Array<Record<string, unknown>>;
    expect(updater([])[0]).toEqual(expect.objectContaining({ amount: 1200, name: "原始活動" }));
  });
});
