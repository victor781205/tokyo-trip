import { describe, expect, it } from "vitest";
import {
  getDateInTimeZone,
  getTripCountdownParts,
  getTripTimelineState,
  isFlightSourceForDate,
  shouldFetchLiveFlight,
} from "@/lib/trip-dates";

describe("trip date helpers", () => {
  it("matches live flight data only to the requested travel date", () => {
    expect(isFlightSourceForDate("2026-09-01T08:30", "2026-09-01")).toBe(true);
    expect(isFlightSourceForDate("2026-07-09T08:30", "2026-09-01")).toBe(false);
    expect(isFlightSourceForDate("", "2026-09-01")).toBe(false);
  });

  it("uses a 48-hour window around the travel date for live flight fetch", () => {
    const travelDay = new Date("2026-08-31T15:30:00.000Z"); // Asia/Tokyo 2026-09-01
    expect(getDateInTimeZone(travelDay, "Asia/Tokyo")).toBe("2026-09-01");
    expect(shouldFetchLiveFlight("2026-09-01", travelDay, "Asia/Tokyo")).toBe(true);
    // 前一天仍在 48h 內
    expect(shouldFetchLiveFlight("2026-09-01", new Date("2026-08-30T15:30:00.000Z"), "Asia/Tokyo")).toBe(true);
    // 遠早於旅程日
    expect(shouldFetchLiveFlight("2026-09-01", new Date("2026-07-09T00:00:00.000Z"), "Asia/Tokyo")).toBe(false);
    // 旅程後兩天外
    expect(shouldFetchLiveFlight("2026-09-01", new Date("2026-09-04T15:30:00.000Z"), "Asia/Tokyo")).toBe(false);
  });

  it("returns the same full-day countdown used by the hero", () => {
    expect(getTripCountdownParts(new Date("2026-07-10T12:30:00+09:00"))).toEqual({
      days: 52,
      hours: 21,
      minutes: 0,
      seconds: 0,
    });
  });

  it("uses exact flight times for the phase and Tokyo calendar days during the trip", () => {
    expect(getTripTimelineState(new Date("2026-09-01T08:00:00+08:00"))).toMatchObject({
      phase: "pre",
      dayNumber: 1,
    });
    expect(getTripTimelineState(new Date("2026-09-02T00:01:00+09:00"))).toMatchObject({
      phase: "ongoing",
      dayNumber: 2,
    });
    expect(getTripTimelineState(new Date("2026-09-07T00:00:00+09:00"))).toMatchObject({
      phase: "ongoing",
      dayNumber: 6,
    });
    expect(getTripTimelineState(new Date("2026-09-06T23:21:00+08:00"))).toMatchObject({
      phase: "done",
      dayNumber: 6,
    });
  });
});
