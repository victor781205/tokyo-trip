export type TimedActivity = {
  time: string;
  name: string;
  desc?: string;
  tag?: string;
  syncId?: string;
  status?: TravelProgressStatus;
};

export type TravelProgressStatus = "done" | "skipped";

export type TravelProgress = Record<string, TravelProgressStatus>;

export type TravelModeEntry<T extends TimedActivity = TimedActivity> = {
  activity: T;
  key: string;
  minuteOfDay: number;
};

export type TravelModeSnapshot<T extends TimedActivity = TimedActivity> = {
  current: TravelModeEntry<T> | null;
  next: TravelModeEntry<T> | null;
  minutesUntilNext: number | null;
  latestDeparture: string | null;
  completedCount: number;
  remainingCount: number;
};

const DEFAULT_TRAVEL_BUFFER_MINUTES = 30;

export function activityProgressKey(activity: TimedActivity, index = 0) {
  return activity.syncId?.trim()
    || `${activity.time.trim()}|${activity.name.trim()}|${index}`;
}

export function travelProgressFromActivities(activities: TimedActivity[]): TravelProgress {
  return activities.reduce<TravelProgress>((progress, activity, index) => {
    if (activity.status) progress[activityProgressKey(activity, index)] = activity.status;
    return progress;
  }, {});
}

export function parseClockMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function getMinutesInTimeZone(
  date: Date,
  timeZone = "Asia/Tokyo",
): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

export function formatClockMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1_440) + 1_440) % 1_440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function buildGoogleMapsSearchUrl(activity: TimedActivity) {
  const query = [activity.name, "東京"].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function getTravelModeSnapshot<T extends TimedActivity>(
  activities: T[],
  now: Date,
  progress: TravelProgress = {},
  travelBufferMinutes = DEFAULT_TRAVEL_BUFFER_MINUTES,
): TravelModeSnapshot<T> {
  const nowMinutes = getMinutesInTimeZone(now);
  const entries = activities
    .map((activity, index) => {
      const minuteOfDay = parseClockMinutes(activity.time);
      if (minuteOfDay === null) return null;
      return {
        activity,
        key: activityProgressKey(activity, index),
        minuteOfDay,
      };
    })
    .filter((entry): entry is TravelModeEntry<T> => entry !== null)
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay);

  const activeEntries = entries.filter((entry) => !progress[entry.key]);
  const current = [...activeEntries]
    .reverse()
    .find((entry) => entry.minuteOfDay <= nowMinutes) ?? null;
  const next = activeEntries.find((entry) => entry.minuteOfDay > nowMinutes) ?? null;
  const completedCount = entries.filter((entry) => Boolean(progress[entry.key])).length;

  return {
    current,
    next,
    minutesUntilNext: next ? Math.max(0, next.minuteOfDay - nowMinutes) : null,
    latestDeparture: next
      ? formatClockMinutes(next.minuteOfDay - travelBufferMinutes)
      : null,
    completedCount,
    remainingCount: Math.max(0, entries.length - completedCount),
  };
}

export function formatCountdownMinutes(minutes: number | null) {
  if (minutes === null) return "今日行程已接近尾聲";
  if (minutes < 1) return "即將開始";
  if (minutes < 60) return `${minutes} 分鐘後`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} 小時 ${remainder} 分後` : `${hours} 小時後`;
}
