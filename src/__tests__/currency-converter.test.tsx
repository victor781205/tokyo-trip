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
    expect(twd).toHaveClass("pr-20", "sm:pr-24");
    expect(jpy).toHaveClass("pr-20", "sm:pr-24");

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

  it("recomputes the opposite side from the last edited currency after a rate refresh", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rate: 5,
          sourceUpdatedAt: "2026-07-10T00:00:00.000Z",
          retrievedAt: "2026-07-10T01:00:00.000Z",
          source: "test",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rate: 4,
          sourceUpdatedAt: "2026-07-11T00:00:00.000Z",
          retrievedAt: "2026-07-11T01:00:00.000Z",
          source: "test",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rate: 6,
          sourceUpdatedAt: "2026-07-12T00:00:00.000Z",
          retrievedAt: "2026-07-12T01:00:00.000Z",
          source: "test",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<CurrencyConverter />);
    const twd = await screen.findByLabelText("新台幣 TWD");
    const jpy = screen.getByLabelText("日圓 JPY");
    await waitFor(() => expect(jpy).toHaveValue(5000));

    fireEvent.change(jpy, { target: { value: "10000" } });
    expect(twd).toHaveValue(2000);
    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() => expect(twd).toHaveValue(2500));
    expect(jpy).toHaveValue(10000);

    fireEvent.change(twd, { target: { value: "3000" } });
    expect(jpy).toHaveValue(12000);
    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() => expect(jpy).toHaveValue(18000));
    expect(twd).toHaveValue(3000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
