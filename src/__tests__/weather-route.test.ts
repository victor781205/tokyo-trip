// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/weather/route";

const forecastPayload = [
  {
    reportDatetime: "2026-07-14T17:00:00+09:00",
    timeSeries: [
      {
        timeDefines: [
          "2026-07-14T17:00:00+09:00",
          "2026-07-15T00:00:00+09:00",
        ],
        areas: [{ weatherCodes: ["111", "101"] }],
      },
      {
        timeDefines: [
          "2026-07-14T18:00:00+09:00",
          "2026-07-15T00:00:00+09:00",
        ],
        areas: [{ pops: ["10", "20"] }],
      },
      {
        timeDefines: [
          "2026-07-15T00:00:00+09:00",
          "2026-07-15T09:00:00+09:00",
        ],
        areas: [{ temps: ["25", "34"] }],
      },
    ],
  },
  {
    timeSeries: [
      {
        timeDefines: [
          "2026-07-15T00:00:00+09:00",
          "2026-07-16T00:00:00+09:00",
        ],
        areas: [{ weatherCodes: ["101", "200"], pops: ["", "40"] }],
      },
      {
        areas: [{ tempsMin: ["", "24"], tempsMax: ["", "32"] }],
      },
    ],
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-14T18:30:00+09:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/weather", () => {
  it("fills today's missing forecast temperatures with Tokyo observations", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("forecast/130000.json")) {
        return Response.json(forecastPayload);
      }
      if (url.endsWith("latest_time.txt")) {
        return new Response("2026-07-14T18:20:00+09:00");
      }
      if (url.endsWith("20260714_00.json")) {
        return Response.json({
          "20260714000000": { temp: [25.1, 0] },
          "20260714052000": { temp: [24.2, 0] },
        });
      }
      if (url.endsWith("20260714_12.json")) {
        return Response.json({ "20260714141000": { temp: [33.4, 0] } });
      }
      if (url.endsWith("20260714_18.json")) {
        return Response.json({ "20260714182000": { temp: [30.2, 0] } });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=600");
    expect(body.observationStatus).toBe("ready");
    expect(body.forecast[0]).toMatchObject({
      date: "7/14",
      tempMin: "24.2",
      tempMax: "33.4",
      temperatureNote: "今日低溫、高溫為截至 18:20 實測值",
    });
    expect(body.forecast[1]).toMatchObject({
      date: "7/15",
      tempMin: "25",
      tempMax: "34",
    });
    expect(body.stale).toBe(false);
    expect(body.retrievedAt).toBe("2026-07-14T09:30:00.000Z");
  });

  it("starts at Tokyo's current date after midnight instead of the report date", async () => {
    vi.setSystemTime(new Date("2026-07-15T00:30:00+09:00"));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("forecast/130000.json")) return Response.json(forecastPayload);
      if (url.endsWith("latest_time.txt")) {
        return new Response("2026-07-15T00:20:00+09:00");
      }
      if (url.endsWith("20260715_00.json")) {
        return Response.json({
          "20260715000000": { temp: [25.6, 0] },
          "20260715002000": { temp: [25.2, 0] },
        });
      }
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.forecast[0]).toMatchObject({
      date: "7/15",
      weather: "101",
      tempMin: "25.2",
      tempMax: "34",
      temperatureNote: "今日低溫為截至 00:20 實測值",
    });
    expect(body.forecast).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "7/14" }),
    ]));
    expect(body.stale).toBe(false);
  });

  it("fills only a missing first-day field from same-date JMA weekly data", async () => {
    vi.setSystemTime(new Date("2026-07-15T06:00:00+09:00"));
    const splitTemperaturePayload = structuredClone(forecastPayload);
    splitTemperaturePayload[0].timeSeries[2] = {
      timeDefines: ["2026-07-15T09:00:00+09:00"],
      areas: [{ temps: ["34"] }],
    };
    splitTemperaturePayload[1].timeSeries[1] = {
      areas: [{ tempsMin: ["24", "23"], tempsMax: ["32", "31"] }],
    };

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("forecast/130000.json")) return Response.json(splitTemperaturePayload);
      if (url.endsWith("latest_time.txt")) {
        return new Response("2026-07-15T05:50:00+09:00");
      }
      return Response.json({});
    }));

    const response = await GET();
    const body = await response.json();

    expect(body.observationStatus).toBe("unavailable");
    expect(body.forecast[0]).toMatchObject({
      date: "7/15",
      tempMin: "24",
      tempMax: "34",
    });
  });

  it("keeps an unknown temperature empty when no same-date source value exists", async () => {
    vi.setSystemTime(new Date("2026-07-15T06:00:00+09:00"));
    const incompletePayload = structuredClone(forecastPayload);
    incompletePayload[0].timeSeries[2] = {
      timeDefines: ["2026-07-15T09:00:00+09:00"],
      areas: [{ temps: ["34"] }],
    };
    incompletePayload[1].timeSeries[1] = {
      areas: [{ tempsMin: ["", "23"], tempsMax: ["32", "31"] }],
    };

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("forecast/130000.json")) return Response.json(incompletePayload);
      if (url.endsWith("latest_time.txt")) {
        return new Response("2026-07-15T05:50:00+09:00");
      }
      return Response.json({});
    }));

    const response = await GET();
    const body = await response.json();

    expect(body.forecast[0]).toMatchObject({ tempMin: "--", tempMax: "34" });
  });

  it("marks a JMA report stale after the freshness window", async () => {
    vi.setSystemTime(new Date("2026-07-15T12:00:00+09:00"));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("forecast/130000.json")) return Response.json(forecastPayload);
      if (url.endsWith("latest_time.txt")) {
        return new Response("2026-07-15T11:50:00+09:00");
      }
      return Response.json({});
    }));

    const response = await GET();
    const body = await response.json();

    expect(body.stale).toBe(true);
    expect(body.updatedAt).toBe("2026-07-14T17:00:00+09:00");
  });

  it("returns a retryable gateway error without leaking upstream details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));

    const response = await GET();

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "目前無法取得日本氣象廳資料" });
  });
});
