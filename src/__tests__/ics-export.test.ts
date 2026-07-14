import { describe, expect, it } from "vitest";
import { buildICS, escapeICS, foldICSLine } from "@/lib/ics-export";
import type { Itinerary } from "@/context/TripContext";

function itinerary(
  date: string,
  overrides: Partial<Itinerary[string]["activities"][number]> = {},
): Itinerary {
  return {
    customDay: {
      title: "自訂行程",
      date,
      activities: [{
        time: overrides.time ?? "16:30",
        name: overrides.name ?? "吉卜力美術館",
        desc: overrides.desc ?? "需預約",
        tag: overrides.tag ?? "",
      }],
    },
  };
}

describe("ics-export", () => {
  it("uses the displayed day date instead of deriving it from the object key", () => {
    const output = buildICS(itinerary("9/5 (六)"));

    expect(output).toContain("DTSTART;TZID=Asia/Tokyo:20260905T163000");
    expect(output).toContain("DTEND;TZID=Asia/Tokyo:20260905T173000");
    expect(output).not.toContain("Invalid");
  });

  it("supports explicit ISO dates and skips invalid activity times", () => {
    expect(buildICS(itinerary("2026-09-03"))).toContain("20260903T163000");
    expect(buildICS(itinerary("2026-09-03", { time: "99:99" }))).not.toContain("BEGIN:VEVENT");
  });

  it("escapes every user-controlled text field and prevents line injection", () => {
    const output = buildICS(itinerary("9/5", {
      name: "安全\r\nBEGIN:VEVENT",
      desc: "逗號, 分號; 反斜線\\\nEND:VEVENT",
      tag: "提醒\r\nX-EVIL:1",
    }));

    expect(output).toContain("SUMMARY:安全\\nBEGIN:VEVENT");
    expect(output).toContain("DESCRIPTION:逗號\\, 分號\\; 反斜線\\\\\\nEND:VEVENT [提醒\\nX-EVIL:1]");
    expect(output.match(/\r\nBEGIN:VEVENT\r\n/g)).toHaveLength(1);
    expect(output).not.toContain("\r\nX-EVIL:1");
  });

  it("folds long UTF-8 lines to at most 75 octets", () => {
    const folded = foldICSLine("SUMMARY:" + "東京".repeat(40));
    const encoder = new TextEncoder();

    for (const line of folded.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("normalizes every newline form", () => {
    expect(escapeICS("a\rb\r\nc\nd")).toBe("a\\nb\\nc\\nd");
  });
});
