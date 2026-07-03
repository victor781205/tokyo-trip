import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "edge";

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
  const { allowed, remaining, retryAfter } = checkRateLimit(`currency:${ip}`, 30, 60_000);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  try {
    // Frankfurter — 歐洲央行數據，穩定免費免 key
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=TWD&to=JPY",
      { next: { revalidate: 300 } } // 快取 5 分鐘
    );

    if (!res.ok) throw new Error(`Frankfurter returned ${res.status}`);

    const data = await res.json();
    const rate = data.rates.JPY as number;
    const fetchedAt = new Date().toISOString();

    return NextResponse.json(
      { rate, fetchedAt, source: "Frankfurter (ECB)" },
      {
        headers: {
          "X-RateLimit-Remaining": String(remaining),
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("[Currency API] Frankfurter failed:", error);
    return NextResponse.json(
      {
        rate: 4.65,
        fetchedAt: new Date().toISOString(),
        source: "fallback",
        error: "無法取得即時匯率，使用預設值",
      },
      {
        headers: {
          "X-RateLimit-Remaining": String(remaining),
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  }
}