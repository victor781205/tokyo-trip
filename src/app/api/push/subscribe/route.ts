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

const subscriptionBodySchema = z.object({
  trip_id: z.string().min(1).max(64),
  trip_secret: z.string().min(1).max(128),
  token: z.string().min(1).max(2048),
  platform: z.enum(["web", "ios", "android"]),
  keys: z
    .object({
      p256dh: z.string().min(16).max(512).optional(),
      auth: z.string().min(8).max(256).optional(),
    })
    .optional(),
});

const bodySchema = subscriptionBodySchema.superRefine((value, ctx) => {
  if (value.platform === "web") {
    try {
      const endpoint = new URL(value.token);
      if (endpoint.protocol !== "https:") throw new Error("insecure endpoint");
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["token"],
        message: "Web Push endpoint 必須是有效的 HTTPS URL",
      });
    }
    if (!value.keys?.p256dh || !value.keys.auth) {
      ctx.addIssue({
        code: "custom",
        path: ["keys"],
        message: "Web Push 缺少加密金鑰",
      });
    }
  }
});

const deleteBodySchema = subscriptionBodySchema.pick({
  trip_id: true,
  trip_secret: true,
  token: true,
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
          hint: "請執行 npx supabase db push --linked 套用目前所有 migrations",
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

/** Remove this device's token from the trip before clearing the local marker. */
export async function DELETE(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const { allowed, remaining, retryAfter } = checkRateLimit("push-unsub:" + ip, 30, 60_000);
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

  const parsed = deleteBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "參數錯誤", detail: parsed.error.flatten() }, { status: 422 });
  }

  const { trip_id, trip_secret, token } = parsed.data;
  const { data, error } = await client.rpc("delete_push_tokens", {
    p_trip_id: trip_id,
    p_trip_secret: trip_secret,
    p_tokens: [token],
  });

  if (error) {
    if (isForbiddenRpcError(error.message) || error.code === "42501") {
      return NextResponse.json({ error: "代號或密碼錯誤" }, { status: 403 });
    }
    if (error.message?.includes("Could not find the function") || error.code === "PGRST202") {
      return NextResponse.json({ error: "推播刪除 RPC 尚未安裝", detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "取消訂閱失敗", detail: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, data },
    { headers: { "X-RateLimit-Remaining": String(remaining) } },
  );
}

export const runtime = "nodejs";
