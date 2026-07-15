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
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("selects only the matching outbound TDX FlightDate", async () => {
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
            EstimatedDepartureTime: "2026-09-01T08:45:00+08:00",
            Gate: "A8",
            Terminal: "1",
            AcType: "A359",
            DepartureRemark: "航班延遲",
          },
        ]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/flight-info/route");
    const response = await GET(new Request(
      "http://localhost/api/flight-info?flight=JX800&date=2026-09-01&inboundDate=2026-09-06",
      { headers: { "x-forwarded-for": "route-test-1" } },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.outbound).toMatchObject({
      gate: "A8",
      terminal: "1",
      status: "delayed",
      estimatedTime: "2026-09-01T08:45:00+08:00",
      aircraftIcao: "A35K",
      aircraftModel: "Airbus A350-1000",
      aircraftLive: false,
      source: "TDX-Departure",
      sourceDate: "2026-09-01",
      isLive: true,
    });
    expect(body.retrievedAt).toBe("2026-09-01T03:00:00.000Z");
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(body.inbound).toMatchObject({
      depGate: "尚未公佈",
      depTerminal: "2",
      depStatus: "unknown",
      depSource: "hardcode-Starlux",
      depSourceDate: null,
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
      isLive: false,
    });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/Arrival/TPE"), expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("api.aviationstack.com"), expect.anything());
  });

  it("does not let a matching TDX arrival date authorize wrong-date AviationStack fields", async () => {
    vi.setSystemTime(new Date("2026-09-06T03:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/Arrival/TPE")) {
        return jsonResponse([
          {
            AirlineID: "SJX",
            FlightNumber: "805",
            FlightDate: "2026-09-06",
            ScheduleArrivalTime: "2026-09-06T23:20:00+08:00",
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
              scheduled: "2026-09-05T20:40:00+09:00",
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
      "http://localhost/api/flight-info?flight=JX800&date=2026-09-01&inboundDate=2026-09-06",
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
      arrSourceDate: "2026-09-06",
      aircraftIcao: "A339",
      aircraftModel: "Airbus A330-900neo",
      aircraftLive: true,
      aircraftSource: "TDX-Arrival",
      sourceDate: null,
      isLive: true,
    });
    expect(JSON.stringify(body)).not.toContain("STALE-GATE");
  });

  it("gets one TDX token while AviationStack starts without waiting for it", async () => {
    vi.setSystemTime(new Date("2026-09-06T03:00:00.000Z"));
    vi.stubEnv("TDX_CLIENT_ID", "client-id");
    vi.stubEnv("TDX_CLIENT_SECRET", "client-secret");

    let resolveToken!: (response: Response) => void;
    const tokenResponse = new Promise<Response>((resolve) => {
      resolveToken = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/protocol/openid-connect/token")) return tokenResponse;
      if (url.includes("api.aviationstack.com")) return Promise.resolve(jsonResponse({ data: [] }));
      if (url.includes("/Arrival/TPE")) return Promise.resolve(jsonResponse([]));
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/flight-info/route");
    const responsePromise = GET(new Request(
      "http://localhost/api/flight-info?flight=JX800&date=2026-09-01&inboundDate=2026-09-06",
      { headers: { "x-forwarded-for": "parallel-upstreams" } },
    ));

    await Promise.resolve();
    expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/protocol/openid-connect/token"),
    )).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("api.aviationstack.com"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/Arrival/TPE"),
      expect.anything(),
    );

    resolveToken(jsonResponse({ access_token: "shared-token" }));
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/Arrival/TPE"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer shared-token" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("aborts a hung upstream and returns scheduled fallback before the PWA timeout", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let requestWasAborted = false;
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("/Departure/TPE")) throw new Error(`Unexpected fetch: ${url}`);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          requestWasAborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }));

    const { GET } = await import("@/app/api/flight-info/route");
    const responsePromise = GET(new Request(
      "http://localhost/api/flight-info?flight=JX800&date=2026-09-01&inboundDate=2026-09-06",
      { headers: { "x-forwarded-for": "upstream-timeout" } },
    ));
    await vi.advanceTimersByTimeAsync(4_200);
    const response = await responsePromise;
    const body = await response.json();

    expect(requestWasAborted).toBe(true);
    expect(response.status).toBe(200);
    expect(body.outbound).toMatchObject({
      isLive: false,
      source: "hardcode-itinerary",
      aircraftModel: "Airbus A350-1000",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "TDX Flight API Error:",
      expect.any(DOMException),
    );
    const timeoutError = errorSpy.mock.calls[0]?.[1] as DOMException;
    expect(["AbortError", "TimeoutError"]).toContain(timeoutError.name);
  });

  it("rejects any flight, date, duplicate, or extra query outside this trip", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("@/app/api/flight-info/route");
    const invalidQueries = [
      "flight=JX805&date=2026-09-01&inboundDate=2026-09-06",
      "flight=JX900&date=2026-09-01&inboundDate=2026-09-06",
      "flight=JX800&date=2026-09-02&inboundDate=2026-09-06",
      "flight=JX800&date=2026-09-01&inboundDate=2026-09-05",
      "flight=JX800&date=2026-99-99&inboundDate=2026-09-06",
      "flight=JX800&flight=JX805&date=2026-09-01&inboundDate=2026-09-06",
      "flight=JX800&date=2026-09-01&inboundDate=2026-09-06&debug=true",
    ];

    for (const [index, query] of invalidQueries.entries()) {
      const response = await GET(new Request(`http://localhost/api/flight-info?${query}`, {
        headers: { "x-forwarded-for": `invalid-query-${index}` },
      }));
      expect(response.status).toBe(400);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the exact trip pair when optional query parameters are omitted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
    const { GET } = await import("@/app/api/flight-info/route");
    const response = await GET(new Request("http://localhost/api/flight-info", {
      headers: { "x-forwarded-for": "default-trip-pair" },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      flight: "JX800",
      requestedDates: { outbound: "2026-09-01", inbound: "2026-09-06" },
    });
  });
});
