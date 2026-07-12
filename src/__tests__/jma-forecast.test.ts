import { describe, expect, it } from "vitest";
import { parseTokyoForecast } from "@/lib/jma-forecast";

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
});
