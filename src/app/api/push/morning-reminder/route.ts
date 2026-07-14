import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { DEFAULT_ITINERARY } from "@/lib/default-itinerary";
import { createServerSupabase } from "@/lib/supabase-server";
import { TRIP_OUTBOUND_DATE } from "@/lib/trip-dates";

/**
 * POST/GET /api/push/morning-reminder
 *
 * 由 Vercel Cron 每天早上固定時間呼叫（見 vercel.json）。
 * 僅使用 service_role 讀取受鎖定的推播訂閱與行程表。
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

  const { client, mode, error: clientErr } = createServerSupabase();
  const SELF_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://tokyo-trip-rosy.vercel.app";
  if (clientErr || !client || mode !== "service_role") {
    return NextResponse.json(
      { error: "推播設定未完成", detail: "需要有效的 SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 },
    );
  }

  // 1. service_role 直接讀取受鎖定表。不可退回 anon 或公開 RPC。
  const { data: subscriptions, error: subscriptionsErr } = await client
    .from("push_subscriptions")
    .select("trip_id");

  if (subscriptionsErr) {
    return NextResponse.json(
      { error: "查訂閱失敗", detail: subscriptionsErr.message },
      { status: 500 },
    );
  }

  const tripIds = [
    ...new Set(
      (subscriptions ?? [])
        .map((row) => String(row.trip_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  let tripRows: { trip_id: string; trip_secret: string; itinerary: unknown }[] = [];

  if (tripIds.length > 0) {
    const { data: rows, error: rowsErr } = await client
      .from("sync_state")
      .select("trip_id, trip_secret, itinerary")
      .in("trip_id", tripIds);

    if (rowsErr) {
      return NextResponse.json(
        { error: "查行程失敗", detail: rowsErr.message },
        { status: 500 },
      );
    }

    tripRows = (rows ?? []).flatMap((row) => {
      const tripId = String(row.trip_id ?? "").trim();
      const tripSecret = String(row.trip_secret ?? "").trim();
      return tripId && tripSecret
        ? [{ trip_id: tripId, trip_secret: tripSecret, itinerary: row.itinerary }]
        : [];
    });
  }
  const today = getTokyoDate();
  const deliveryDate = formatDate(today);
  const results: { trip_id: string; sent: boolean; detail?: string }[] = [];

  for (const s of tripRows) {
    const remoteItinerary = s.itinerary as Record<
      string,
      { title?: string; date?: string; activities?: { time: string; name: string }[] }
    > | null;
    const itinerary =
      remoteItinerary && Object.keys(remoteItinerary).length > 0 ? remoteItinerary : DEFAULT_ITINERARY;

    const dayKey = Object.keys(itinerary).find((k) => {
      const plan = itinerary[k];
      if (!plan) return false;
      const planDate = parseTripDate(plan.date);
      return planDate?.year === today.year
        && planDate.month === today.month
        && planDate.day === today.day;
    });

    const todayPlan = dayKey ? itinerary[dayKey] : null;
    const activities = todayPlan?.activities ?? [];
    if (activities.length === 0) continue;

    const { error: claimError } = await client
      .from("push_delivery_log")
      .insert({
        trip_id: s.trip_id,
        delivery_date: deliveryDate,
        delivery_type: "morning-reminder",
      });

    if (claimError?.code === "23505") {
      results.push({
        trip_id: s.trip_id,
        sent: false,
        detail: "今日提醒已處理，略過重複執行",
      });
      continue;
    }
    if (claimError) {
      return NextResponse.json(
        { error: "無法建立推播防重紀錄", detail: claimError.message },
        { status: 500 },
      );
    }

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
          trip_id: s.trip_id,
          trip_secret: s.trip_secret,
          title,
          body,
          data: { type: "morning-reminder", day: dayKey, url: "/?tab=itinerary" },
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        partial?: boolean;
        sent?: number;
        error?: string;
      };
      const delivered = res.ok && (
        json.ok === true
        || (json.partial === true && (json.sent ?? 0) > 0)
      );
      if (!delivered) {
        await releaseDeliveryClaim(client, s.trip_id, deliveryDate);
      }
      results.push({
        trip_id: s.trip_id,
        sent: delivered,
        detail: delivered
          ? (json.partial ? "部分通道成功，共發送 " : "發送 ") + (json.sent ?? 0) + " 則"
          : json.error ?? "發送失敗 (" + res.status + ")",
      });
    } catch (e) {
      await releaseDeliveryClaim(client, s.trip_id, deliveryDate);
      results.push({
        trip_id: s.trip_id,
        sent: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
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

function formatDate(date: { year: number; month: number; day: number }): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return String(date.year) + "-" + pad(date.month) + "-" + pad(date.day);
}

async function releaseDeliveryClaim(
  client: ReturnType<typeof createServerSupabase>["client"],
  tripId: string,
  deliveryDate: string,
) {
  if (!client) return;
  const { error } = await client
    .from("push_delivery_log")
    .delete()
    .eq("trip_id", tripId)
    .eq("delivery_date", deliveryDate)
    .eq("delivery_type", "morning-reminder");
  if (error) console.warn("[morning-reminder] 無法釋放防重紀錄", error.message);
}

function getTokyoDate(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function parseTripDate(value?: string): { year: number; month: number; day: number } | null {
  if (!value) return null;

  const iso = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }

  const local = value.match(/\b(\d{1,2})\s*[/.]\s*(\d{1,2})\b/);
  if (local) {
    return {
      year: Number(TRIP_OUTBOUND_DATE.slice(0, 4)),
      month: Number(local[1]),
      day: Number(local[2]),
    };
  }

  return null;
}
