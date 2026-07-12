import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "edge";

// 預設匯率：1 TWD = 4.65 JPY（無法取得每日參考匯率時的 fallback）
const FALLBACK_RATE = 4.65;
// Open Access 來源每日更新一次，依官方建議快取 24 小時。
const CACHE_MAX_AGE = 86_400;

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
  const { allowed, remaining, retryAfter } = checkRateLimit(`currency:${ip}`, 30, 60_000);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const setCommonHeaders = (extra?: Record<string, string>) => ({
    "X-RateLimit-Remaining": String(remaining),
    "Cache-Control": `public, max-age=3600, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_MAX_AGE}`,
    ...extra,
  });

  try {
    // 使用 open.er-api.com 的每日 Open Access 參考匯率。
    const res = await fetch("https://open.er-api.com/v6/latest/JPY", {
      next: { revalidate: CACHE_MAX_AGE },
    });

    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }

    const data = await res.json();
    if (data?.result !== "success") {
      throw new Error(`Upstream result was ${String(data?.result ?? "missing")}`);
    }
    // open.er-api.com 回傳的是以 JPY 為基準，data.rates.TWD 代表 1 JPY 可以換多少 TWD
    // （例如 0.215）。使用者界面需要的是 1 TWD 可以換多少 JPY，所以是 1 / data.rates.TWD
    // （例如 1 / 0.215 = 4.65）
    const twdPerJpy =
      data?.rates?.TWD && typeof data.rates.TWD === "number" ? data.rates.TWD : null;

    if (!twdPerJpy || twdPerJpy === 0) {
      throw new Error("Invalid TWD rate in upstream response");
    }

    const rate = 1 / twdPerJpy;
    const upstreamUpdatedAt = (() => {
      if (typeof data.time_last_update_unix === "number") {
        const value = new Date(data.time_last_update_unix * 1000);
        if (!Number.isNaN(value.getTime())) return value.toISOString();
      }
      const parsed = Date.parse(String(data.time_last_update_utc ?? ""));
      return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
    })();

    return NextResponse.json(
      {
        rate,
        sourceUpdatedAt: upstreamUpdatedAt,
        retrievedAt: new Date().toISOString(),
        source: "ExchangeRate-API Open Access",
      },
      { headers: setCommonHeaders() }
    );
  } catch (error) {
    console.error("[Currency API] fetch failed:", error);
    return NextResponse.json(
      {
        rate: FALLBACK_RATE,
        sourceUpdatedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        source: "fallback",
        error: "無法取得每日參考匯率，使用預設值",
      },
      { headers: setCommonHeaders({ "Cache-Control": "public, max-age=300, s-maxage=300" }) }
    );
  }
}
