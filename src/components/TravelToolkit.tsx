"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CloudRain,
  Download,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  TrainFront,
  WifiOff,
  X,
} from "lucide-react";
import { useTripState } from "@/hooks/useTripState";
import { parseTokyoForecastResponse } from "@/lib/jma-forecast";
import {
  createOfflineTripPack,
  getRainFallbacks,
  persistOfflineTripPack,
  readOfflineTripPack,
  shouldShowRainPlan,
  type OfflineTripPack,
} from "@/lib/offline-pack";
import { DEFAULT_ITINERARY } from "@/lib/default-itinerary";
import { getTripTimelineState } from "@/lib/trip-dates";
import { isNativePlatform } from "@/lib/platform";

const TRANSIT_LINKS = [
  {
    label: "JR 東日本關東運行資訊",
    href: "https://traininfo.jreast.co.jp/train_info/e/kanto.aspx",
  },
  {
    label: "東京 Metro 運行資訊",
    href: "https://www.tokyometro.jp/index.html",
  },
  {
    label: "京成電鐵運行資訊",
    href: "https://www.keisei.co.jp/",
  },
  {
    label: "成田機場即時航班",
    href: "https://www.narita-airport.jp/en/flight/",
  },
] as const;

export function TravelToolkit() {
  const {
    tripId,
    itinerary,
    budgetItems,
    budgetLimit,
    packingList,
  } = useTripState();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [openedPack, setOpenedPack] = useState<OfflineTripPack | null>(null);
  const [openStatus, setOpenStatus] = useState<"idle" | "loading" | "error">("idle");
  const [weatherPop, setWeatherPop] = useState<string | null>(null);
  const timeline = useMemo(() => getTripTimelineState(new Date()), []);

  const buildPack = () => createOfflineTripPack({
    tripId,
    itinerary: Object.keys(itinerary).length > 0 ? itinerary : DEFAULT_ITINERARY,
    budgetItems,
    budgetLimit,
    packingList,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOpenedPack(null);
      setOpenStatus("idle");
      if (!("caches" in window)) {
        setSavedAt(null);
        return;
      }
      void readOfflineTripPack(window.caches, tripId).then((pack) => {
        setSavedAt(pack?.savedAt ?? null);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/weather")
      .then(async (response) => {
        if (!response.ok) throw new Error("weather unavailable");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setWeatherPop(parseTokyoForecastResponse(payload)[0]?.pop ?? null);
      })
      .catch(() => {
        // The offline pack remains usable without a current forecast.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveOfflinePack = async () => {
    setSaveStatus("saving");
    const pack = buildPack();
    try {
      if (!("caches" in window)) throw new Error("Cache Storage unavailable");
      if (!isNativePlatform()) {
        if (!("serviceWorker" in navigator)) throw new Error("Service Worker unavailable");
        const registration = await navigator.serviceWorker.getRegistration();
        if (!navigator.serviceWorker.controller && !registration?.active) {
          throw new Error("Service Worker is not active");
        }
      }
      const verifiedPack = await persistOfflineTripPack({
        cacheStorage: window.caches,
        pack,
      });
      // Prime the Workbox NetworkFirst weather cache. Weather is optional and
      // never turns a verified core pack into a false failure.
      void fetch("/api/weather", { cache: "reload" }).catch(() => undefined);
      setSavedAt(verifiedPack.savedAt);
      setOpenedPack(verifiedPack);
      setOpenStatus("idle");
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  };

  const openOfflinePack = async () => {
    setOpenStatus("loading");
    if (!("caches" in window)) {
      setOpenStatus("error");
      return;
    }
    const pack = await readOfflineTripPack(window.caches, tripId);
    if (!pack) {
      setOpenedPack(null);
      setSavedAt(null);
      setOpenStatus("error");
      return;
    }
    setOpenedPack(pack);
    setSavedAt(pack.savedAt);
    setOpenStatus("idle");
  };

  const downloadBackup = () => {
    const pack = buildPack();
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tokyo-trip-backup-${pack.savedAt.slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const rainPlanVisible = shouldShowRainPlan(weatherPop);

  return (
    <section id="travel-kit" className="py-6 md:py-10 max-w-6xl mx-auto scroll-mt-28" aria-labelledby="travel-kit-title">
      <div className="text-center mb-7">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1 text-sm font-black text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Travel Ready
        </div>
        <h2 id="travel-kit-title" className="mt-3 text-3xl md:text-4xl font-black text-slate-900 dark:text-white">
          離線旅行包與即時備案
        </h2>
        <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          先保存重要資料；地下鐵沒訊號時仍可查看行程、飯店、緊急資訊與常用日語。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
              <WifiOff className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-slate-900 dark:text-white">離線旅行包</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {savedAt
                  ? `最後更新：${new Date(savedAt).toLocaleString("zh-TW")}`
                  : "尚未建立，建議出發前與每天早上更新。"}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => void saveOfflinePack()}
              disabled={saveStatus === "saving"}
              className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${saveStatus === "saving" ? "animate-spin" : ""}`} aria-hidden="true" />
              {saveStatus === "saving" ? "保存中" : "更新離線包"}
            </button>
            <button
              type="button"
              onClick={() => void openOfflinePack()}
              disabled={!savedAt || openStatus === "loading"}
              aria-controls="offline-pack-viewer"
              aria-expanded={Boolean(openedPack)}
              className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-black text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-100 dark:hover:bg-indigo-900/40"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {openStatus === "loading" ? "讀取中" : "開啟離線包"}
            </button>
            <button
              type="button"
              onClick={downloadBackup}
              className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              匯出備份
            </button>
          </div>
          {saveStatus === "saved" && <p role="status" className="mt-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">已驗證 App 外殼與旅行資料，可離線開啟。</p>}
          {saveStatus === "error" && <p role="alert" className="mt-3 text-xs font-bold text-red-700 dark:text-red-300">離線資料未完整驗證，未標記為完成；請確認網路與 PWA 權限，或先匯出備份。</p>}
          {openStatus === "error" && <p role="alert" className="mt-3 text-xs font-bold text-red-700 dark:text-red-300">找不到可讀的離線包，請重新更新後再試。</p>}
        </article>

        <article className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-lg dark:border-sky-800 dark:bg-sky-950/30">
          <div className="flex items-center gap-2">
            <CloudRain className="h-5 w-5 text-sky-700 dark:text-sky-300" aria-hidden="true" />
            <h3 className="font-black text-sky-950 dark:text-sky-100">雨天備案</h3>
          </div>
          <p className="mt-2 text-xs font-bold text-sky-800 dark:text-sky-200">
            {weatherPop === null
              ? "目前無法取得降雨機率；旅程前七日請再確認。"
              : `目前東京預報降雨機率 ${weatherPop}%${rainPlanVisible ? "，建議啟用備案。" : "。"}`}
          </p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-sky-950 dark:text-sky-100">
            {getRainFallbacks(timeline.dayNumber).map((item) => (
              <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>
            ))}
          </ul>
          {timeline.phase === "pre" && (
            <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[11px] font-bold text-sky-800 dark:bg-slate-900/30 dark:text-sky-200">
              現在顯示的是近期預報，不是 9/1–9/6 的旅程預報；出發前一週會更有參考價值。
            </p>
          )}
        </article>

        <article className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-lg dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2">
            <TrainFront className="h-5 w-5 text-amber-800 dark:text-amber-300" aria-hidden="true" />
            <h3 className="font-black text-amber-950 dark:text-amber-100">官方交通狀態</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            運行資訊變動快速，僅連到官方即時來源，不以舊快取判斷是否誤點。
          </p>
          <div className="mt-3 grid gap-2">
            {TRANSIT_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-11 inline-flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 text-xs font-black text-amber-950 hover:bg-white dark:bg-slate-900/40 dark:text-amber-100 dark:hover:bg-slate-900/70"
              >
                {link.label}
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
              </a>
            ))}
          </div>
        </article>
      </div>

      {openedPack && (
        <article
          id="offline-pack-viewer"
          aria-labelledby="offline-pack-viewer-title"
          className="mt-5 rounded-[2rem] border border-indigo-200 bg-white p-5 shadow-xl dark:border-indigo-800 dark:bg-slate-800 md:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">Cached Snapshot</div>
              <h3 id="offline-pack-viewer-title" className="mt-1 text-2xl font-black text-slate-950 dark:text-white">可離線閱讀的旅行資料</h3>
              <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                保存於 {new Date(openedPack.savedAt).toLocaleString("zh-TW")}；內容是當時快照，不會在離線時自動更新。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenedPack(null)}
              aria-label="關閉離線旅行資料"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
              <div className="text-xs font-black text-slate-600 dark:text-slate-300">行程</div>
              <div className="mt-1 text-xl font-black">{Object.keys(openedPack.itinerary).length} 天</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
              <div className="text-xs font-black text-slate-600 dark:text-slate-300">預算快照</div>
              <div className="mt-1 text-xl font-black">¥{openedPack.budget.limit.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
              <div className="text-xs font-black text-slate-600 dark:text-slate-300">行李進度</div>
              <div className="mt-1 text-xl font-black">
                {openedPack.packingList.filter((item) => item.packed).length}/{openedPack.packingList.length}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="offline-hotel-title" className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <h4 id="offline-hotel-title" className="font-black text-slate-950 dark:text-white">🏨 飯店資料</h4>
              <p className="mt-2 text-sm font-black">{openedPack.hotel.name}</p>
              <p lang="ja" className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-base font-bold dark:bg-slate-900">{openedPack.hotel.addressJa}</p>
              <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">{openedPack.hotel.nearestStation}</p>
            </section>

            <section aria-labelledby="offline-emergency-title" className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/20">
              <h4 id="offline-emergency-title" className="font-black text-red-950 dark:text-red-100">🆘 緊急聯絡</h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {openedPack.emergency.map((contact) => (
                  <a key={contact.number} href={`tel:${contact.number.replace(/[^\d+]/g, "")}`} className="min-h-11 rounded-xl bg-white px-3 py-2 text-sm font-black text-red-900 shadow-sm dark:bg-slate-900 dark:text-red-100">
                    <span className="block">{contact.label} · {contact.number}</span>
                    <span lang="ja" className="mt-0.5 block text-[11px] font-bold">{contact.japanese}</span>
                  </a>
                ))}
              </div>
            </section>
          </div>

          <section aria-labelledby="offline-itinerary-title" className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <h4 id="offline-itinerary-title" className="font-black text-slate-950 dark:text-white">📅 行程快照</h4>
            <div className="mt-3 space-y-2">
              {Object.entries(openedPack.itinerary).map(([dayKey, day], index) => (
                <details key={dayKey} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900" open={index === 0}>
                  <summary className="min-h-11 cursor-pointer py-2 font-black">
                    Day {index + 1} · {day.date} · {day.title}
                  </summary>
                  <ol className="space-y-2 pb-2">
                    {day.activities.map((activity, activityIndex) => (
                      <li key={activity.syncId ?? `${activity.time}-${activity.name}-${activityIndex}`} className="flex gap-3 text-sm">
                        <span className="w-12 shrink-0 font-mono font-black text-indigo-700 dark:text-indigo-300">{activity.time}</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{activity.name}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          </section>

          <section aria-labelledby="offline-phrases-title" className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <h4 id="offline-phrases-title" className="font-black text-slate-950 dark:text-white">🗣️ 常用日語</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {openedPack.phrases.map((phrase) => (
                <div key={phrase.ja} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{phrase.zh}</div>
                  <div lang="ja" className="mt-1 font-black text-slate-950 dark:text-white">{phrase.ja}</div>
                </div>
              ))}
            </div>
          </section>
        </article>
      )}
    </section>
  );
}
