export const TRIP_OUTBOUND_DATE = "2026-09-01";
export const TRIP_INBOUND_DATE = "2026-09-06";
export const TRIP_TOTAL_DAYS = 6;
// JX800 自台北（UTC+8）起飛；倒數以真正出發時間為準。
export const TRIP_START_AT = "2026-09-01T08:30:00+08:00";
// JX805 抵達台北（UTC+8），旅程在實際落地後結束。
export const TRIP_END_AT = "2026-09-06T23:20:00+08:00";

const MS_PER_DAY = 86_400_000;

export function getDateInTimeZone(
  date: Date,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getIsoDatePart(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function isFlightSourceForDate(
  value: string | null | undefined,
  targetDate: string,
): boolean {
  return getIsoDatePart(value) === targetDate;
}

/**
 * 僅在旅程日前後 48 小時內啟用 LIVE 查詢，避免把別天同班號 FIDS 誤當本趟航班。
 * 預設以目標機場時區的「日曆日」計算距離。
 */
export function shouldFetchLiveFlight(
  targetDate: string,
  now = new Date(),
  timeZone = "Asia/Tokyo",
  windowHours = 48,
): boolean {
  const today = getDateInTimeZone(now, timeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return false;
  }
  // 以 noon UTC 比較日曆日，避免 DST / 時區偏移造成差一天。
  const targetMs = Date.parse(`${targetDate}T12:00:00Z`);
  const todayMs = Date.parse(`${today}T12:00:00Z`);
  if (Number.isNaN(targetMs) || Number.isNaN(todayMs)) return false;
  const diffHours = Math.abs(targetMs - todayMs) / 3_600_000;
  return diffHours <= windowHours;
}

export function getTripCountdownParts(now = new Date()) {
  const diff = Math.max(0, new Date(TRIP_START_AT).getTime() - now.getTime());
  return {
    days: Math.floor(diff / MS_PER_DAY),
    hours: Math.floor((diff % MS_PER_DAY) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

export function getTripTimelineState(now = new Date()) {
  const nowMs = now.getTime();
  const startMs = new Date(TRIP_START_AT).getTime();
  const endMs = new Date(TRIP_END_AT).getTime();

  if (nowMs < startMs) {
    return { phase: "pre" as const, dayNumber: 1, elapsedDays: 0, remainingDays: TRIP_TOTAL_DAYS };
  }
  if (nowMs > endMs) {
    return { phase: "done" as const, dayNumber: TRIP_TOTAL_DAYS, elapsedDays: TRIP_TOTAL_DAYS, remainingDays: 0 };
  }

  const tokyoDate = getDateInTimeZone(now, "Asia/Tokyo");
  const firstDay = Date.parse(`${TRIP_OUTBOUND_DATE}T12:00:00Z`);
  const currentDay = Date.parse(`${tokyoDate}T12:00:00Z`);
  const dayNumber = Math.min(
    TRIP_TOTAL_DAYS,
    Math.max(1, Math.floor((currentDay - firstDay) / MS_PER_DAY) + 1),
  );
  return {
    phase: "ongoing" as const,
    dayNumber,
    elapsedDays: dayNumber,
    remainingDays: TRIP_TOTAL_DAYS - dayNumber + 1,
  };
}
