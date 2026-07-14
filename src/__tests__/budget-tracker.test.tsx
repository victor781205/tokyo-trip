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
});
