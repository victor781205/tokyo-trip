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
        requestedDates: { outbound: "2026-09-01", inbound: "2026-09-06" },
        outbound: {
          isLive: true,
          source: "TDX-Departure",
          sourceDate: "2026-08-31",
          gate: "WRONG-GATE",
          status: "cancelled",
          terminal: "9",
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
          arrSource: "TDX-Arrival",
          arrSourceDate: "2026-09-07",
          arrGate: "WRONG-ARR-GATE",
          arrTerminal: "7",
          arrStatus: "cancelled",
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
    expect(screen.getByText("🏠 飯店退房")).toBeInTheDocument();
    expect(screen.getAllByText("11:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("取行李").length).toBeGreaterThan(0);
    expect(screen.queryByText("🏠 最晚退房")).not.toBeInTheDocument();
  });
});
