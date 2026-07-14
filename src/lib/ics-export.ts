import type { Itinerary } from "@/context/TripContext";

const TRIP_YEAR = 2026;
const DEFAULT_TRIP_MONTH = 9;

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

function isValidCalendarDate(date: CalendarDate): boolean {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return value.getUTCFullYear() === date.year
    && value.getUTCMonth() === date.month - 1
    && value.getUTCDate() === date.day;
}

function resolveCalendarDate(dayKey: string, label: string): CalendarDate | null {
  const iso = label.match(/(?:^|\D)(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
  if (iso) {
    const date = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    return isValidCalendarDate(date) ? date : null;
  }

  const monthDay = label.match(/(?:^|\D)(\d{1,2})\/(\d{1,2})(?:\D|$)/);
  if (monthDay) {
    const date = { year: TRIP_YEAR, month: Number(monthDay[1]), day: Number(monthDay[2]) };
    return isValidCalendarDate(date) ? date : null;
  }

  const fallbackDay = Number(dayKey.match(/\d+/)?.[0]);
  const fallback = { year: TRIP_YEAR, month: DEFAULT_TRIP_MONTH, day: fallbackDay };
  return Number.isInteger(fallbackDay) && isValidCalendarDate(fallback) ? fallback : null;
}

function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : null;
}

function formatLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return String(date.getUTCFullYear())
    + pad(date.getUTCMonth() + 1)
    + pad(date.getUTCDate())
    + "T"
    + pad(date.getUTCHours())
    + pad(date.getUTCMinutes())
    + "00";
}

export function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** RFC 5545 content lines are limited to 75 UTF-8 octets, excluding CRLF. */
export function foldICSLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";

  for (const character of line) {
    const prefix = chunks.length > 0 ? " " : "";
    if (current && encoder.encode(prefix + current + character).length > 75) {
      chunks.push(current);
      current = character;
    } else {
      current += character;
    }
  }

  if (current || chunks.length === 0) chunks.push(current);
  return chunks.join("\r\n ");
}

export function buildICS(itinerary: Itinerary): string {
  const events: string[] = [];

  Object.entries(itinerary).forEach(([dayKey, dayData], dayIndex) => {
    const calendarDate = resolveCalendarDate(dayKey, dayData.date);
    if (!calendarDate) return;

    dayData.activities.forEach((activity, activityIndex) => {
      const time = parseTime(activity.time);
      if (!time) return;

      // UTC is used only for timezone-independent calendar arithmetic. The
      // resulting components are emitted as Asia/Tokyo wall-clock values.
      const startDate = new Date(Date.UTC(
        calendarDate.year,
        calendarDate.month - 1,
        calendarDate.day,
        time.hours,
        time.minutes,
      ));
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      const description = (activity.desc || "") + (activity.tag ? " [" + activity.tag + "]" : "");
      const uidDate = formatLocalDateTime(startDate).slice(0, 8);

      events.push([
        "BEGIN:VEVENT",
        "UID:" + uidDate + "-" + dayIndex + "-" + activityIndex + "@tokyo-trip.local",
        "DTSTART;TZID=Asia/Tokyo:" + formatLocalDateTime(startDate),
        "DTEND;TZID=Asia/Tokyo:" + formatLocalDateTime(endDate),
        "SUMMARY:" + escapeICS(activity.name),
        "DESCRIPTION:" + escapeICS(description),
        "END:VEVENT",
      ].map(foldICSLine).join("\r\n"));
    });
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TokyoTrip//Travel Planner//TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:東京自由行 2026",
    "X-WR-TIMEZONE:Asia/Tokyo",
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
}

/**
 * 生成 .ics 行事曆檔案並觸發下載，支援 Google Calendar、Apple Calendar、Outlook。
 */
export function downloadICS(itinerary: Itinerary) {
  if (typeof window === "undefined") return;

  const blob = new Blob([buildICS(itinerary)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "東京自由行_2026_行程表.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
