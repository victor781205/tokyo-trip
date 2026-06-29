import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const CURRENCY_API_KEY = process.env.CURRENCY_API_KEY?.trim() ?? "";

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
  const { allowed, remaining, retryAfter } = checkRateLimit(`currency:${ip}`, 30, 60_000);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  if (!CURRENCY_API_KEY) {
    return NextResponse.json({ rate: 4.65, source: "fallback" });
  }

  try {
    const res = await fetch(
      `https://currencyapi.net/api/v2/rates?base=TWD&output=json&key=${CURRENCY_API_KEY}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      throw new Error(`Currency API returned ${res.status}`);
    }

    const data = await res.json();
    const jpyRate = data.rates.JPY;

    return NextResponse.json(
      { rate: jpyRate, source: "live" },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (error) {
    console.error("[Currency API] Fetch failed:", error);
    return NextResponse.json({ rate: 4.65, source: "fallback" });
  }
}
