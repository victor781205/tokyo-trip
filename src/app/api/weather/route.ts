import { NextResponse } from "next/server";
import {
  parseTokyoForecast,
  parseTokyoObservedTemperature,
} from "@/lib/jma-forecast";

const FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json";
const LATEST_AMEDAS_TIME_URL = "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt";
const TOKYO_AMEDAS_STATION = "44132";
const FORECAST_STALE_AFTER_MS = 18 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? value as JsonRecord : null;
}

function reportDatetime(payload: unknown): string | null {
  if (!Array.isArray(payload)) return null;
  const value = record(payload[0])?.reportDatetime;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
    ? value
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return array(value).map((item) => String(item ?? ""));
}

function firstArea(series: unknown): JsonRecord | null {
  return record(array(record(series)?.areas)[0]);
}

/** Japan does not observe daylight saving time, so this is stable year-round. */
function tokyoIsoClock(now: Date): string {
  const local = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}+09:00`;
}

function trimSeriesBeforeDate(seriesValue: unknown, isoDate: string): unknown {
  const series = record(seriesValue);
  if (!series) return seriesValue;

  const timeDefines = strings(series.timeDefines);
  if (timeDefines.length === 0) return seriesValue;
  const keep = timeDefines.flatMap((dateTime, index) =>
    dateTime.slice(0, 10) >= isoDate ? [index] : []
  );
  if (keep.length === timeDefines.length) return seriesValue;

  const areas = array(series.areas).map((areaValue) => {
    const area = record(areaValue);
    if (!area) return areaValue;
    return Object.fromEntries(Object.entries(area).map(([key, value]) => [
      key,
      Array.isArray(value) && value.length === timeDefines.length
        ? keep.map((index) => value[index])
        : value,
    ]));
  });

  return {
    ...series,
    timeDefines: keep.map((index) => timeDefines[index]),
    areas,
  };
}

/**
 * A 17:00 JMA report legitimately remains current after midnight, but its first
 * short-term slot belongs to yesterday. Drop only those expired slots when the
 * payload contains a real Tokyo-today slot; otherwise retain the source intact
 * so stale data is never relabelled as today.
 */
function alignShortForecastToTokyoDate(payload: unknown, isoDate: string): unknown {
  const roots = array(payload);
  const shortRoot = record(roots[0]);
  if (!shortRoot) return payload;
  const shortSeries = array(shortRoot.timeSeries);
  const weatherDates = strings(record(shortSeries[0])?.timeDefines);
  if (!weatherDates.some((dateTime) => dateTime.slice(0, 10) === isoDate)) {
    return payload;
  }

  return roots.map((rootValue, index) => index === 0
    ? {
        ...shortRoot,
        timeSeries: shortSeries.map((series) => trimSeriesBeforeDate(series, isoDate)),
      }
    : rootValue
  );
}

function validTemperature(value: unknown): string | undefined {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
  const numeric = Number(text);
  return text && Number.isFinite(numeric) && numeric >= -60 && numeric <= 60
    ? text
    : undefined;
}

/** Read only values explicitly tied to the requested date in JMA's payload. */
function sameDateForecastTemperatures(
  payload: unknown,
  isoDate: string,
): { min?: string; max?: string } {
  const roots = array(payload);
  const shortSeries = array(record(roots[0])?.timeSeries);
  const shortTemps = record(shortSeries[2]);
  const shortTimes = strings(shortTemps?.timeDefines);
  const shortValues = strings(firstArea(shortTemps)?.temps);
  let min: string | undefined;
  let max: string | undefined;

  shortTimes.forEach((dateTime, index) => {
    if (dateTime.slice(0, 10) !== isoDate) return;
    const value = validTemperature(shortValues[index]);
    if (dateTime.slice(11, 13) === "00") min ??= value;
    if (dateTime.slice(11, 13) === "09") max ??= value;
  });

  const weeklySeries = array(record(roots[1])?.timeSeries);
  const weeklyDates = strings(record(weeklySeries[0])?.timeDefines);
  const weeklyIndex = weeklyDates.findIndex((dateTime) => dateTime.slice(0, 10) === isoDate);
  if (weeklyIndex >= 0) {
    const weeklyArea = firstArea(weeklySeries[1]);
    min ??= validTemperature(array(weeklyArea?.tempsMin)[weeklyIndex]);
    max ??= validTemperature(array(weeklyArea?.tempsMax)[weeklyIndex]);
  }

  return { min, max };
}

function observationBlockUrls(isoDateTime: string): string[] {
  const match = isoDateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):/);
  if (!match) return [];
  const [, year, month, day, hourText] = match;
  const hour = Number.parseInt(hourText, 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return [];
  const lastBlock = Math.floor(hour / 3) * 3;
  const compactDate = `${year}${month}${day}`;
  return Array.from({ length: lastBlock / 3 + 1 }, (_, index) => {
    const block = String(index * 3).padStart(2, "0");
    return `https://www.jma.go.jp/bosai/amedas/data/point/${TOKYO_AMEDAS_STATION}/${compactDate}_${block}.json`;
  });
}

async function fetchJson(url: string, revalidate: number): Promise<unknown> {
  const response = await fetch(url, { next: { revalidate } });
  if (!response.ok) throw new Error(`JMA upstream returned ${response.status}`);
  return response.json();
}

async function fetchLatestAmedasTime(): Promise<string | null> {
  const response = await fetch(LATEST_AMEDAS_TIME_URL, { next: { revalidate: 300 } });
  if (!response.ok) return null;
  const value = (await response.text()).trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value : null;
}

export async function GET() {
  try {
    const retrievedAt = new Date();
    const tokyoClock = tokyoIsoClock(retrievedAt);
    const todayIso = tokyoClock.slice(0, 10);
    const [forecastPayload, latestAmedasTime] = await Promise.all([
      fetchJson(FORECAST_URL, 600),
      fetchLatestAmedasTime().catch(() => null),
    ]);
    const issuedAt = reportDatetime(forecastPayload);
    if (!issuedAt) throw new Error("JMA forecast is missing reportDatetime");

    const observationClock = latestAmedasTime?.slice(0, 10) === todayIso
      ? latestAmedasTime
      : tokyoClock;
    const observationResults = await Promise.allSettled(
      observationBlockUrls(observationClock).map((url) => fetchJson(url, 300)),
    );
    const observationPayloads = observationResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    const observed = parseTokyoObservedTemperature(observationPayloads, todayIso);
    const alignedPayload = alignShortForecastToTokyoDate(forecastPayload, todayIso);
    const forecast = parseTokyoForecast(alignedPayload, observed);
    if (forecast.length === 0) throw new Error("JMA forecast is incomplete");

    const sameDateTemps = sameDateForecastTemperatures(alignedPayload, todayIso);
    const firstDay = forecast[0];
    if (firstDay?.date === `${Number(todayIso.slice(5, 7))}/${Number(todayIso.slice(8, 10))}`) {
      if (firstDay.tempMin === "--" && sameDateTemps.min) firstDay.tempMin = sameDateTemps.min;
      if (firstDay.tempMax === "--" && sameDateTemps.max) firstDay.tempMax = sameDateTemps.max;
    }

    const sourceAgeMs = Math.max(0, retrievedAt.getTime() - Date.parse(issuedAt));

    return NextResponse.json(
      {
        forecast,
        updatedAt: issuedAt,
        retrievedAt: retrievedAt.toISOString(),
        stale: sourceAgeMs > FORECAST_STALE_AFTER_MS,
        observationStatus: observed ? "ready" : "unavailable",
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    console.error("Weather API failed", error);
    return NextResponse.json(
      { error: "目前無法取得日本氣象廳資料" },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export const runtime = "nodejs";
