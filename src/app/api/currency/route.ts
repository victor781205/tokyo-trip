import { NextResponse } from "next/server";

const CURRENCY_API_KEY = process.env.CURRENCY_API_KEY?.trim() ?? "";

export async function GET() {
  if (!CURRENCY_API_KEY) {
    // Fallback rate if key not configured
    return NextResponse.json({ rate: 4.65, source: "fallback" });
  }

  try {
    const res = await fetch(
      `https://currencyapi.net/api/v2/rates?base=TWD&output=json&key=${CURRENCY_API_KEY}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );

    if (!res.ok) {
      throw new Error(`Currency API returned ${res.status}`);
    }

    const data = await res.json();
    const jpyRate = data.rates.JPY;

    return NextResponse.json({ rate: jpyRate, source: "live" });
  } catch (error) {
    console.error("[Currency API] Fetch failed:", error);
    return NextResponse.json({ rate: 4.65, source: "fallback" });
  }
}
