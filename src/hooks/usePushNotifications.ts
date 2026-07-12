"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from "@capacitor/push-notifications";
import { isNativePlatform, platform, getActiveServiceWorker, isIOSBrowser, isStandaloneWebApp, waitForServiceWorkerControl } from "@/lib/platform";
import {
  clearPushRegistrationMarker,
  readPushRegistrationMarker,
  writePushRegistrationMarker,
} from "@/lib/push-registration-status";

export type PushPlatform = "web" | "native" | "unsupported";
export type PermissionState = "default" | "granted" | "denied" | "unknown";

export interface PushRegisterResult {
  token: string;
  platform: "web" | "ios" | "android";
}

export interface PushNotificationPayload {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface UsePushNotificationsApi {
  /** 目前所在平台形態 */
  current: PushPlatform;
  /** 權限狀態 */
  permission: PermissionState;
  /** 是否已註冊到後端 */
  registered: boolean;
  /** 最後一次收到的 FCM token / Web Push endpoint */
  token: string | null;
  /** 訂冊推播並把 token 回報給後端 */
  register: () => Promise<PushRegisterResult | null>;
  /** 取消訂閱（web 才支援完整取消；native 會請求 removeListener） */
  unregister: () => Promise<void>;
  /** 收到前景推播時的 callback */
  onNotification: (cb: (p: PushNotificationPayload) => void) => void;
  /** 收到使用者點擊通知時的 callback */
  onNotificationClick: (cb: (p: PushNotificationPayload) => void) => void;
}

/** 後端用來儲存 token 的 API，後端會在 createSubscription() 時寫入 Supabase。 */
const SUBSCRIBE_API = "/api/push/subscribe";
const PUSH_STEP_TIMEOUT_MS = 25000;

class PushRegistrationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PushRegistrationError";
  }
}

export function usePushNotifications(tripId?: string, tripSecret?: string): UsePushNotificationsApi {
  const [current] = useState<PushPlatform>(() => {
    if (typeof window === "undefined") return "unsupported";
    if (isNativePlatform()) return "native";
    if ("serviceWorker" in navigator && "PushManager" in window) return "web";
    return "unsupported";
  });
  const [permission, setPermission] = useState<PermissionState>(() => {
    if (typeof Notification === "undefined") return "unknown";
    return Notification.permission;
  });
  const [registered, setRegistered] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const notifyCbRef = useRef<((p: PushNotificationPayload) => void) | null>(null);
  const clickCbRef = useRef<((p: PushNotificationPayload) => void) | null>(null);
  const tripIdRef = useRef<string | undefined>(tripId);
  const tripSecretRef = useRef<string | undefined>(tripSecret);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  useEffect(() => {
    tripSecretRef.current = tripSecret;
  }, [tripSecret]);

  useEffect(() => {
    let cancelled = false;
    const marker = typeof window !== "undefined"
      ? readPushRegistrationMarker(window.localStorage, tripId)
      : null;

    if (current === "native") {
      queueMicrotask(() => {
        if (cancelled) return;
        setToken(marker && marker.platform !== "web" ? marker.token : null);
        setRegistered(Boolean(marker && marker.platform !== "web"));
      });
      return () => {
        cancelled = true;
      };
    }
    if (current !== "web" || typeof Notification === "undefined") return;

    void getActiveServiceWorker()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        if (cancelled) return;
        setToken(sub?.endpoint ?? null);
        // A browser permission or subscription alone is not enough: only a
        // successful subscribe API response writes this trip-scoped marker.
        setRegistered(Boolean(sub && marker?.platform === "web" && marker.token === sub.endpoint));
      })
      .catch(() => {
        if (!cancelled) setRegistered(false);
      });

    return () => {
      cancelled = true;
    };
  }, [current, tripId]);

  /** 把訂閱/token 回報給後端；web 平台才需要傳 keys */
  const reportSubscriptionToBackend = useCallback(
    async (result: PushRegisterResult, keys?: { p256dh?: string; auth?: string }) => {
      if (!tripIdRef.current) {
        throw new PushRegistrationError("missing-trip-id", "尚未取得行程代號，請稍後再試。");
      }
      if (!tripSecretRef.current) {
        throw new PushRegistrationError("missing-trip-secret", "尚未取得行程密碼，請稍後再試。");
      }
      const res = await fetch(SUBSCRIBE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripIdRef.current,
          trip_secret: tripSecretRef.current,
          token: result.token,
          platform: result.platform,
          keys: keys ?? undefined,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new PushRegistrationError("subscribe-api", `推播訂閱寫入後端失敗 (${res.status})${detail ? `：${detail.slice(0, 120)}` : ""}`);
      }
      try {
        writePushRegistrationMarker(window.localStorage, tripIdRef.current, {
          token: result.token,
          platform: result.platform,
        });
      } catch {
        // The backend registration succeeded; private storage restrictions
        // must not turn that success into a failed subscription.
      }
      setRegistered(true);
    },
    [],
  );

  /** 註冊（native 走 Capacitor；web 走 Web Push + VAPID） */
  const register = useCallback(async (): Promise<PushRegisterResult | null> => {
    if (current === "native") {
      return registerNative(setPermission);
    }
    if (current === "web") {
      return registerWeb(setPermission, setToken, reportSubscriptionToBackend);
    }
    return null;
  }, [current, reportSubscriptionToBackend]);

  const unregister = useCallback(async () => {
    if (current === "web" && token) {
      // Web Push：呼叫 pushSubscription.unsubscribe()
      try {
        const reg = await getActiveServiceWorker();
        const sub = await reg?.pushManager.getSubscription();
        await sub?.unsubscribe();
      } catch {
        // ignore
      }
    }
    // native：Capacitor 沒有直接 unsubscribe API，FCM token 會在 App 重啟時自動刷新
    try {
      clearPushRegistrationMarker(window.localStorage, tripIdRef.current);
    } catch {
      // ignore storage restrictions
    }
    setRegistered(false);
    setToken(null);
  }, [current, token]);

  const onNotification = useCallback((cb: (p: PushNotificationPayload) => void) => {
    notifyCbRef.current = cb;
  }, []);
  const onNotificationClick = useCallback((cb: (p: PushNotificationPayload) => void) => {
    clickCbRef.current = cb;
  }, []);

  // 在 native 平台自動註冊推播事件 listener（FCM 收到通知時觸發）
  useEffect(() => {
    if (current !== "native") return;
    let stopped = false;

    const setup = async () => {
      try {
        await PushNotifications.addListener("registration", (t: Token) => {
          const plat = platform() === "ios" ? "ios" : "android";
          const result: PushRegisterResult = { token: t.value, platform: plat };
          setToken(t.value);
          setPermission("granted");
          reportSubscriptionToBackend(result);
        });
        await PushNotifications.addListener("registrationError", (err) => {
          console.warn("[push] registration error", err);
        });
        await PushNotifications.addListener("pushNotificationReceived", (n: PushNotificationSchema) => {
          const payload: PushNotificationPayload = {
            title: n.title ?? undefined,
            body: n.body ?? undefined,
            data: n.data as Record<string, unknown> | undefined,
          };
          notifyCbRef.current?.(payload);
        });
        await PushNotifications.addListener("pushNotificationActionPerformed", (a: ActionPerformed) => {
          const n = a.notification;
          const payload: PushNotificationPayload = {
            title: n.title ?? undefined,
            body: n.body ?? undefined,
            data: n.data as Record<string, unknown> | undefined,
          };
          clickCbRef.current?.(payload);
        });
      } catch (e) {
        if (!stopped) console.warn("[push] listener setup failed", e);
      }
    };
    void setup();
    return () => {
      stopped = true;
      void PushNotifications.removeAllListeners().catch(() => { });
    };
  }, [current, reportSubscriptionToBackend]);

  return {
    current,
    permission,
    registered,
    token,
    register,
    unregister,
    onNotification,
    onNotificationClick,
  };
}

// ── Native：透過 Capacitor 註冊 ──
async function registerNative(
  setPermission: (p: PermissionState) => void,
): Promise<PushRegisterResult | null> {
  let reqPerm = false;
  try {
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") {
      const r = await PushNotifications.requestPermissions();
      reqPerm = r.receive === "granted";
    } else {
      reqPerm = perm.receive === "granted";
    }
  } catch {
    reqPerm = false;
  }
  if (!reqPerm) {
    setPermission("denied");
    return null;
  }
  setPermission("granted");
  try {
    await PushNotifications.register();
    // registration listener 會在 token 取得後 call report()
    const plat = platform() === "ios" ? "ios" : "android";
    // 注意：回傳的 token 只做為占位；真正流程在 registration 事件中
    const placeholder: PushRegisterResult = { token: "", platform: plat };
    return placeholder;
  } catch {
    return null;
  }
}

// ── Web PWA：Web Push + VAPID ──
async function registerWeb(
  setPermission: (p: PermissionState) => void,
  setToken: (t: string) => void,
  report: (
    r: PushRegisterResult,
    keys?: { p256dh?: string; auth?: string },
  ) => Promise<void>,
): Promise<PushRegisterResult | null> {
  if (typeof Notification === "undefined") {
    throw new PushRegistrationError("notification-api", "此環境沒有 Notification API。請確認 iOS 已更新，並從主畫面 PWA 開啟。");
  }

  if (isIOSBrowser() && !isStandaloneWebApp()) {
    throw new PushRegistrationError("ios-not-standalone", "iPhone/iPad 需要先加入主畫面，再從主畫面開啟 PWA。");
  }

  // 1. 權限
  if (Notification.permission === "default") {
    const res = await withTimeout(Notification.requestPermission(), PUSH_STEP_TIMEOUT_MS, "permission-timeout");
    setPermission(res);
    if (res !== "granted") {
      throw new PushRegistrationError("permission-not-granted", `通知權限不是允許狀態：${res}`);
    }
  } else {
    setPermission(Notification.permission);
    if (Notification.permission !== "granted") {
      throw new PushRegistrationError("permission-not-granted", `通知權限不是允許狀態：${Notification.permission}`);
    }
  }

  // 2. 拿 sw registration
  const reg = await withTimeout(getActiveServiceWorker(), PUSH_STEP_TIMEOUT_MS, "service-worker-timeout");
  if (!reg) {
    throw new PushRegistrationError("service-worker-missing", "Service Worker 尚未 ready，請完全關閉 PWA 後重開。");
  }
  if (!reg.pushManager) {
    throw new PushRegistrationError("push-manager-missing", "此環境沒有 PushManager。請確認 iOS 版本支援 Web Push。");
  }
  // 不再強制要求 reg.active — iOS Safari 上 SW 可能還在 installing 但 pushManager 已可用

  await withTimeout(waitForServiceWorkerControl(3000), 4000, "service-worker-control-timeout").catch(() => false);

  // 3. 用 VAPID 公鑰訂閱
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!vapidPublicKey) {
    throw new PushRegistrationError("vapid-missing", "缺少 VAPID public key。");
  }
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  let sub = await withTimeout(reg.pushManager.getSubscription(), PUSH_STEP_TIMEOUT_MS, "get-subscription-timeout");
  if (!sub || sub.expirationTime !== null && sub.expirationTime < Date.now()) {
    try {
      sub = await withTimeout(
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }),
        PUSH_STEP_TIMEOUT_MS,
        "subscribe-timeout",
      );
    } catch (error) {
      if (error instanceof PushRegistrationError) throw error;
      throw new PushRegistrationError("subscribe-failed", error instanceof Error ? error.message : "PushManager.subscribe 失敗");
    }
  }

  const endpoint = sub.endpoint;
  setToken(endpoint);
  const jsonKeys = sub.toJSON().keys;
  const keys = jsonKeys ? { p256dh: jsonKeys.p256dh, auth: jsonKeys.auth } : undefined;
  const result: PushRegisterResult = { token: endpoint, platform: "web" };
  await report(result, keys);
  return result;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, code = "timeout"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PushRegistrationError(code, `推播註冊逾時：${code}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = typeof atob !== "undefined" ? atob(base64) : "";
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    view[i] = rawData.charCodeAt(i);
  }
  return view;
}
