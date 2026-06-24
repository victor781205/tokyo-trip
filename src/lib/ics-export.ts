import type { Itinerary } from "@/context/TripContext";

/**
 * 生成 .ics 行事曆檔案並觸發下載
 * 支援 Google Calendar、Apple Calendar、Outlook 等
 */
export function downloadICS(itinerary: Itinerary) {
  if (typeof window === "undefined") return;

  const events: string[] = [];
  const tripYear = 2026;

  for (const [dayKey, dayData] of Object.entries(itinerary)) {
    // 從 dayKey 推算日期，例如 day1 → 9/1, day2 → 9/2
    const dayNum = parseInt(dayKey.replace(/\D/g, ""), 10);
    const month = 9; // 9月
    const day = dayNum;

    for (const activity of dayData.activities) {
      const [hours, minutes] = activity.time.split(":").map(Number);
      const startDate = new Date(tripYear, month - 1, day, hours, minutes);
      // 每個活動預設 1 小時
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

      const formatDT = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
      };

      const uid = `${dayKey}-${activity.time}-${activity.name.replace(/\s/g, "")}@tokyo-trip`;

      events.push([
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTART;TZID=Asia/Tokyo:${formatDT(startDate)}`,
        `DTEND;TZID=Asia/Tokyo:${formatDT(endDate)}`,
        `SUMMARY:${escapeICS(activity.name)}`,
        `DESCRIPTION:${escapeICS(activity.desc || "")}${activity.tag ? ` [${activity.tag}]` : ""}`,
        "END:VEVENT",
      ].join("\r\n"));
    }
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TokyoTrip//Travel Planner//TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:東京自由行 2026",
    "X-WR-TIMEZONE:Asia/Tokyo",
    // 時區定義
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Tokyo",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:JST",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "東京自由行_2026_行程表.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
