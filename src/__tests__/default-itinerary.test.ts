import { describe, expect, it } from "vitest";
import { DEFAULT_ITINERARY } from "@/lib/default-itinerary";

describe("default itinerary content", () => {
  it("uses the Toyosu teamLab venue and current Odaiba night-view landmarks", () => {
    const day4 = DEFAULT_ITINERARY.day4.activities;

    expect(day4).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "teamLab Planets TOKYO" }),
      expect.objectContaining({ name: "台場夜景", desc: expect.stringContaining("彩虹大橋") }),
    ]));
    expect(day4.some((activity) => /Borderless|摩天輪/.test(`${activity.name} ${activity.desc}`))).toBe(false);
  });

  it("separates the 11:00 hotel checkout from the 14:00 luggage pickup", () => {
    const day6 = DEFAULT_ITINERARY.day6.activities;

    expect(day6).toEqual(expect.arrayContaining([
      expect.objectContaining({ time: "11:00", name: "飯店 Check-out" }),
      expect.objectContaining({ time: "14:00", name: "回飯店取行李" }),
    ]));
    expect(day6.map((activity) => activity.time)).toEqual(
      [...day6].map((activity) => activity.time).sort(),
    );
  });
});
