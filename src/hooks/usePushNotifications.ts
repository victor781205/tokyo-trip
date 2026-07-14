"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from "@capacitor/push-notifications";
import type { PluginListenerHandle } from "@capacitor/core";
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
  /** 從後端移除此裝置 token；Web 另外取消瀏覽器 subscription。 */
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

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  settled: boolean;
};

type PushCredentials = {
  tripId: string;
  tripSecret: string;
  generation: number;
};

function createDeferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const deferred: Deferred<T> = {
    promise: new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    }),
    resolve: (value) => {
      if (deferred.settled) return;
      deferred.settled = true;
      resolvePromise(value);
    },
    reject: (reason) => {
      if (deferred.settled) return;
      deferred.settled = true;
      rejectPromise(reason);
    },
    settled: false,
  };
  return deferred;
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
  const credentialsGenerationRef = useRef(0);
  const nativeSetupPromiseRef = useRef<Promise<void> | null>(null);
  const nativeRegistrationRef = useRef<Deferred<PushRegisterResult> | null>(null);
  const nativeRegistrationCredentialsRef = useRef<PushCredentials | null>(null);
  const nativeRegisterInFlightRef = useRef<{
    key: string;
    promise: Promise<PushRegisterResult | null>;
  } | null>(null);
  const markerRevalidationRef = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    tripIdRef.current = tripId;
    tripSecretRef.current = tripSecret;
    credentialsGenerationRef.current += 1;
  }, [tripId, tripSecret]);

  useEffect(() => {
    let cancelled = false;
    const marker = typeof window !== "undefined"
      ? readPushRegistrationMarker(window.localStorage, tripId)
      : null;

    if (current === "native") {
      queueMicrotask(() => {
        if (cancelled) return;
        setToken(marker && marker.platform !== "web" ? marker.token : null);
        // A local marker is only a hint. Startup revalidation below confirms
        // that the token still exists for the current trip credential.
        setRegistered(false);
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
        setRegistered(false);
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
    async (
      result: PushRegisterResult,
      keys?: { p256dh?: string; auth?: string },
      explicitCredentials?: PushCredentials,
    ) => {
      const credentials = explicitCredentials ?? {
        tripId: tripIdRef.current ?? "",
        tripSecret: tripSecretRef.current ?? "",
        generation: credentialsGenerationRef.current,
      };
      if (!credentials.tripId) {
        throw new PushRegistrationError("missing-trip-id", "尚未取得行程代號，請稍後再試。");
      }
      if (!credentials.tripSecret) {
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
        writePushRegistrationMarker(window.localStorage, credentials.tripId, {
          token: result.token,
          platform: result.platform,
        });
      } catch {
        // The backend registration succeeded; private storage restrictions
        // must not turn that success into a failed subscription.
      }
      if (
        credentialsGenerationRef.current === credentials.generation
        && tripIdRef.current === credentials.tripId
        && tripSecretRef.current === credentials.tripSecret
      ) {
        setRegistered(true);
      }
    },
    [],
  );

  useEffect(() => {
    if (!tripId || !tripSecret || current === "unsupported") return;
    let stopped = false;
    const credentials: PushCredentials = {
      tripId,
      tripSecret,
      generation: credentialsGenerationRef.current,
    };
    const isCurrent = () => Boolean(
      !stopped
      && credentialsGenerationRef.current === credentials.generation
      && tripIdRef.current === credentials.tripId
      && tripSecretRef.current === credentials.tripSecret
    );

    const revalidate = async () => {
      const marker = readPushRegistrationMarker(window.localStorage, credentials.tripId);
      if (!marker) return;
      const key = [
        credentials.generation,
        credentials.tripId,
        credentials.tripSecret,
        marker.platform,
        marker.token,
      ].join("\u0000");
      const existing = markerRevalidationRef.current.get(key);
      if (existing) return existing;
      const attempt = (async () => {
        if (current === "native") {
          if (marker.platform === "web") return;
          await reportSubscriptionToBackend(
            { token: marker.token, platform: marker.platform },
            undefined,
            credentials,
          );
          if (isCurrent()) setToken(marker.token);
          return;
        }
        if (marker.platform !== "web") return;
        const registration = await getActiveServiceWorker();
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription || subscription.endpoint !== marker.token) {
          clearPushRegistrationMarker(window.localStorage, credentials.tripId);
          if (isCurrent()) {
            setRegistered(false);
            setToken(subscription?.endpoint ?? null);
          }
          return;
        }
        const keys = subscription.toJSON().keys;
        await reportSubscriptionToBackend(
          { token: subscription.endpoint, platform: "web" },
          keys ? { p256dh: keys.p256dh, auth: keys.auth } : undefined,
          credentials,
        );
        if (isCurrent()) setToken(subscription.endpoint);
      })()
        .catch((error) => {
          if (isCurrent()) setRegistered(false);
          console.warn("[push] marker revalidation failed", error);
        })
        .finally(() => {
          if (markerRevalidationRef.current.get(key) === attempt) {
            markerRevalidationRef.current.delete(key);
          }
        });
      markerRevalidationRef.current.set(key, attempt);
      return attempt;
    };

    void revalidate();
    const retry = () => void revalidate();
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      stopped = true;
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [current, reportSubscriptionToBackend, tripId, tripSecret]);

  const unregister = useCallback(async () => {
    const credentials: PushCredentials = {
      tripId: tripId ?? "",
      tripSecret: tripSecret ?? "",
      generation: credentialsGenerationRef.current,
    };
    let backendError: PushRegistrationError | null = null;
    if (token) {
      if (!credentials.tripId || !credentials.tripSecret) {
        throw new PushRegistrationError("missing-trip-credentials", "缺少行程代號或密碼，無法取消推播。");
      }
      const response = await fetch(SUBSCRIBE_API, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: credentials.tripId,
          trip_secret: credentials.tripSecret,
          token,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        // 403 commonly means the trip secret was rotated. Rotation already
        // revoked every remote token, so the device must still be allowed to
        // remove its browser subscription and stale local marker.
        if (response.status !== 403) backendError = new PushRegistrationError(
          "unsubscribe-api",
          "取消推播失敗 (" + response.status + ")" + (detail ? "：" + detail.slice(0, 120) : ""),
        );
      }
    }

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
    // Native 沒有可靠的 OS token revoke；後端刪除後即不再列入發送名單。
    try {
      clearPushRegistrationMarker(window.localStorage, credentials.tripId);
    } catch {
      // ignore storage restrictions
    }
    if (
      credentialsGenerationRef.current === credentials.generation
      && tripIdRef.current === credentials.tripId
      && tripSecretRef.current === credentials.tripSecret
    ) {
      setRegistered(false);
      setToken(null);
    }
    if (backendError) throw backendError;
  }, [current, token, tripId, tripSecret]);

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
    const handles: PluginListenerHandle[] = [];

    const rejectPendingRegistration = (error: unknown) => {
      const pending = nativeRegistrationRef.current;
      if (!pending) return;
      pending.reject(error);
    };

    const trackHandle = async (handlePromise: Promise<PluginListenerHandle>) => {
      const handle = await handlePromise;
      if (stopped) {
        await handle.remove().catch(() => undefined);
        return;
      }
      handles.push(handle);
    };

    const setup = async () => {
      await Promise.all([
        trackHandle(PushNotifications.addListener("registration", (t: Token) => {
          void (async () => {
            try {
              if (!t.value) {
                throw new PushRegistrationError("native-token-missing", "原生推播未回傳有效 token。");
              }
              const plat = platform() === "ios" ? "ios" : "android";
              const result: PushRegisterResult = { token: t.value, platform: plat };
              const credentials = nativeRegistrationCredentialsRef.current ?? {
                tripId: tripIdRef.current ?? "",
                tripSecret: tripSecretRef.current ?? "",
                generation: credentialsGenerationRef.current,
              };
              await reportSubscriptionToBackend(result, undefined, credentials);
              if (stopped) return;
              if (
                credentialsGenerationRef.current === credentials.generation
                && tripIdRef.current === credentials.tripId
                && tripSecretRef.current === credentials.tripSecret
              ) {
                setToken(t.value);
                setPermission("granted");
              }
              nativeRegistrationRef.current?.resolve(result);
            } catch (error) {
              if (stopped) return;
              const credentials = nativeRegistrationCredentialsRef.current;
              try {
                clearPushRegistrationMarker(
                  window.localStorage,
                  credentials?.tripId ?? tripIdRef.current,
                );
              } catch {
                // ignore storage restrictions
              }
              if (
                !credentials
                || (
                  credentialsGenerationRef.current === credentials.generation
                  && tripIdRef.current === credentials.tripId
                  && tripSecretRef.current === credentials.tripSecret
                )
              ) {
                setRegistered(false);
                setToken(null);
              }
              rejectPendingRegistration(
                error instanceof Error
                  ? error
                  : new PushRegistrationError("native-registration-report", String(error)),
              );
              console.warn("[push] native token report failed", error);
            }
          })();
        })),
        trackHandle(PushNotifications.addListener("registrationError", (err) => {
          const error = new PushRegistrationError(
            "native-registration-error",
            typeof err?.error === "string" ? err.error : "原生推播註冊失敗。",
          );
          rejectPendingRegistration(error);
          console.warn("[push] registration error", err);
        })),
        trackHandle(PushNotifications.addListener("pushNotificationReceived", (n: PushNotificationSchema) => {
          if (stopped) return;
          const payload: PushNotificationPayload = {
            title: n.title ?? undefined,
            body: n.body ?? undefined,
            data: n.data as Record<string, unknown> | undefined,
          };
          notifyCbRef.current?.(payload);
        })),
        trackHandle(PushNotifications.addListener("pushNotificationActionPerformed", (a: ActionPerformed) => {
          if (stopped) return;
          const n = a.notification;
          const payload: PushNotificationPayload = {
            title: n.title ?? undefined,
            body: n.body ?? undefined,
            data: n.data as Record<string, unknown> | undefined,
          };
          clickCbRef.current?.(payload);
        })),
      ]);
    };
    const setupPromise = setup();
    nativeSetupPromiseRef.current = setupPromise;
    void setupPromise.catch((error) => {
      if (stopped) return;
      rejectPendingRegistration(
        error instanceof Error
          ? error
          : new PushRegistrationError("native-listener-setup", String(error)),
      );
      console.warn("[push] listener setup failed", error);
    });

    return () => {
      stopped = true;
      if (nativeSetupPromiseRef.current === setupPromise) {
        nativeSetupPromiseRef.current = null;
      }
      rejectPendingRegistration(
        new PushRegistrationError("native-listeners-disposed", "原生推播 listener 已卸載。"),
      );
      for (const handle of handles) {
        void handle.remove().catch(() => undefined);
      }
    };
  }, [current, reportSubscriptionToBackend]);

  /** 註冊（native 走 Capacitor；web 走 Web Push + VAPID） */
  const register = useCallback(async (): Promise<PushRegisterResult | null> => {
    const credentials: PushCredentials = {
      tripId: tripId ?? "",
      tripSecret: tripSecret ?? "",
      generation: credentialsGenerationRef.current,
    };
    const credentialKey = `${credentials.generation}\u0000${credentials.tripId}\u0000${credentials.tripSecret}`;
    if (current === "native") {
      if (nativeRegisterInFlightRef.current) {
        if (nativeRegisterInFlightRef.current.key === credentialKey) {
          return nativeRegisterInFlightRef.current.promise;
        }
        // Native exposes one registration callback stream. Finish/cancel the
        // previous credential's attempt before assigning the stream to another.
        nativeRegistrationRef.current?.reject(
          new PushRegistrationError("trip-changed", "行程已切換，已取消前一趟行程的推播註冊。"),
        );
        await nativeRegisterInFlightRef.current.promise.catch(() => null);
      }

      const attempt = (async () => {
        // Listener 必須先完成安裝，否則原生層可能在 register() 後立刻回傳 token 而遺失事件。
        await Promise.resolve();
        const setupPromise = nativeSetupPromiseRef.current;
        if (!setupPromise) {
          throw new PushRegistrationError("native-listeners-not-ready", "原生推播 listener 尚未就緒，請稍後再試。");
        }
        await withTimeout(setupPromise, PUSH_STEP_TIMEOUT_MS, "native-listener-setup-timeout");

        const granted = await requestNativePermission(setPermission);
        if (!granted) return null;

        const pending = createDeferred<PushRegisterResult>();
        // registrationError / token ACK 可能在 Capacitor.register() 尚未 resolve 前觸發；
        // 先掛上 rejection handler，避免原生同步事件形成 unhandled rejection。
        void pending.promise.catch(() => undefined);
        nativeRegistrationRef.current = pending;
        nativeRegistrationCredentialsRef.current = credentials;
        try {
          try {
            await PushNotifications.register();
          } catch (error) {
            pending.settled = true;
            throw new PushRegistrationError(
              "native-register-call",
              error instanceof Error ? error.message : "呼叫原生推播註冊失敗。",
            );
          }

          // 只有拿到真實 token，且後端 subscribe API 已確認寫入，才算註冊完成。
          return await withTimeout(
            pending.promise,
            PUSH_STEP_TIMEOUT_MS,
            "native-registration-ack-timeout",
          );
        } finally {
          if (nativeRegistrationRef.current === pending) {
            nativeRegistrationRef.current = null;
            nativeRegistrationCredentialsRef.current = null;
          }
        }
      })();

      nativeRegisterInFlightRef.current = { key: credentialKey, promise: attempt };
      try {
        return await attempt;
      } finally {
        if (nativeRegisterInFlightRef.current?.promise === attempt) {
          nativeRegisterInFlightRef.current = null;
        }
      }
    }
    if (current === "web") {
      const setCurrentToken = (value: string) => {
        if (
          credentialsGenerationRef.current === credentials.generation
          && tripIdRef.current === credentials.tripId
          && tripSecretRef.current === credentials.tripSecret
        ) setToken(value);
      };
      return registerWeb(
        setPermission,
        setCurrentToken,
        (result, keys) => reportSubscriptionToBackend(result, keys, credentials),
      );
    }
    return null;
  }, [current, reportSubscriptionToBackend, tripId, tripSecret]);

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

// ── Native：請求權限；token 與後端 ACK 由 hook listener 完成 ──
async function requestNativePermission(
  setPermission: (p: PermissionState) => void,
): Promise<boolean> {
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
    return false;
  }
  setPermission("granted");
  return true;
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
