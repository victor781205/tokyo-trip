"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudSun,
  ExternalLink,
  Luggage,
  MapPin,
  RotateCcw,
  SkipForward,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useTripState } from "@/hooks/useTripState";
import { DEFAULT_ITINERARY } from "@/lib/default-itinerary";
import { getJmaWeatherLabel, parseTokyoForecastResponse } from "@/lib/jma-forecast";
import { getTripCountdownParts, getTripTimelineState } from "@/lib/trip-dates";
import {
  buildGoogleMapsSearchUrl,
  formatCountdownMinutes,
  getMinutesInTimeZone,
  getTravelModeSnapshot,
  activityProgressKey,
  parseClockMinutes,
  travelProgressFromActivities,
  type TimedActivity,
  type TravelProgress,
  type TravelProgressStatus,
} from "@/lib/travel-mode";
import { isNativePlatform } from "@/lib/platform";
import {
  PUSH_REGISTRATION_CHANGED_EVENT,
  readPushRegistrationMarker,
} from "@/lib/push-registration-status";

type WeatherSnippet = {
  label: string;
  tempMax: string;
  tempMin: string;
  pop: string;
};

export interface PushHintSnapshot {
  supported: boolean;
  permission: NotificationPermission | "unknown";
  hasSubscription: boolean;
  backendRegistered: boolean;
}

export function pushHintForSnapshot(snapshot: PushHintSnapshot) {
  if (!snapshot.supported) return "此裝置不支援網頁推播";
  if (snapshot.permission === "denied") return "推播被封鎖 · 可到瀏覽器設定開啟";
  if (snapshot.permission !== "granted") return "尚未開推播 · 到「助手」可一鍵訂閱";
  if (!snapshot.hasSubscription) return "已允許通知，但尚未完成推播訂閱";
  if (!snapshot.backendRegistered) return "推播尚未綁定此行程 · 到「助手」完成設定";
  return "推播已開啟 · 出發日可收提醒";
}

async function inspectPushHint(tripId: string | undefined) {
  let marker = null;
  try {
    marker = readPushRegistrationMarker(window.localStorage, tripId);
  } catch {
    // Storage may be blocked in private browsing.
  }

  if (isNativePlatform()) {
    return pushHintForSnapshot({
      supported: true,
      permission: marker ? "granted" : "unknown",
      hasSubscription: Boolean(marker),
      backendRegistered: Boolean(marker),
    });
  }

  if (
    typeof Notification === "undefined"
    || !("serviceWorker" in navigator)
    || !("PushManager" in window)
  ) {
    return pushHintForSnapshot({
      supported: false,
      permission: "unknown",
      hasSubscription: false,
      backendRegistered: false,
    });
  }

  if (Notification.permission !== "granted") {
    return pushHintForSnapshot({
      supported: true,
      permission: Notification.permission,
      hasSubscription: false,
      backendRegistered: false,
    });
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    const hasSubscription = Boolean(subscription);
    const backendRegistered = Boolean(
      subscription
      && marker?.platform === "web"
      && marker.token === subscription.endpoint,
    );
    return pushHintForSnapshot({
      supported: true,
      permission: "granted",
      hasSubscription,
      backendRegistered,
    });
  } catch {
    return "推播狀態暫時無法確認 · 可到「助手」重新檢查";
  }
}

function temperatureSummary(weather: WeatherSnippet) {
  if (weather.tempMax === "--") return "氣溫待更新";
  if (weather.tempMin === "--") return `最高 ${weather.tempMax}°C`;
  return `${weather.tempMin}–${weather.tempMax}°C`;
}

function dayKeyForIndex(i: number) {
  return `day${i + 1}` as const;
}

/**
 * Today Focus treats the latest processed activity at or before Tokyo's current
 * time as a forward-only cursor. Older unchecked activities remain available in
 * the itinerary, but must not reappear as the current stop after the user has
 * explicitly completed or skipped a later one.
 */
export function getTodayFocusTravelModeSnapshot<T extends TimedActivity>(
  activities: T[],
  now: Date,
  progress: TravelProgress = {},
) {
  const snapshot = getTravelModeSnapshot(activities, now, progress);
  if (!snapshot.current) return snapshot;

  const nowMinutes = getMinutesInTimeZone(now);
  const timelineEntries = activities
    .map((activity, originalIndex) => {
      const minuteOfDay = parseClockMinutes(activity.time);
      if (minuteOfDay === null) return null;
      return {
        key: activityProgressKey(activity, originalIndex),
        minuteOfDay,
        originalIndex,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay || a.originalIndex - b.originalIndex);

  let processedCursor = -1;
  timelineEntries.forEach((entry, index) => {
    if (entry.minuteOfDay <= nowMinutes && progress[entry.key]) {
      processedCursor = index;
    }
  });
  if (processedCursor < 0) return snapshot;

  const currentPosition = timelineEntries.findIndex(
    (entry) => entry.key === snapshot.current?.key,
  );
  return currentPosition >= 0 && currentPosition <= processedCursor
    ? { ...snapshot, current: null }
    : snapshot;
}

interface TodayFocusProps {
  onNavigate?: (tab: string) => void;
}

/**
 * 首頁「今日焦點」：依東京時區對應 Day N，
 * 彙整當日行程、預算餘額、行李進度，一鍵跳轉各 tab。
 */
export function TodayFocus({ onNavigate }: TodayFocusProps) {
  const { isLoaded, tripId, itinerary, updateItinerary, budgetItems, budgetLimit, packingList } = useTripState();
  const [weather, setWeather] = useState<WeatherSnippet | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pushHint, setPushHint] = useState("確認推播狀態中…");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // 東京氣象廳今日一句天氣
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/weather");
        if (!res.ok) throw new Error(`JMA 回應錯誤 (${res.status})`);
        const data = await res.json();
        const today = parseTokyoForecastResponse(data)[0];
        if (!today) throw new Error("JMA 回傳內容不完整");
        if (cancelled) return;
        setWeather({
          label: getJmaWeatherLabel(today.weather),
          tempMax: today.tempMax,
          tempMin: today.tempMin,
          pop: today.pop,
        });
        setWeatherStatus("ready");
      } catch {
        if (!cancelled) setWeatherStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void inspectPushHint(tripId).then((hint) => {
        if (!cancelled) setPushHint(hint);
      });
    };
    refresh();
    window.addEventListener(PUSH_REGISTRATION_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PUSH_REGISTRATION_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [tripId]);

  const timeline = useMemo(() => getTripTimelineState(now), [now]);

  const updateTravelProgress = useCallback((key: string, status: TravelProgressStatus) => {
    const dayKey = dayKeyForIndex(timeline.dayNumber - 1);
    updateItinerary((current) => {
      const base = { ...DEFAULT_ITINERARY, ...current };
      const day = base[dayKey];
      if (!day) return current;
      return {
        ...base,
        [dayKey]: {
          ...day,
          activities: day.activities.map((activity, index) => (
            activityProgressKey(activity, index) === key
              ? { ...activity, status }
              : activity
          )),
        },
      };
    });
  }, [timeline.dayNumber, updateItinerary]);

  const resetTravelProgress = useCallback(() => {
    const dayKey = dayKeyForIndex(timeline.dayNumber - 1);
    updateItinerary((current) => {
      const base = { ...DEFAULT_ITINERARY, ...current };
      const day = base[dayKey];
      if (!day) return current;
      return {
        ...base,
        [dayKey]: {
          ...day,
          activities: day.activities.map((activity) => ({ ...activity, status: undefined })),
        },
      };
    });
  }, [timeline.dayNumber, updateItinerary]);

  const snapshot = useMemo(() => {
    const tripState = timeline;
    const phase = tripState.phase;
    const dayIndex = tripState.dayNumber - 1;

    const key = dayKeyForIndex(dayIndex);
    const source = Object.keys(itinerary || {}).length > 0 ? itinerary : DEFAULT_ITINERARY;
    const dayPlan = source[key] ?? DEFAULT_ITINERARY[key];
    const allActivities = dayPlan?.activities ?? [];
    const travelMode = getTodayFocusTravelModeSnapshot(
      allActivities,
      now,
      travelProgressFromActivities(allActivities),
    );
    const activities = allActivities.slice(0, 4);
    const moreCount = Math.max(0, (dayPlan?.activities?.length ?? 0) - activities.length);

    const spent = (budgetItems || []).reduce((s, i) => s + (i.amount || 0), 0);
    const remaining = Math.max((budgetLimit || 0) - spent, 0);
    const luggageItems = (packingList || []).filter((item) => !item.id.startsWith("reservation:"));
    const packed = luggageItems.filter((item) => item.packed).length;
    const packTotal = luggageItems.length;
    const packPct = packTotal > 0 ? Math.round((packed / packTotal) * 100) : 0;

    return {
      phase,
      dayIndex,
      dayNumber: dayIndex + 1,
      dayPlan,
      activities,
      moreCount,
      spent,
      remaining,
      packPct,
      packed,
      packTotal,
      travelMode,
      daysUntil: getTripCountdownParts(now).days,
    };
  }, [itinerary, budgetItems, budgetLimit, packingList, now, timeline]);

  if (!isLoaded) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-6 animate-pulse">
        <div className="h-40 rounded-[2rem] bg-white/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10" />
      </div>
    );
  }

  const title =
    snapshot.phase === "done"
      ? "旅程回顧"
      : snapshot.phase === "ongoing"
        ? `今日 · Day ${snapshot.dayNumber}`
        : `即將出發 · Day 1 預覽`;

  const subtitle =
    snapshot.phase === "done"
      ? "六天五夜圓滿結束，以下是最後一天行程回顧"
      : snapshot.phase === "ongoing"
        ? snapshot.dayPlan?.title || `Day ${snapshot.dayNumber}`
        : `還有 ${snapshot.daysUntil} 天出發 · 先看第一天安排`;

  return (
    <section
      id="today-focus"
      aria-label="今日焦點"
      className="w-full max-w-2xl mx-auto mt-5 sm:mt-6 animate-in fade-in slide-in-from-bottom-3 duration-700"
    >
      <div className="rounded-[2rem] bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 shadow-xl overflow-hidden text-left">
        <div className="px-5 sm:px-6 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Today Focus
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate">
              {title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-gray-400 font-medium mt-0.5 line-clamp-2">
              {subtitle}
              {snapshot.dayPlan?.date ? ` · ${snapshot.dayPlan.date}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.("itinerary")}
            className="min-h-11 shrink-0 text-xs font-black text-primary flex items-center gap-0.5 px-3 py-2 rounded-xl bg-primary/10 active:scale-95"
          >
            完整行程
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {snapshot.phase === "ongoing" && (
          <div className="px-5 sm:px-6 pb-4">
            <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-white to-amber-50 dark:from-primary/20 dark:via-slate-900 dark:to-amber-950/30 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary">
                    <Clock3 className="w-4 h-4" aria-hidden="true" />
                    現在／下一站
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                    已處理 {snapshot.travelMode.completedCount} 項 · 尚有 {snapshot.travelMode.remainingCount} 項
                  </p>
                </div>
                {snapshot.travelMode.completedCount > 0 && (
                  <button
                    type="button"
                    onClick={resetTravelProgress}
                    className="min-h-11 inline-flex items-center gap-1 rounded-xl px-3 text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    重設
                  </button>
                )}
              </div>

              {snapshot.travelMode.current ? (
                <div className="rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-white dark:border-slate-700 p-3 mb-2">
                  <div className="text-[10px] font-black tracking-widest text-slate-600 dark:text-slate-300 uppercase mb-1">目前行程</div>
                  <div className="flex items-start gap-3">
                    <span className="font-mono font-black text-primary text-sm tabular-nums">
                      {snapshot.travelMode.current.activity.time}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-sm text-slate-900 dark:text-white">
                        {snapshot.travelMode.current.activity.name}
                      </div>
                      {snapshot.travelMode.current.activity.desc && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                          {snapshot.travelMode.current.activity.desc}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => updateTravelProgress(snapshot.travelMode.current!.key, "done")}
                      className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 active:scale-[0.98]"
                    >
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      標記完成
                    </button>
                    <button
                      type="button"
                      onClick={() => updateTravelProgress(snapshot.travelMode.current!.key, "skipped")}
                      className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100 text-xs font-black active:scale-[0.98]"
                    >
                      <SkipForward className="w-4 h-4" aria-hidden="true" />
                      略過
                    </button>
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl bg-white/70 dark:bg-slate-800/70 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                  {snapshot.travelMode.next ? "下一站尚未開始，可以先確認路線。" : "今天的排定行程都已處理。"}
                </p>
              )}

              {snapshot.travelMode.next && (
                <div className="rounded-2xl bg-slate-900 dark:bg-black/30 text-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black tracking-widest text-slate-300 uppercase">下一站</div>
                      <div className="font-black text-sm mt-0.5 truncate">
                        {snapshot.travelMode.next.activity.time} · {snapshot.travelMode.next.activity.name}
                      </div>
                    </div>
                    <a
                      href={buildGoogleMapsSearchUrl(snapshot.travelMode.next.activity)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl bg-white text-slate-900"
                      aria-label={`導航至 ${snapshot.travelMode.next.activity.name}`}
                    >
                      <ExternalLink className="w-4 h-4" aria-hidden="true" />
                    </a>
                  </div>
                  <p className="text-xs text-slate-200 mt-2">
                    {formatCountdownMinutes(snapshot.travelMode.minutesUntilNext)}
                    {snapshot.travelMode.latestDeparture
                      ? ` · 建議最晚 ${snapshot.travelMode.latestDeparture} 出發（預留 30 分鐘）`
                      : ""}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 活動預覽 */}
        <div className="px-5 sm:px-6 pb-4 space-y-2">
          {snapshot.activities.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium py-2">尚無行程，到「行程」頁新增吧</p>
          ) : (
            snapshot.activities.map((act, i) => (
              <div
                key={`${act.time}-${act.name}-${i}`}
                className="flex items-start gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5"
              >
                <span className="font-mono font-black text-primary text-sm tabular-nums shrink-0 w-12">
                  {act.time}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                    {act.name}
                  </div>
                  {act.desc && (
                    <div className="text-xs text-slate-600 dark:text-slate-300 truncate">{act.desc}</div>
                  )}
                </div>
                {act.tag && (
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 shrink-0">
                    {act.tag}
                  </span>
                )}
              </div>
            ))
          )}
          {snapshot.moreCount > 0 && (
            <button
              type="button"
              onClick={() => onNavigate?.("itinerary")}
              className="w-full min-h-11 text-center text-xs font-bold text-primary py-1"
            >
              還有 {snapshot.moreCount} 項 · 查看全部
            </button>
          )}
        </div>

        {/* 快捷狀態列 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 sm:px-5 pb-5">
          <QuickStat
            icon={Wallet}
            label="預算剩餘"
            value={`¥${snapshot.remaining.toLocaleString()}`}
            onClick={() => onNavigate?.("tools")}
          />
          <QuickStat
            icon={Luggage}
            label="行李進度"
            value={snapshot.packTotal ? `${snapshot.packPct}%` : "—"}
            onClick={() => onNavigate?.("tripprep")}
          />
          <QuickStat
            icon={UtensilsCrossed}
            label="美食地圖"
            value="附近推薦"
            onClick={() => onNavigate?.("food")}
          />
          <QuickStat
            icon={MapPin}
            label="交通"
            value="查路線"
            onClick={() => onNavigate?.("transport")}
          />
        </div>

        {/* 天氣一句 + 推播預告 */}
        <div className="px-5 sm:px-6 pb-5 space-y-2">
          <div className="flex items-center gap-2 rounded-2xl bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800 px-3.5 py-2.5 text-xs font-bold text-sky-800 dark:text-sky-300">
            <CloudSun className="w-4 h-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {weatherStatus === "ready" && weather
                ? `東京今日 ${weather.label} · ${temperatureSummary(weather)} · 降雨 ${weather.pop}%`
                : weatherStatus === "error"
                  ? "東京天氣暫時無法取得 · 請到天氣頁重試"
                  : "東京天氣載入中…"}
            </span>
            <button
              type="button"
              onClick={() => onNavigate?.("tripprep")}
              className="ml-auto min-w-11 min-h-11 px-2 underline underline-offset-2 shrink-0"
            >
              詳情
            </button>
          </div>
          {pushHint && (
            <div className="flex items-center gap-2 rounded-2xl bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 px-3.5 py-2.5 text-xs font-bold text-violet-800 dark:text-violet-300">
              <Bell className="w-4 h-4 shrink-0" />
              <span className="min-w-0 flex-1">{pushHint}</span>
              <button
                type="button"
                onClick={() => onNavigate?.("assistant")}
                className="ml-auto min-w-11 min-h-11 px-2 underline underline-offset-2 shrink-0"
              >
                設定
              </button>
            </div>
          )}
          {snapshot.phase === "pre" && (
            <div className="flex items-center gap-2 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 px-3.5 py-2.5 text-xs font-bold text-amber-800 dark:text-amber-300">
              <Luggage className="w-4 h-4 shrink-0" />
              出發前可先檢查行李清單
              <button
                type="button"
                onClick={() => onNavigate?.("tripprep")}
                className="ml-auto min-w-11 min-h-11 px-2 underline underline-offset-2 shrink-0"
              >
                前往
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 px-3 py-3 text-left active:scale-[0.98] transition-all hover:border-primary/30"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
        <Icon className="w-3.5 h-3.5 text-primary" />
        {label}
      </div>
      <div className="text-sm font-black text-slate-800 dark:text-white truncate tabular-nums">
        {value}
      </div>
    </button>
  );
}
