import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("flight info route source-date isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T03:00:00.000Z"));
    vi.stubEnv("AVIATION_STACK_KEY", "test-key");
    vi.stubEnv("TDX_CLIENT_ID", "");
    vi.stubEnv("TDX_CLIENT_SECRET", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("selects the matching TDX FlightDate and rejects a wrong-date arrival independently", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/Departure/TPE")) {
        return jsonResponse([
          {
            AirlineID: "SJX",
            FlightNumber: "800",
            FlightDate: "2026-08-31",
            ScheduleDepartureTime: "2026-08-31T08:30:00+08:00",
            Gate: "OLD",
            Terminal: "9",
            AcType: "B77W",
            DepartureRemark: "取消",
          },
          {
            AirlineID: "SJX",
            FlightNumber: "800",
            FlightDate: "2026-09-01",
            ScheduleDepartureTime: "2026-09-01T08:30:00+08:00",
            Gate: "A8",
            Terminal: "1",
            AcType: "A359",
            DepartureRemark: "航班延遲",
          },
        ]);
      }
      if (url.includes("/Arrival/TPE")) {
        return jsonResponse([
          {
            AirlineID: "SJX",
            FlightNumber: "805",
            FlightDate: "2026-08-31",
            ScheduleArrivalTime: "2026-08-31T23:20:00+08:00",
            Gate: "OLD-ARR",
            Terminal: "9",
            AcType: "B77W",
            ArrivalRemark: "取消",
          },
        ]);
      }
      if (url.includes("api.aviationstack.com")) {
        return jsonResponse({
          data: [
            {
              flight: { number: "805", iata: "JX805" },
              flight_status: "cancelled",
              departure: {
                scheduled: "2026-08-31T20:40:00+09:00",
                gate: "OLD-DEP",
                terminal: "9",
              },
            },
            {
              flight: { number: "805", iata: "JX805" },
              flight_status: "active",
              departure: {
                scheduled: "2026-09-01T20:40:00+09:00",
                gate: "N4",
                terminal: "2",
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/flight-info/route");
    const response = await GET(new Request(
      "http://localhost/api/flight-info?flight=JX800&date=2026-09-01&inboundDate=2026-09-01",
      { headers: { "x-forwarded-for": "route-test-1" } },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.outbound).toMatchObject({
      gate: "A8",
      terminal: "1",
      status: "delayed",
      aircraftModel: "Airbus A350-900",
      aircraftLive: true,
      source: "TDX-Departure",
      sourceDate: "2026-09-01",
      isLive: true,
    });
    expect(body.inbound).toMatchObject({
      depGate: "N4",
      depTerminal: "2",
      depStatus: "active",
      depSource: "AviationStack",
      depSourceDate: "2026-09-01",
      arrGate: "尚未公佈",
      arrTerminal: "1",
      arrStatus: "unknown",
      arrSource: "hardcode-Starlux",
      arrSourceDate: null,
      aircraftModel: "Airbus A330-900neo",
      aircraftIcao: "A339",
      aircraftLive: false,
      aircraftSource: "hardcode-scheduled",
      sourceDate: null,
      isLive: true,
    });
    expect(JSON.stringify(body)).not.toContain("OLD-ARR");
    expect(JSON.stringify(body)).not.toContain("OLD-DEP");

    const aviationUrl = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.includes("api.aviationstack.com"));
    expect(aviationUrl).toContain("flight_date=2026-09-01");
    expect(aviationUrl).toContain("flight_number=805");
  });

  it("does not let a matching TDX arrival date authorize wrong-date AviationStack fields", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/Departure/TPE")) return jsonResponse([]);
      if (url.includes("/Arrival/TPE")) {
        return jsonResponse([
          {
            AirlineID: "SJX",
            FlightNumber: "805",
            FlightDate: "2026-09-01",
            ScheduleArrivalTime: "2026-09-01T23:20:00+08:00",
            Gate: "B3",
            Terminal: "1",
            AcType: "A330-900neo",
            ArrivalRemark: "取消",
          },
        ]);
      }
      if (url.includes("api.aviationstack.com")) {
        return jsonResponse({
          data: [{
            flight: { number: "805", iata: "JX805" },
            flight_status: "delayed",
            departure: {
              scheduled: "2026-08-31T20:40:00+09:00",
              gate: "STALE-GATE",
              terminal: "9",
              delay: 120,
            },
          }],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const { GET } = await import("@/app/api/flight-info/route");
    const response = await GET(new Request(
      "http://localhost/api/flight-info?flight=JX800&date=2026-09-01&inboundDate=2026-09-01",
      { headers: { "x-forwarded-for": "route-test-2" } },
    ));
    const body = await response.json();

    expect(body.outbound).toMatchObject({
      aircraftIcao: "A35K",
      aircraftModel: "Airbus A350-1000",
      aircraftLive: false,
      source: "hardcode-itinerary",
    });
    expect(body.inbound).toMatchObject({
      depGate: "尚未公佈",
      depTerminal: "2",
      depDelay: "",
      depStatus: "unknown",
      depSource: "hardcode-Starlux",
      depSourceDate: null,
      arrGate: "B3",
      arrTerminal: "1",
      arrStatus: "cancelled",
      arrSource: "TDX-Arrival",
      arrSourceDate: "2026-09-01",
      aircraftIcao: "A339",
      aircraftModel: "Airbus A330-900neo",
      aircraftLive: true,
      aircraftSource: "TDX-Arrival",
      sourceDate: null,
      isLive: true,
    });
    expect(JSON.stringify(body)).not.toContain("STALE-GATE");
  });
});
