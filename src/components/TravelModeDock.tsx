"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, MapPinned } from "lucide-react";
import { useTripState } from "@/hooks/useTripState";
import { DEFAULT_ITINERARY } from "@/lib/default-itinerary";
import { getTripTimelineState } from "@/lib/trip-dates";
import {
  buildGoogleMapsSearchUrl,
  formatCountdownMinutes,
  getTravelModeSnapshot,
  travelProgressFromActivities,
} from "@/lib/travel-mode";

export function TravelModeDock({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { isLoaded, itinerary } = useTripState();
  const [now, setNow] = useState(() => new Date());
  const timeline = useMemo(() => getTripTimelineState(now), [now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const snapshot = useMemo(() => {
    const source = Object.keys(itinerary).length > 0 ? itinerary : DEFAULT_ITINERARY;
    const activities = source[`day${timeline.dayNumber}`]?.activities ?? [];
    return getTravelModeSnapshot(activities, now, travelProgressFromActivities(activities));
  }, [itinerary, now, timeline.dayNumber]);

  if (!isLoaded || timeline.phase !== "ongoing" || !snapshot.next) return null;

  return (
    <aside
      aria-label="旅行模式：下一站"
      className="travel-mode-dock fixed z-40 left-3 right-3 bottom-[calc(5.25rem+var(--sab))] lg:left-auto lg:right-5 lg:bottom-5 lg:w-[22rem] rounded-2xl border border-white/20 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onNavigate?.("itinerary")}
          className="min-h-11 min-w-0 flex-1 text-left"
          aria-label={`查看下一站：${snapshot.next.activity.name}`}
        >
          <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            下一站 · {formatCountdownMinutes(snapshot.minutesUntilNext)}
          </span>
          <span className="mt-0.5 block truncate text-sm font-black">
            {snapshot.next.activity.time} · {snapshot.next.activity.name}
          </span>
          {snapshot.current && (
            <span className="mt-0.5 block truncate text-[11px] text-slate-300">
              現在：{snapshot.current.activity.name}
            </span>
          )}
        </button>
        <a
          href={buildGoogleMapsSearchUrl(snapshot.next.activity)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-950"
          aria-label={`開啟 ${snapshot.next.activity.name} 導航`}
        >
          <MapPinned className="h-5 w-5" aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
}
