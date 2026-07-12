import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CurrencyConverter } from "@/components/CurrencyConverter";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CurrencyConverter", () => {
  it("keeps fixed TWD/JPY units and converts both directions without a lossy swap", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rate: 5,
        sourceUpdatedAt: "2026-07-10T00:00:00.000Z",
        retrievedAt: "2026-07-10T01:00:00.000Z",
        source: "ExchangeRate-API Open Access",
      }),
    }));

    render(<CurrencyConverter />);
    const twd = await screen.findByLabelText("新台幣 TWD");
    const jpy = screen.getByLabelText("日圓 JPY");
    await waitFor(() => expect(jpy).toHaveValue(5000));

    expect(screen.queryByRole("button", { name: "交換" })).not.toBeInTheDocument();
    fireEvent.change(twd, { target: { value: "2000" } });
    expect(jpy).toHaveValue(10000);
  });

  it("checks HTTP failures before using a response payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Too many requests" }),
    }));

    render(<CurrencyConverter />);
    expect(await screen.findByText(/網路錯誤，顯示預設匯率/)).toBeInTheDocument();
    expect(screen.getByLabelText("日圓 JPY")).toHaveValue(4650);
  });
});
