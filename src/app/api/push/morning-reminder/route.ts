import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { DEFAULT_ITINERARY } from "@/lib/default-itinerary";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * POST/GET /api/push/morning-reminder
 *
 * 由 Vercel Cron 每天早上固定時間呼叫（見 vercel.json）。
 * 透過 SECURITY DEFINER RPC list_push_trips_for_cron 取得有訂閱的行程，
 * 不依賴 service_role 直連表。
 *
 * 認證：Vercel Cron 會以 `Authorization: Bearer CRON_SECRET` 呼叫。
 */

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const providedSecret = readCronSecret(req);
  if (!cronSecret || !providedSecret || !securelyEqual(providedSecret, cronSecret)) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { client, error: clientErr } = createServerSupabase();
  const SELF_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://tokyo-trip-rosy.vercel.app";
  if (clientErr || !client) {
    return NextResponse.json({ error: "推播設定未完成", detail: clientErr }, { status: 500 });
  }

  // 1. 用 cron secret 換取有訂閱的 trip 列表（含 secret，僅限 cron）
  const { data: trips, error: tripsErr } = await client.rpc("list_push_trips_for_cron", {
    p_expected_secret: cronSecret,
    p_provided_secret: providedSecret,
  });

  if (tripsErr) {
    if (tripsErr.message?.includes("Could not find the function") || tripsErr.code === "PGRST202") {
      return NextResponse.json(
        {
          error: "推播 RPC 尚未安裝",
          detail: tripsErr.message,
          hint: "請執行 supabase/migrations/20260709040000_push_rpc_security_definer.sql",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "查訂閱失敗", detail: tripsErr.message }, { status: 500 });
  }

  const tripRows = (trips ?? []) as { trip_id: string; trip_secret: string }[];
  const today = getTokyoMonthDay();
  const results: { trip_id: string; sent: boolean; detail?: string }[] = [];

  for (const s of tripRows) {
    // 讀行程：用 anon + x-trip-secret 或直接再查（有 secret 即可）
    const tripClient = createClientWithSecret(s.trip_secret);
    if (!tripClient) continue;

    const { data: row, error: rowErr } = await tripClient
      .from("sync_state")
      .select("trip_id, trip_secret, itinerary")
      .eq("trip_id", s.trip_id)
      .maybeSingle();

    if (rowErr || !row) continue;

    const remoteItinerary = row.itinerary as Record<
      string,
      { title?: string; date?: string; activities?: { time: string; name: string }[] }
    > | null;
    const itinerary =
      remoteItinerary && Object.keys(remoteItinerary).length > 0 ? remoteItinerary : DEFAULT_ITINERARY;

    const dayKey = Object.keys(itinerary).find((k) => {
      const plan = itinerary[k];
      if (!plan) return false;
      const planDate = parseMonthDay(plan.date);
      return planDate?.month === today.month && planDate.day === today.day;
    });

    const todayPlan = dayKey ? itinerary[dayKey] : null;
    const activities = todayPlan?.activities ?? [];
    if (activities.length === 0) continue;

    const summary = activities
      .slice(0, 5)
      .map((a: { time: string; name: string }) => `${a.time} ${a.name}`)
      .join("、");

    const title = `🗼 今日東京行程：${todayPlan?.title ?? "Day"}`;
    const body = `共 ${activities.length} 個活動：${summary}`;

    try {
      const res = await fetch(`${SELF_URL}/api/push/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: row.trip_id,
          trip_secret: row.trip_secret,
          title,
          body,
          data: { type: "morning-reminder", day: dayKey, url: "/?tab=itinerary" },
        }),
      });
      const json = (await res.json()) as { ok?: boolean; sent?: number };
      results.push({
        trip_id: row.trip_id,
        sent: json.ok === true,
        detail: json.ok ? `發送 ${json.sent} 則` : "發送失敗",
      });
    } catch (e) {
      results.push({
        trip_id: row.trip_id,
        sent: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

function createClientWithSecret(secret: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  return createClient(url, anon, {
    global: { headers: { "x-trip-secret": secret } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const POST = handle;
export const GET = handle;

export const runtime = "nodejs";

function readCronSecret(req: NextRequest): string | null {
  const authorization = req.headers.get("authorization");
  if (authorization !== null) {
    return authorization.match(/^Bearer ([^\r\n]+)$/i)?.[1] ?? null;
  }

  // Keep manual local/test invocation convenient, but never accept secrets in
  // production URLs where proxies and access logs can retain them.
  if (process.env["NODE_ENV"] === "production" || process.env.VERCEL_ENV) {
    return null;
  }

  return new URL(req.url).searchParams.get("secret");
}

function securelyEqual(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function getTokyoMonthDay(): { month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());

  return {
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function parseMonthDay(value?: string): { month: number; day: number } | null {
  if (!value) return null;

  const iso = value.match(/\b\d{4}-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return { month: Number(iso[1]), day: Number(iso[2]) };

  const local = value.match(/\b(\d{1,2})\s*[/.]\s*(\d{1,2})\b/);
  if (local) return { month: Number(local[1]), day: Number(local[2]) };

  return null;
}
