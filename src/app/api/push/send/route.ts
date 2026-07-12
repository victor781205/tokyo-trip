import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMessagingSafe } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServerSupabase, isForbiddenRpcError } from "@/lib/supabase-server";

/**
 * POST /api/push/send
 *
 * 對指定 trip_id 的所有訂閱者發送推播。
 * 認證：body 帶 trip_id + trip_secret；
 * 訂閱讀取走 SECURITY DEFINER RPC list_push_subscriptions。
 */

const bodySchema = z.object({
  trip_id: z.string().min(1).max(64),
  trip_secret: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  data: z.record(z.string(), z.unknown()).optional(),
});

type PushSubscriptionRow = {
  token: string;
  platform: "web" | "ios" | "android";
  keys: { p256dh?: string; auth?: string } | null;
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const { allowed, remaining, retryAfter } = checkRateLimit(`push-send:${ip}`, 20, 60_000);
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

  const { trip_id, trip_secret, title, body, data } = parsed.data;

  // 1. 透過 RPC 驗證 secret 並取得訂閱（函式內比對 secret）
  const { data: subs, error: subsErr } = await client.rpc("list_push_subscriptions", {
    p_trip_id: trip_id,
    p_trip_secret: trip_secret,
  });

  if (subsErr) {
    if (isForbiddenRpcError(subsErr.message) || subsErr.code === "42501") {
      return NextResponse.json({ error: "代號或密碼錯誤" }, { status: 403 });
    }
    if (subsErr.message?.includes("Could not find the function") || subsErr.code === "PGRST202") {
      return NextResponse.json(
        {
          error: "推播 RPC 尚未安裝",
          detail: subsErr.message,
          hint: "請執行 supabase/migrations/20260709040000_push_rpc_security_definer.sql",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "查詢訂閱失敗", detail: subsErr.message }, { status: 500 });
  }

  const rows = (subs ?? []) as PushSubscriptionRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "此行程尚無任何推播訂閱" });
  }

  // 2. 分類 token
  const nativeTokens = rows
    .filter((s) => s.platform === "ios" || s.platform === "android")
    .map((s) => s.token);

  const webSubs = rows.filter((s) => s.platform === "web");

  let sentNative = 0;
  const failedNativeTokens: string[] = [];
  let sentWeb = 0;

  // 3a. FCM multicast
  if (nativeTokens.length > 0) {
    const { messaging, initError } = await getMessagingSafe();
    if (!messaging || initError) {
      return NextResponse.json(
        { error: "FCM 未設定", detail: initError ?? "firebase-admin 未初始化" },
        { status: 503 },
      );
    }

    try {
      for (let i = 0; i < nativeTokens.length; i += 500) {
        const batch = nativeTokens.slice(i, i + 500);
        const res = await messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title, body },
          data: stringifyData(data),
          android: { priority: "high" },
          apns: {
            payload: {
              aps: { sound: "default", badge: 1 },
            },
          },
        });
        sentNative += res.successCount;
        res.responses.forEach((r, idx) => {
          if (!r.success && r.error) {
            failedNativeTokens.push(batch[idx]);
          }
        });
      }
    } catch (e) {
      return NextResponse.json(
        { error: "FCM 發送失敗", detail: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }

    if (failedNativeTokens.length > 0) {
      await client.rpc("delete_push_tokens", {
        p_trip_id: trip_id,
        p_trip_secret: trip_secret,
        p_tokens: failedNativeTokens,
      });
    }
  }

  // 3c. Web Push
  if (webSubs.length > 0) {
    const webRes = await sendWebPush(webSubs, title, body, data);
    sentWeb = webRes.sent;
  }

  return NextResponse.json(
    {
      ok: true,
      sent: sentNative + sentWeb,
      native: sentNative,
      web: sentWeb,
    },
    { headers: { "X-RateLimit-Remaining": String(remaining) } },
  );
}

function stringifyData(data?: Record<string, unknown>): Record<string, string> | undefined {
  if (!data) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

async function sendWebPush(
  subs: { token: string; keys: { p256dh?: string; auth?: string } | null }[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<{ sent: number }> {
  try {
    const webPush = await import("web-push");
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    let subject = process.env.VAPID_SUBJECT?.trim() || "";
    if (!subject || subject.includes("example.com") || subject.includes("local")) {
      subject = "mailto:victor781205@gmail.com";
    }

    if (!privateKey || !publicKey) {
      console.warn("[push] web-push 缺 VAPID 金鑰，跳過 web 發送");
      return { sent: 0 };
    }

    webPush.setVapidDetails(subject, publicKey, privateKey);

    const payload = JSON.stringify({ title, body, data });
    let sent = 0;

    for (const s of subs) {
      if (!s.keys?.p256dh || !s.keys?.auth) continue;
      const subscription = {
        endpoint: s.token,
        keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
      };
      try {
        await webPush.sendNotification(subscription, payload);
        sent++;
      } catch (e: unknown) {
        const err = e as { message?: string; statusCode?: number; body?: string };
        console.warn("[push] web-push 失敗:", {
          message: err?.message || String(e),
          statusCode: err?.statusCode,
          body: err?.body,
        });
      }
    }
    return { sent };
  } catch (e) {
    console.warn("[push] web-push 模組載入失敗", e);
    return { sent: 0 };
  }
}

export const runtime = "nodejs";
