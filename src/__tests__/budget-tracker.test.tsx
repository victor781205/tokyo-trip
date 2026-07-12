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
    expect(screen.getByRole("alert")).toHaveTextContent("請輸入大於 0 的有效金額");
  });
});
