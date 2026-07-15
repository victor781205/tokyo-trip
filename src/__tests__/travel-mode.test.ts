import { describe, expect, it } from "vitest";
import {
  buildGoogleMapsSearchUrl,
  formatClockMinutes,
  formatCountdownMinutes,
  getTravelModeSnapshot,
  parseClockMinutes,
} from "@/lib/travel-mode";

const activities = [
  { time: "08:00", name: "早餐", desc: "飯店", tag: "美食", syncId: "breakfast" },
  { time: "09:30", name: "明治神宮", desc: "散步", tag: "景點", syncId: "meiji" },
  { time: "13:00", name: "午餐", desc: "拉麵", tag: "美食", syncId: "lunch" },
];

describe("travel mode helpers", () => {
  it("parses and formats valid clocks safely", () => {
    expect(parseClockMinutes("09:30")).toBe(570);
    expect(parseClockMinutes("24:00")).toBeNull();
    expect(parseClockMinutes("未定")).toBeNull();
    expect(formatClockMinutes(-10)).toBe("23:50");
  });

  it("selects the current and next activity in Tokyo time", () => {
    const snapshot = getTravelModeSnapshot(
      activities,
      new Date("2026-09-02T10:00:00+09:00"),
    );

    expect(snapshot.current?.activity.name).toBe("明治神宮");
    expect(snapshot.next?.activity.name).toBe("午餐");
    expect(snapshot.minutesUntilNext).toBe(180);
    expect(snapshot.latestDeparture).toBe("12:30");
  });

  it("moves forward when an activity is completed or skipped", () => {
    const snapshot = getTravelModeSnapshot(
      activities,
      new Date("2026-09-02T10:00:00+09:00"),
      { breakfast: "done", meiji: "skipped" },
    );

    expect(snapshot.current).toBeNull();
    expect(snapshot.next?.activity.name).toBe("午餐");
    expect(snapshot.completedCount).toBe(2);
    expect(snapshot.remainingCount).toBe(1);
  });

  it("creates encoded navigation URLs and readable countdowns", () => {
    expect(buildGoogleMapsSearchUrl(activities[1])).toContain(
      encodeURIComponent("明治神宮 東京"),
    );
    expect(formatCountdownMinutes(42)).toBe("42 分鐘後");
    expect(formatCountdownMinutes(120)).toBe("2 小時後");
    expect(formatCountdownMinutes(null)).toContain("尾聲");
  });
});
