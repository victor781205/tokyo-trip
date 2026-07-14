import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetTracker } from "@/components/BudgetTracker";
import { useTripState } from "@/hooks/useTripState";

vi.mock("@/hooks/useTripState", () => ({ useTripState: vi.fn() }));
vi.mock("@/context/DialogContext", () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

const mockedUseTripState = vi.mocked(useTripState);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function setTripState(overrides: Record<string, unknown> = {}) {
  mockedUseTripState.mockReturnValue({
    isLoaded: true,
    budgetItems: [],
    updateBudgetItems: vi.fn(),
    budgetLimit: 1000,
    setBudgetLimit: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useTripState>);
}

describe("BudgetTracker", () => {
  it("keeps the warning visible and shows the exact over-budget amount", () => {
    setTripState({
      budgetItems: [{ id: 1, name: "住宿", amount: 1200, category: "hotel", date: "2026/7/10" }],
    });
    render(<BudgetTracker />);

    expect(screen.getByText("超支")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("已超支 ¥200");
  });

  it("rejects negative expenses instead of reducing the spent total", () => {
    const updateBudgetItems = vi.fn();
    setTripState({ updateBudgetItems });
    render(<BudgetTracker />);

    fireEvent.change(screen.getByLabelText("項目名稱"), { target: { value: "錯誤支出" } });
    fireEvent.change(screen.getByLabelText("金額（日圓）"), { target: { value: "-50" } });
    fireEvent.submit(screen.getByLabelText("金額（日圓）").closest("form")!);

    expect(updateBudgetItems).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("請輸入 1～999,999,999 的有效金額");
  });

  it("rejects amounts beyond the supported whole-yen boundary", () => {
    const updateBudgetItems = vi.fn();
    setTripState({ updateBudgetItems });
    render(<BudgetTracker />);

    fireEvent.change(screen.getByLabelText("項目名稱"), { target: { value: "不合理金額" } });
    fireEvent.change(screen.getByLabelText("金額（日圓）"), { target: { value: "1000000000" } });
    fireEvent.submit(screen.getByLabelText("金額（日圓）").closest("form")!);

    expect(updateBudgetItems).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("999,999,999");
  });

  it("counts unknown synced categories under other instead of losing them from the chart", () => {
    setTripState({
      budgetItems: [{ id: 1, name: "舊資料", amount: 300, category: "legacy-value", date: "2026/7/10" }],
    });
    render(<BudgetTracker />);

    const chart = screen.getByText("類別支出比例").parentElement;
    expect(chart).toHaveTextContent("其他");
    expect(chart).toHaveTextContent("¥300");
  });

  it("labels corrupted synced amounts and excludes them from totals", () => {
    setTripState({
      budgetItems: [
        { id: 1, name: "錯誤舊資料", amount: -100, category: "food", date: "2026/7/10" },
        { id: 2, name: "有效資料", amount: 200, category: "food", date: "2026/7/10" },
      ],
    });
    render(<BudgetTracker />);

    expect(screen.getByText("無效金額")).toBeInTheDocument();
    expect(screen.getByText("已花").parentElement).toHaveTextContent("¥200");
  });

  it("does not multiply fixed hotel costs into every remaining trip day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T03:00:00.000Z"));
    setTripState({
      budgetLimit: 5_000,
      budgetItems: [
        { id: 1, name: "入住時付住宿費", amount: 600, category: "hotel", date: "2026/9/1" },
        { id: 2, name: "第一天餐費", amount: 100, category: "food", date: "2026/9/1" },
      ],
    });
    render(<BudgetTracker />);

    expect(screen.getByText("預計總支出").parentElement).toHaveTextContent("¥900");
  });

  it("adds an expense with an actual trip date and split metadata", () => {
    const updateBudgetItems = vi.fn();
    setTripState({ updateBudgetItems });
    render(<BudgetTracker />);

    fireEvent.change(screen.getByLabelText("項目名稱"), { target: { value: "兩人晚餐" } });
    fireEvent.change(screen.getByLabelText("金額（日圓）"), { target: { value: "4600" } });
    fireEvent.click(screen.getByRole("button", { name: "D2" }));
    fireEvent.change(screen.getByLabelText("付款人"), { target: { value: "毓寧" } });
    fireEvent.submit(screen.getByLabelText("金額（日圓）").closest("form")!);

    const updater = updateBudgetItems.mock.calls[0][0] as (items: unknown[]) => Array<Record<string, unknown>>;
    expect(updater([])[0]).toEqual(expect.objectContaining({
      name: "兩人晚餐",
      amount: 4600,
      date: "2026-09-02",
      payer: "毓寧",
      participants: ["Victor", "毓寧"],
    }));
  });

  it("edits an existing expense without changing its id", () => {
    const updateBudgetItems = vi.fn();
    const item = { id: 9, syncId: "budget-stable-9", name: "拉麵", amount: 1200, category: "food", date: "2026-09-01" };
    setTripState({ budgetItems: [item], updateBudgetItems });
    render(<BudgetTracker />);

    fireEvent.click(screen.getByRole("button", { name: "編輯「拉麵」" }));
    fireEvent.change(screen.getByLabelText("金額（日圓）"), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存支出變更" }));

    const updater = updateBudgetItems.mock.calls[0][0] as (items: typeof item[]) => typeof item[];
    expect(updater([item])[0]).toEqual(expect.objectContaining({ id: 9, syncId: "budget-stable-9", amount: 1500 }));
  });

  it("offers undo after deletion", async () => {
    const updateBudgetItems = vi.fn();
    const item = { id: 3, name: "車票", amount: 500, category: "transport", date: "2026-09-01" };
    setTripState({ budgetItems: [item], updateBudgetItems });
    render(<BudgetTracker />);

    fireEvent.click(screen.getByRole("button", { name: "刪除「車票」" }));
    expect(await screen.findByRole("status")).toHaveTextContent("已刪除「車票」");
    fireEvent.click(screen.getByRole("button", { name: "復原" }));

    expect(updateBudgetItems).toHaveBeenCalledTimes(2);
    const restore = updateBudgetItems.mock.calls[1][0] as (items: typeof item[]) => typeof item[];
    expect(restore([])).toEqual([item]);
  });

  it("calculates a settlement only from expenses with explicit split metadata", () => {
    setTripState({
      budgetItems: [
        { id: 1, name: "兩人晚餐", amount: 4000, category: "food", date: "2026-09-01", payer: "Victor", participants: ["Victor", "毓寧"] },
        { id: 2, name: "舊資料", amount: 999, category: "other", date: "2026-09-01" },
      ],
    });
    render(<BudgetTracker />);

    expect(screen.getByText("毓寧 → Victor").parentElement).toHaveTextContent("¥2,000");
    expect(screen.getByText("未設定分攤")).toBeInTheDocument();
  });
});
