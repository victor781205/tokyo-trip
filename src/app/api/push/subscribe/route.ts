import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServerSupabase, isForbiddenRpcError } from "@/lib/supabase-server";

/**
 * POST /api/push/subscribe
 *
 * 接收前端（web 或 native）回報的推播 token / endpoint。
 * 透過 SECURITY DEFINER RPC `upsert_push_subscription` 驗證 trip_secret 後寫入。
 * 不依賴 service_role 直連表（Vercel key 常缺/誤填）。
 */

const bodySchema = z.object({
  trip_id: z.string().min(1).max(64),
  trip_secret: z.string().min(1).max(128),
  token: z.string().min(1).max(2048),
  platform: z.enum(["web", "ios", "android"]),
  keys: z
    .object({
      p256dh: z.string().optional(),
      auth: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const { allowed, remaining, retryAfter } = checkRateLimit(`push-sub:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const { client, error: clientErr } = createServerSupabase();
  if (clientErr || !client) {
    return NextResponse.json({ error: "推播設定未完成（Supabase）", detail: clientErr }, { status: 500 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "參數錯誤", detail: parsed.error.flatten() }, { status: 422 });
  }

  const { trip_id, trip_secret, token, platform, keys } = parsed.data;

  const { data, error } = await client.rpc("upsert_push_subscription", {
    p_trip_id: trip_id,
    p_trip_secret: trip_secret,
    p_token: token,
    p_platform: platform,
    p_keys: keys ?? null,
  });

  if (error) {
    if (isForbiddenRpcError(error.message) || error.code === "42501") {
      return NextResponse.json({ error: "代號或密碼錯誤" }, { status: 403 });
    }
    // RPC 尚未建立
    if (error.message?.includes("Could not find the function") || error.code === "PGRST202") {
      return NextResponse.json(
        {
          error: "推播 RPC 尚未安裝",
          detail: error.message,
          hint: "請在 Supabase SQL Editor 執行 supabase/migrations/20260709040000_push_rpc_security_definer.sql",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "寫入失敗", detail: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, data },
    { headers: { "X-RateLimit-Remaining": String(remaining) } },
  );
}

export const runtime = "nodejs";
