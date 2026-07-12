/**
 * Capacitor 平台偵測 helper
 *
 * Capacitor 在原生 App 會注入全域 `Capacitor` 物件；
 * 一般網頁瀏覽器則回傳 "web"。
 *
 * 用來讓推播邏輯能依環境切換：
 * - web → 走 Web Push API（Service Worker / pushManager）
 * - native → 走 @capacitor/push-notifications（FCM/APNs）
 */
import { Capacitor } from "@capacitor/core";

export const PUSH_VERSION = "push-20260706-8";

export const isNativePlatform = (): boolean => {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
};

export const platform = (): "web" | "ios" | "android" => {
  if (typeof window === "undefined") return "web";
  return (Capacitor.getPlatform() as "web" | "ios" | "android") ?? "web";
};

export const isIOSBrowser = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
  );
};

export const isStandaloneWebApp = (): boolean => {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
};

export const getPushCapabilitySnapshot = (): string => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "env=server";
  }

  return [
    `v=${PUSH_VERSION}`,
    `origin=${window.location.origin}`,
    `ios=${isIOSBrowser() ? "1" : "0"}`,
    `standalone=${isStandaloneWebApp() ? "1" : "0"}`,
    `sw=${"serviceWorker" in navigator ? "1" : "0"}`,
    `push=${"PushManager" in window ? "1" : "0"}`,
    `notify=${typeof Notification !== "undefined" ? Notification.permission : "none"}`,
    `controlled=${navigator.serviceWorker?.controller ? "1" : "0"}`,
  ].join(" · ");
};

/**
 * 取得可用的 Service Worker Registration。
 *
 * 策略：
 * 1. 先嘗試取得既有的 registration，若已有 active worker 直接回傳。
 * 2. 若尚未註冊則發起註冊，等待 activation（最多 15 秒）。
 * 3. 若超時後仍有 installing/waiting 但尚未 active，
 *    **仍然回傳 registration**（因為 pushManager.subscribe 不一定需要 active）。
 * 4. 只有在完全沒有 registration 或發生真正的例外時才回傳 null。
 */
export async function getActiveServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    // Step 1: 取得既有註冊或發起新註冊
    let reg = await navigator.serviceWorker.getRegistration();
    if (reg?.active) {
      return reg; // 已有 active worker，直接回傳
    }

    // 發起註冊（帶版本號防快取）
    reg = await navigator.serviceWorker.register(`/sw.js?v=${PUSH_VERSION}`, {
      scope: "/",
      updateViaCache: "none", // 禁止 iOS Safari 使用 HTTP 快取
    });

    // 如果註冊後就已有 active，直接回傳
    if (reg.active) {
      return reg;
    }

    // Step 2: 等待 SW 從 installing → activated（給予充足的 15 秒）
    const worker = reg.installing ?? reg.waiting;
    if (worker) {
      const activated = await waitForState(worker, "activated", 15000);
      if (activated || reg.active) {
        return reg;
      }
    }

    // Step 3: 最後嘗試 navigator.serviceWorker.ready（5 秒超時）
    const readyReg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    if (readyReg?.active) {
      return readyReg;
    }

    // Step 4: 即使 SW 尚未完全 active，只要有 registration 就回傳
    // pushManager.subscribe 在 iOS 上可以在 waiting/installing 狀態下運作
    if (reg) {
      console.warn("[getActiveServiceWorker] SW not fully active yet, returning registration anyway for pushManager");
      return reg;
    }

    return null;
  } catch (error) {
    console.error("[getActiveServiceWorker] Failed:", error);
    throw error;
  }
}

export async function waitForServiceWorkerControl(ms = 5000): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  if (navigator.serviceWorker.controller) return true;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      resolve(Boolean(navigator.serviceWorker.controller));
    }, ms);

    const onControllerChange = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      resolve(true);
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
  });
}

/**
 * 等待 ServiceWorker 進入指定狀態，帶超時。
 * 回傳 true 代表已達成，false 代表超時。
 */
function waitForState(worker: ServiceWorker, targetState: ServiceWorkerState, ms: number): Promise<boolean> {
  if (worker.state === targetState) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.removeEventListener("statechange", onStateChange);
      resolve(worker.state === targetState);
    }, ms);

    const onStateChange = () => {
      if (worker.state === targetState) {
        clearTimeout(timer);
        worker.removeEventListener("statechange", onStateChange);
        resolve(true);
      }
      // 如果進入 redundant 狀態，提前結束（不會再變成 activated 了）
      if (worker.state === "redundant") {
        clearTimeout(timer);
        worker.removeEventListener("statechange", onStateChange);
        resolve(false);
      }
    };

    worker.addEventListener("statechange", onStateChange);
  });
}
