import { describe, expect, it } from "vitest";
import {
  getJmaWeatherKind,
  getJmaWeatherLabel,
  parseTokyoForecast,
  parseTokyoForecastResponse,
  parseTokyoObservedTemperature,
} from "@/lib/jma-forecast";

const fixture = [
  {
    timeSeries: [
      {
        timeDefines: ["2026-07-10T11:00:00+09:00"],
        areas: [{ weatherCodes: ["100"] }],
      },
      {
        areas: [{ pops: ["10"] }],
      },
      {
        timeDefines: [
          "2026-07-10T09:00:00+09:00",
          "2026-07-10T00:00:00+09:00",
          "2026-07-11T00:00:00+09:00",
          "2026-07-11T09:00:00+09:00",
        ],
        areas: [{ temps: ["32", "32", "23", "31"] }],
      },
    ],
  },
  {
    timeSeries: [
      {
        timeDefines: [
          "2026-07-11T00:00:00+09:00",
          "2026-07-12T00:00:00+09:00",
        ],
        areas: [{ weatherCodes: ["111", "200"], pops: ["", "40"] }],
      },
      {
        areas: [{ tempsMin: ["", "23"], tempsMax: ["", "30"] }],
      },
    ],
  },
];

describe("parseTokyoForecast", () => {
  it("does not mislabel current-day time slots as min/max", () => {
    const forecast = parseTokyoForecast(fixture);
    expect(forecast[0]).toEqual({
      date: "7/10",
      weather: "100",
      tempMax: "32",
      tempMin: "--",
      pop: "10",
    });
  });

  it("uses weekly tempsMin and tempsMax for later days", () => {
    const forecast = parseTokyoForecast(fixture);
    expect(forecast[1]).toMatchObject({
      date: "7/11",
      tempMin: "23",
      tempMax: "31",
    });
    expect(forecast[2]).toMatchObject({
      date: "7/12",
      tempMin: "23",
      tempMax: "30",
      pop: "40",
    });
  });

  it("does not assign tomorrow's short-term temperature to today", () => {
    const afternoonFixture = structuredClone(fixture);
    afternoonFixture[0].timeSeries[2] = {
      timeDefines: [
        "2026-07-11T00:00:00+09:00",
        "2026-07-11T09:00:00+09:00",
      ],
      areas: [{ temps: ["23", "31"] }],
    };
    const forecast = parseTokyoForecast(afternoonFixture);
    expect(forecast[0]).toMatchObject({ tempMin: "--", tempMax: "--" });
    expect(forecast[1]).toMatchObject({ tempMin: "23", tempMax: "31" });
  });

  it("fills the first day's missing high and low from Tokyo AMeDAS observations", () => {
    const eveningFixture = structuredClone(fixture);
    eveningFixture[0].timeSeries[2] = {
      timeDefines: [
        "2026-07-11T00:00:00+09:00",
        "2026-07-11T09:00:00+09:00",
      ],
      areas: [{ temps: ["23", "31"] }],
    };
    const observed = parseTokyoObservedTemperature([
      {
        "20260710000000": { temp: [25.4, 0] },
        "20260710053000": { temp: [23.8, 0] },
      },
      {
        "20260710141000": { temp: [33.2, 0] },
        "20260710172000": { temp: [30.1, 0] },
        "20260710173000": { temp: [99, 5] },
      },
    ], "2026-07-10");

    const forecast = parseTokyoForecast(eveningFixture, observed);
    expect(forecast[0]).toMatchObject({
      date: "7/10",
      tempMin: "23.8",
      tempMax: "33.2",
      temperatureNote: "今日低溫、高溫為截至 17:20 實測值",
    });
    expect(forecast[1]).toMatchObject({ tempMin: "23", tempMax: "31" });
  });

  it("validates the app weather response before rendering it", () => {
    expect(parseTokyoForecastResponse({
      forecast: [
        { date: "7/10", weather: "100", tempMax: "33", tempMin: "24", pop: "10" },
        { date: "", weather: "200", tempMax: "30", tempMin: "22", pop: "20" },
      ],
    })).toEqual([
      { date: "7/10", weather: "100", tempMax: "33", tempMin: "24", pop: "10" },
    ]);
  });

  it("groups short-term precipitation slots by date and keeps each day's maximum", () => {
    const slotFixture = structuredClone(fixture) as unknown as Array<{ timeSeries: unknown[] }>;
    slotFixture[0].timeSeries[1] = {
      timeDefines: [
        "2026-07-10T06:00:00+09:00",
        "2026-07-10T12:00:00+09:00",
        "2026-07-10T18:00:00+09:00",
        "2026-07-11T00:00:00+09:00",
        "2026-07-11T06:00:00+09:00",
      ],
      areas: [{ pops: ["10", "50", "30", "20", "60"] }],
    };

    const forecast = parseTokyoForecast(slotFixture);
    expect(forecast[0].pop).toBe("50");
    expect(forecast[1].pop).toBe("60");
  });

  it("does not leak tomorrow's first precipitation slot into today", () => {
    const futureOnlyFixture = structuredClone(fixture) as unknown as Array<{ timeSeries: unknown[] }>;
    futureOnlyFixture[0].timeSeries[1] = {
      timeDefines: ["2026-07-11T00:00:00+09:00"],
      areas: [{ pops: ["80"] }],
    };

    const forecast = parseTokyoForecast(futureOnlyFixture);
    expect(forecast[0].pop).toBe("--");
    expect(forecast[1].pop).toBe("80");
  });

  it("classifies JMA 400-series weather as snow instead of thunder", () => {
    expect(getJmaWeatherKind("400")).toBe("snow");
    expect(getJmaWeatherKind("450")).toBe("snow");
    expect(getJmaWeatherLabel("400")).toBe("雪");
  });
});
