import { describe, expect, it } from "vitest";
import {
  findTdxFlightForDate,
  matchesAviationStackFlight,
  normalizeFlightStatus,
} from "@/lib/flight-data";

describe("flight data isolation", () => {
  it("selects the matching TDX flight date instead of the first same-number row", () => {
    const rows = [
      { AirlineID: "SJX", FlightNumber: "800", FlightDate: "2026-08-31", Gate: "A1" },
      { AirlineID: "SJX", FlightNumber: "0800", FlightDate: "2026-09-01", Gate: "B2" },
      { AirlineID: "SJX", FlightNumber: "800", FlightDate: "2026-09-02", Gate: "C3" },
    ];

    expect(findTdxFlightForDate(rows, ["SJX"], "800", "2026-09-01")?.Gate).toBe("B2");
  });

  it("requires AviationStack flight number and departure date to match", () => {
    const correct = {
      flight: { number: "805", iata: "JX805" },
      departure: { scheduled: "2026-09-06T20:40:00+09:00" },
    };
    expect(matchesAviationStackFlight(correct, "JX805", "2026-09-06")).toBe(true);
    expect(matchesAviationStackFlight(correct, "JX805", "2026-09-05")).toBe(false);
    expect(matchesAviationStackFlight({ ...correct, flight: { number: "800", iata: "JX800" } }, "JX805", "2026-09-06")).toBe(false);
  });

  it("normalizes TDX cancellation and delay remarks without calling them on-time", () => {
    expect(normalizeFlightStatus("取消CANCELLED")).toBe("cancelled");
    expect(normalizeFlightStatus("延遲 DELAYED")).toBe("delayed");
    expect(normalizeFlightStatus("")).toBe("unknown");
  });
});
