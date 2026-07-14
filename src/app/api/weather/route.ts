import { NextResponse } from "next/server";
import {
  parseTokyoForecast,
  parseTokyoObservedTemperature,
} from "@/lib/jma-forecast";

const FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json";
const LATEST_AMEDAS_TIME_URL = "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt";
const TOKYO_AMEDAS_STATION = "44132";

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
    const [forecastPayload, latestAmedasTime] = await Promise.all([
      fetchJson(FORECAST_URL, 600),
      fetchLatestAmedasTime().catch(() => null),
    ]);
    const issuedAt = reportDatetime(forecastPayload);
    if (!issuedAt) throw new Error("JMA forecast is missing reportDatetime");

    const todayIso = issuedAt.slice(0, 10);
    const observationClock = latestAmedasTime?.slice(0, 10) === todayIso
      ? latestAmedasTime
      : issuedAt;
    const observationResults = await Promise.allSettled(
      observationBlockUrls(observationClock).map((url) => fetchJson(url, 300)),
    );
    const observationPayloads = observationResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    const observed = parseTokyoObservedTemperature(observationPayloads, todayIso);
    const forecast = parseTokyoForecast(forecastPayload, observed);
    if (forecast.length === 0) throw new Error("JMA forecast is incomplete");

    return NextResponse.json(
      {
        forecast,
        updatedAt: issuedAt,
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
