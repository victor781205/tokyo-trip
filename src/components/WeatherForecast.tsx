"use client";

import { useEffect, useState } from "react";
import { Calendar, ChevronDown, Clock3, Cloud, CloudRain, Snowflake, Sun } from "lucide-react";
import {
  getJmaWeatherKind,
  getJmaWeatherLabel,
  parseTokyoForecastResponse,
  type TokyoForecastDay,
} from "@/lib/jma-forecast";
import { getTripTimelineState } from "@/lib/trip-dates";

const FORECAST_STALE_AFTER_MS = 18 * 60 * 60 * 1000;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

export function getWeatherFreshnessNotice(
  updatedAt: unknown,
  now = new Date(),
): string | null {
  if (typeof updatedAt !== "string") return null;
  const sourceTime = Date.parse(updatedAt);
  if (!Number.isFinite(sourceTime)) return null;
  const ageMs = now.getTime() - sourceTime;
  if (ageMs <= FORECAST_STALE_AFTER_MS) return null;
  const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
  return `日本氣象廳預報已 ${ageHours} 小時未更新，請重新取得後再安排行程。`;
}

function formatWeatherUpdatedAt(updatedAt: string | null): string | null {
  if (!updatedAt) return null;
  const sourceTime = new Date(updatedAt);
  if (Number.isNaN(sourceTime.getTime())) return null;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(sourceTime);
}

export function getForecastScopeNotice(now = new Date()): string | null {
  if (getTripTimelineState(now).phase !== "pre") return null;
  return "目前顯示自今天起的一週預報，並非 9/1–9/6 的旅程預報；接近出發日請再次確認。";
}

export function WeatherForecast() {
  const [forecast, setForecast] = useState<TokyoForecastDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [sourceMarkedStale, setSourceMarkedStale] = useState(false);
  const [requestKey, setRequestKey] = useState(0);
  const [showAllForecast, setShowAllForecast] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchWeather() {
      try {
        const res = await fetch("/api/weather");
        if (!res.ok) throw new Error(`JMA 回應錯誤 (${res.status})`);
        const data: unknown = await res.json();
        const nextForecast = parseTokyoForecastResponse(data);
        if (nextForecast.length === 0) throw new Error("JMA 回傳內容不完整");
        if (cancelled) return;
        const metadata = record(data);
        setForecast(nextForecast);
        setUpdatedAt(typeof metadata?.updatedAt === "string" ? metadata.updatedAt : null);
        setSourceMarkedStale(metadata?.stale === true);
        setError(null);
      } catch (e) {
        console.error("Weather fetch failed", e);
        if (cancelled) return;
        setError("目前無法取得日本氣象廳資料，請檢查網路後重試。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchWeather();
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const retry = () => {
    setLoading(true);
    setError(null);
    setRequestKey((value) => value + 1);
  };

  const getWeatherIcon = (code: string) => {
    switch (getJmaWeatherKind(code)) {
      case "sunny": return <Sun aria-hidden="true" className="w-8 h-8 text-yellow-600 dark:text-yellow-300" />;
      case "cloudy": return <Cloud aria-hidden="true" className="w-8 h-8 text-gray-500 dark:text-gray-300" />;
      case "rain": return <CloudRain aria-hidden="true" className="w-8 h-8 text-blue-600 dark:text-blue-300" />;
      case "snow": return <Snowflake aria-hidden="true" className="w-8 h-8 text-sky-600 dark:text-sky-300" />;
      default: return <Cloud aria-hidden="true" className="w-8 h-8 text-gray-500 dark:text-gray-300" />;
    }
  };

  const scopeNotice = getForecastScopeNotice();
  const updatedAtLabel = formatWeatherUpdatedAt(updatedAt);
  const freshnessNotice = getWeatherFreshnessNotice(updatedAt)
    ?? (sourceMarkedStale ? "日本氣象廳預報目前標示為過期，請重新取得後再安排行程。" : null);

  if (loading) {
    return (
      <section id="weather" className="py-4 md:py-12 max-w-5xl mx-auto scroll-mt-28">
        <div className="bg-white dark:bg-slate-800 rounded-[3rem] p-8 md:p-12 shadow-xl border border-gray-100 dark:border-slate-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <div className="h-9 w-48 bg-gray-200 dark:bg-slate-700 rounded-xl animate-pulse mb-3" />
              <div className="h-5 w-36 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            </div>
            <div className="h-10 w-32 bg-gray-100 dark:bg-slate-700 rounded-2xl animate-pulse" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center p-4 bg-gray-50 dark:bg-slate-900/50 rounded-2xl">
                <div className="h-5 w-10 bg-gray-200 dark:bg-slate-700 rounded-lg animate-pulse mb-3" />
                <div className="w-10 h-10 bg-gray-200 dark:bg-slate-700 rounded-full animate-pulse mb-3" />
                <div className="flex gap-2">
                  <div className="h-5 w-8 bg-red-100 dark:bg-red-900/20 rounded animate-pulse" />
                  <div className="h-5 w-8 bg-blue-100 dark:bg-blue-900/20 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section id="weather" className="py-4 md:py-12 max-w-5xl mx-auto scroll-mt-28">
        <div className="bg-white dark:bg-slate-800 rounded-[3rem] p-8 md:p-12 shadow-xl border border-gray-100 dark:border-slate-700 text-center">
          <CloudRain className="w-12 h-12 text-sky-500 mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-black mb-2">東京天氣暫時無法取得</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6" role="alert">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="min-h-11 px-6 rounded-2xl bg-primary text-white font-black shadow-lg shadow-primary/20"
          >
            重新取得天氣
          </button>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-4">資料來源：日本氣象廳 (JMA)</p>
        </div>
      </section>
    );
  }

  return (
    <section id="weather" className="py-4 md:py-12 max-w-5xl mx-auto scroll-mt-28">
      <div className="trip-card bg-white dark:bg-slate-800 rounded-[3rem] p-6 md:p-10 shadow-xl border border-gray-100 dark:border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Calendar className="text-primary w-8 h-8" /> 東京一週天氣
            </h2>
            <p className="text-gray-500">
              資料來源：日本氣象廳 (JMA)
              {updatedAtLabel && ` · 東京時間 ${updatedAtLabel} 更新`}
            </p>
            {scopeNotice && (
              <p className="mt-2 max-w-xl text-sm font-bold text-amber-700 dark:text-amber-300">
                {scopeNotice}
              </p>
            )}
          </div>
          <div className="bg-primary/10 text-primary px-6 py-2 rounded-2xl font-bold">
            Tokyo, Japan
          </div>
        </div>

        {freshnessNotice && (
          <div
            className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
            role="status"
            aria-live="polite"
          >
            <p className="flex items-start gap-2 text-sm font-bold">
              <Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {freshnessNotice}
            </p>
            <button
              type="button"
              onClick={retry}
              className="min-h-11 shrink-0 rounded-xl border border-amber-400 px-4 text-sm font-black hover:bg-amber-100 dark:border-amber-600 dark:hover:bg-amber-900/50"
            >
              重新取得
            </button>
          </div>
        )}

        <div id="weather-forecast-days" className="grid grid-cols-1 min-[360px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
          {forecast.map((day, i) => (
            <div
              key={`${day.date}-${i}`}
              className={`${i >= 3 && !showAllForecast ? "hidden sm:flex" : "flex"} flex-col items-center p-3 sm:p-4 bg-gray-50 dark:bg-slate-900/50 rounded-2xl border border-transparent hover:border-primary/30 transition-all`}
            >
              <span className="text-base font-bold text-gray-500 mb-3">{day.date}</span>
              <div className="mb-3" role="img" aria-label={`天氣：${getJmaWeatherLabel(day.weather)}`}>{getWeatherIcon(day.weather)}</div>
              <div className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 text-sm sm:text-base font-black">
                <span
                  className="inline-flex items-baseline gap-1 text-red-700 dark:text-red-300"
                  aria-label={`最高溫 ${day.tempMax === "--" ? "未提供" : `${day.tempMax} 度`}`}
                >
                  <span aria-hidden="true" className="text-[10px] font-bold opacity-70">高</span>
                  <span aria-hidden="true">{day.tempMax === "--" ? "—" : `${day.tempMax}°`}</span>
                </span>
                <span
                  className="inline-flex items-baseline gap-1 text-blue-700 dark:text-blue-300"
                  aria-label={`最低溫 ${day.tempMin === "--" ? "未提供" : `${day.tempMin} 度`}`}
                >
                  <span aria-hidden="true" className="text-[10px] font-bold opacity-70">低</span>
                  <span aria-hidden="true">{day.tempMin === "--" ? "—" : `${day.tempMin}°`}</span>
                </span>
              </div>
              {day.temperatureNote && (
                <span className="mt-1 text-center text-[10px] font-bold leading-tight text-gray-600 dark:text-gray-300">
                  {day.temperatureNote}
                </span>
              )}
              {day.pop && parseInt(day.pop) >= 50 && (
                <span className="text-xs text-blue-700 dark:text-blue-300 font-bold mt-2">☔ {day.pop}%</span>
              )}
            </div>
          ))}
        </div>

        {forecast.length > 3 && (
          <button
            type="button"
            onClick={() => setShowAllForecast((current) => !current)}
            aria-expanded={showAllForecast}
            aria-controls="weather-forecast-days"
            className="sm:hidden mt-4 min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 font-black text-sm text-gray-700 dark:text-gray-200"
          >
            {showAllForecast ? "收起完整預報" : `查看其餘 ${forecast.length - 3} 天`}
            <ChevronDown aria-hidden="true" className={`w-4 h-4 transition-transform ${showAllForecast ? "rotate-180" : ""}`} />
          </button>
        )}

        {/* Outfit Suggestion */}
        {forecast.length > 0 && (() => {
          const dailyAverages = forecast.flatMap((day) => {
            const values = [day.tempMax, day.tempMin]
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value));
            return values.length > 0
              ? [values.reduce((sum, value) => sum + value, 0) / values.length]
              : [];
          });
          if (dailyAverages.length === 0) return null;
          const avgTemp = dailyAverages.reduce((sum, value) => sum + value, 0)
            / dailyAverages.length;
          const hasRain = forecast.some(d => parseInt(d.pop) >= 50);
          let suggestion = "";
          let icon = "👔";
          if (avgTemp > 30) { suggestion = "炎熱！建議薄短袖、短褲，攜帶陽傘和防曬"; icon = "🥵"; }
          else if (avgTemp > 25) { suggestion = "溫暖！短袖為主，備薄外套防早晚溫差"; icon = "☀️"; }
          else if (avgTemp > 20) { suggestion = "舒適！建議薄長袖，外套必備"; icon = "🌤️"; }
          else { suggestion = "涼爽！建議長袖、薄外套，攜帶雨具"; icon = "🧥"; }

          return (
            <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 rounded-[2rem]">
              <h3 className="text-lg font-black mb-3 flex items-center gap-2">
                <span aria-hidden="true" className="text-2xl">{icon}</span> 本週穿搭參考
              </h3>
              {scopeNotice && (
                <p className="mb-3 text-sm font-bold text-amber-800 dark:text-amber-200">
                  這是依目前一週預報提供的參考，不是 9/1–9/6 旅程的穿搭建議。
                </p>
              )}
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-3">{suggestion}</p>
              {hasRain && (
                <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 font-bold">
                  <span>☔</span> 本週有降雨機率，建議攜帶雨具！
                </div>
              )}
              {avgTemp > 28 && (
                <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 font-bold mt-2">
                  <span>🌡️</span> 高溫炎熱，記得多喝水補充水分！
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </section>
  );
}
