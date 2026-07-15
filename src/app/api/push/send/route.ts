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
  trip_secret: z.string().min(1).max(128),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  data: z.record(z.string(), z.unknown()).optional(),
});

type PushSubscriptionRow = {
  token: string;
  platform: "web" | "ios" | "android";
  keys: { p256dh?: string; auth?: string } | null;
};

type ChannelDeliveryResult = {
  requested: number;
  sent: number;
  failed: number;
  error?: string;
};

type WebPushResult = ChannelDeliveryResult & {
  invalidTokens: string[];
  unavailable: boolean;
};

const INVALID_NATIVE_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

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
          hint: "請執行 npx supabase db push --linked 套用目前所有 migrations",
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
  const nativeTokens = [...new Set(rows
    .filter((s) => s.platform === "ios" || s.platform === "android")
    .map((s) => s.token))];

  const webSubs = rows.filter((s) => s.platform === "web");

  const nativeResult: ChannelDeliveryResult = {
    requested: nativeTokens.length,
    sent: 0,
    failed: 0,
  };
  const invalidNativeTokens: string[] = [];
  const nativeErrors = new Set<string>();
  let nativeUnavailable = false;

  // 3a. FCM multicast
  if (nativeTokens.length > 0) {
    const { messaging, initError } = await getMessagingSafe();
    if (!messaging || initError) {
      nativeUnavailable = true;
      nativeResult.failed = nativeTokens.length;
      nativeResult.error = `FCM 未設定：${initError ?? "firebase-admin 未初始化"}`;
    } else {
      for (let i = 0; i < nativeTokens.length; i += 500) {
        const batch = nativeTokens.slice(i, i + 500);
        try {
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
          nativeResult.sent += res.successCount;
          res.responses.forEach((response, idx) => {
            if (response.success) return;
            nativeResult.failed++;
            const code = response.error?.code;
            if (code) nativeErrors.add(code);
            if (code && INVALID_NATIVE_TOKEN_CODES.has(code)) {
              invalidNativeTokens.push(batch[idx]);
            }
          });
        } catch (error) {
          nativeResult.failed += batch.length;
          nativeErrors.add(error instanceof Error ? error.message : String(error));
        }
      }
      if (nativeErrors.size > 0) {
        nativeResult.error = [...nativeErrors].join("；");
      }
    }
  }

  // 3b. Web Push 與 FCM 是獨立通道；即使 FCM 未設定或某批失敗也必須照常嘗試。
  const webResult = await sendWebPush(webSubs, title, body, data);

  // 只清除供應商明確判定失效的 token：FCM invalid/unregistered、Web Push 404/410。
  const invalidTokens = [...new Set([
    ...invalidNativeTokens,
    ...webResult.invalidTokens,
  ])];
  let cleanupError: string | undefined;
  if (invalidTokens.length > 0) {
    try {
      const cleanup = await client.rpc("delete_push_tokens", {
        p_trip_id: trip_id,
        p_trip_secret: trip_secret,
        p_tokens: invalidTokens,
      });
      if (cleanup.error) {
        cleanupError = cleanup.error.message;
      }
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error);
    }
  }

  const sent = nativeResult.sent + webResult.sent;
  const failed = nativeResult.failed + webResult.failed;
  const hasFailure = failed > 0 || Boolean(cleanupError);
  const partial = sent > 0 && hasFailure;
  const unavailable = nativeUnavailable || webResult.unavailable;
  const status = hasFailure
    ? partial
      ? 207
      : unavailable
        ? 503
        : 502
    : 200;

  return NextResponse.json(
    {
      ok: !hasFailure,
      partial,
      sent,
      failed,
      native: nativeResult.sent,
      web: webResult.sent,
      channels: {
        native: nativeResult,
        web: {
          requested: webResult.requested,
          sent: webResult.sent,
          failed: webResult.failed,
          ...(webResult.error ? { error: webResult.error } : {}),
        },
      },
      removedInvalidTokens: invalidTokens.length,
      ...(cleanupError ? { cleanupError } : {}),
    },
    {
      status,
      headers: { "X-RateLimit-Remaining": String(remaining) },
    },
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
): Promise<WebPushResult> {
  const result: WebPushResult = {
    requested: subs.length,
    sent: 0,
    failed: 0,
    invalidTokens: [],
    unavailable: false,
  };
  if (subs.length === 0) return result;

  try {
    const webPush = await import("web-push");
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    let subject = process.env.VAPID_SUBJECT?.trim() || "";
    if (!subject || subject.includes("example.com") || subject.includes("local")) {
      subject = "mailto:victor781205@gmail.com";
    }

    if (!privateKey || !publicKey) {
      result.failed = subs.length;
      result.unavailable = true;
      result.error = "Web Push 未設定：缺少 VAPID 金鑰";
      console.warn("[push] web-push 缺 VAPID 金鑰");
      return result;
    }

    webPush.setVapidDetails(subject, publicKey, privateKey);

    const payload = JSON.stringify({ title, body, data });
    const errors = new Set<string>();

    for (const s of subs) {
      if (!s.keys?.p256dh || !s.keys?.auth) {
        result.failed++;
        errors.add("訂閱缺少 Web Push 金鑰");
        continue;
      }
      const subscription = {
        endpoint: s.token,
        keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
      };
      try {
        await webPush.sendNotification(subscription, payload);
        result.sent++;
      } catch (e: unknown) {
        const err = e as { message?: string; statusCode?: number; body?: string };
        result.failed++;
        errors.add(err?.statusCode ? `HTTP ${err.statusCode}` : err?.message || "Web Push 發送失敗");
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          result.invalidTokens.push(s.token);
        }
        console.warn("[push] web-push 失敗:", {
          message: err?.message || String(e),
          statusCode: err?.statusCode,
          body: err?.body,
        });
      }
    }
    if (errors.size > 0) result.error = [...errors].join("；");
    return result;
  } catch (e) {
    result.failed = subs.length;
    result.unavailable = true;
    result.error = e instanceof Error ? e.message : String(e);
    console.warn("[push] web-push 模組載入失敗", e);
    return result;
  }
}

export const runtime = "nodejs";
