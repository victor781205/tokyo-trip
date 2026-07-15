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
    expect(day4).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "DiverCity 台場",
        desc: expect.stringMatching(/獨角獸鋼彈.*2026\/8\/31.*結束展示/),
      }),
    ]));
    expect(day4.some((activity) => activity.desc === "1:1 鋼彈模型")).toBe(false);
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

  it("keeps reservation-only attractions explicit in the itinerary", () => {
    expect(DEFAULT_ITINERARY.day2.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "澀谷 Scramble Square",
        desc: expect.stringMatching(/SHIBUYA SKY.*預約指定入場時段/),
      }),
    ]));
    expect(DEFAULT_ITINERARY.day4.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "teamLab Planets TOKYO",
        desc: expect.stringMatching(/事先購買指定入場時段門票/),
      }),
    ]));
    expect(DEFAULT_ITINERARY.day5.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        time: "16:00",
        name: "吉卜力美術館",
        desc: expect.stringMatching(/完全預約制.*現場不售票/),
      }),
    ]));
  });

  it("uses the 16:00 direct Sobu Rapid plan for Narita", () => {
    const airportTransfer = DEFAULT_ITINERARY.day6.activities.find(
      (activity) => activity.name === "前往成田機場",
    );

    expect(airportTransfer).toMatchObject({
      time: "16:00",
      desc: expect.stringMatching(/JR 總武快速直達.*85 分鐘/),
    });
  });

  it("warns about closing times and the September Ghibli ticket release", () => {
    expect(DEFAULT_ITINERARY.day1.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "淺草寺・雷門",
        desc: expect.stringMatching(/本堂.*17:00.*雷門／境內.*提早/),
      }),
    ]));
    expect(DEFAULT_ITINERARY.day2.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "新宿御苑",
        desc: expect.stringMatching(/18:00 閉園.*17:30 入園.*短停/),
      }),
    ]));
    expect(DEFAULT_ITINERARY.day5.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "吉卜力美術館",
        desc: expect.stringMatching(/9 月.*8\/10 10:00.*日本時間.*確認官方開館日/),
      }),
    ]));
  });
});
