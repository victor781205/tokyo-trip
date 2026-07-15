import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlightInfo } from "@/components/FlightInfo";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FlightInfo", () => {
  it("does not display terminals, gates, status, or aircraft from a different date", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retrievedAt: new Date().toISOString(),
        requestedDates: { outbound: "2026-09-01", inbound: "2026-09-06" },
        outbound: {
          isLive: true,
          source: "TDX-Departure",
          sourceDate: "2026-08-31",
          gate: "WRONG-GATE",
          status: "cancelled",
          terminal: "9",
          actualTime: "2026-08-31T09:45:00+08:00",
          aircraftModel: "錯日機型",
          aircraftIcao: "BAD",
          aircraftLive: true,
        },
        inbound: {
          isLive: true,
          depSource: "AviationStack",
          depSourceDate: "2026-09-05",
          depGate: "WRONG-DEP-GATE",
          depTerminal: "8",
          depStatus: "cancelled",
          depEstimated: "2026-09-05T22:22:00+09:00",
          arrSource: "TDX-Arrival",
          arrSourceDate: "2026-09-07",
          arrGate: "WRONG-ARR-GATE",
          arrTerminal: "7",
          arrStatus: "cancelled",
          arrActual: "2026-09-07T00:01:00+08:00",
          aircraftSource: "TDX-Arrival",
          aircraftModel: "另一個錯日機型",
          aircraftIcao: "BAD2",
          aircraftLive: true,
        },
      }),
    }));

    render(<FlightInfo />);
    await waitFor(() => expect(screen.queryByText(/正在讀取登機門/)).not.toBeInTheDocument());

    expect(screen.getByText("Scheduled Flight Plan")).toBeInTheDocument();
    expect(screen.queryByText(/WRONG/)).not.toBeInTheDocument();
    expect(screen.queryByText(/錯日機型/)).not.toBeInTheDocument();
    expect(screen.queryByText("已取消")).not.toBeInTheDocument();
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/去程.*起飛時間/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/回程.*時間/)).not.toBeInTheDocument();
    expect(screen.getByText("🏠 飯店退房")).toBeInTheDocument();
    expect(screen.getAllByText("11:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("取行李").length).toBeGreaterThan(0);
    expect(screen.queryByText("🏠 最晚退房")).not.toBeInTheDocument();
    expect(screen.getByText(/星宇航空桃園機場報到櫃檯/)).toHaveTextContent(/起飛前 60 分鐘\s*關閉/);
    expect(screen.queryByText(/起飛前 45 分鐘/)).not.toBeInTheDocument();
    expect(screen.getByText("JR 總武快速直達")).toBeInTheDocument();
    expect(screen.queryByText(/NEX/)).not.toBeInTheDocument();
    expect(screen.getAllByText("16:00").length).toBeGreaterThan(0);
    expect(screen.getByRole("note")).toHaveTextContent(/訂位資料的預定機型.*調度變更.*出發當日/);
  });

  it("shows trusted live actual and estimated clock times", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retrievedAt: new Date().toISOString(),
        requestedDates: { outbound: "2026-09-01", inbound: "2026-09-06" },
        outbound: {
          isLive: true,
          source: "TDX-Departure",
          sourceDate: "2026-09-01",
          gate: "B2",
          status: "departed",
          terminal: "1",
          actualTime: "2026-09-01T08:42:00+08:00",
        },
        inbound: {
          isLive: true,
          depSource: "AviationStack",
          depSourceDate: "2026-09-06",
          depTerminal: "2",
          depStatus: "scheduled",
          depEstimated: "2026-09-06T20:55:00+09:00",
          arrSource: "TDX-Arrival",
          arrSourceDate: "2026-09-06",
          arrTerminal: "1",
          arrStatus: "arrived",
          arrActual: "2026-09-06T23:31:00+08:00",
        },
      }),
    }));

    render(<FlightInfo />);

    await waitFor(() => expect(screen.queryByText(/正在讀取登機門/)).not.toBeInTheDocument());
    expect(screen.getByLabelText("去程實際起飛時間")).toHaveTextContent("實際 08:42");
    expect(screen.getByLabelText("回程預估起飛時間")).toHaveTextContent("預估 20:55");
    expect(screen.getByLabelText("回程實際抵達時間")).toHaveTextContent("實際 23:31");
  });

  it("consumes the outbound estimatedTime field returned by TDX", async () => {
    const retrievedAt = new Date().toISOString();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retrievedAt,
        requestedDates: { outbound: "2026-09-01", inbound: "2026-09-06" },
        outbound: {
          isLive: true,
          source: "TDX-Departure",
          sourceDate: "2026-09-01",
          gate: "B2",
          status: "scheduled",
          terminal: "1",
          estimatedTime: "2026-09-01T08:47:00+08:00",
        },
        inbound: { isLive: false },
      }),
    }));

    render(<FlightInfo />);

    await waitFor(() => expect(screen.queryByText(/正在讀取登機門/)).not.toBeInTheDocument());
    expect(screen.getByLabelText("去程預估起飛時間")).toHaveTextContent("預估 08:47");
    expect(screen.getByRole("status")).toHaveTextContent(/TDX FIDS.*剛剛更新/);
  });

  it("keeps cached data visible but removes every LIVE claim when it is stale", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-01T03:20:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retrievedAt: "2026-09-01T03:00:00.000Z",
        requestedDates: { outbound: "2026-09-01", inbound: "2026-09-06" },
        outbound: {
          isLive: true,
          source: "TDX-Departure",
          sourceDate: "2026-09-01",
          gate: "B2",
          status: "departed",
          terminal: "1",
          actualTime: "2026-09-01T08:42:00+08:00",
        },
        inbound: { isLive: false },
      }),
    }));

    render(<FlightInfo />);

    await waitFor(() => expect(screen.queryByText(/正在讀取登機門/)).not.toBeInTheDocument());
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("去程實際起飛時間")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "資料已過期，不作 LIVE 判定 · 20 分鐘前更新",
    );
  });

  it("refreshes with no-store when connectivity returns", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retrievedAt: new Date().toISOString(),
        requestedDates: { outbound: "2026-09-01", inbound: "2026-09-06" },
        outbound: { isLive: false },
        inbound: { isLive: false },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FlightInfo />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/flight-info?"),
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
