"use client";

export const GOOGLE_MAPS_AUTH_FAILURE_EVENT = "tokyo-trip:google-maps-auth-failure";

export type GoogleMapsLoadErrorCode =
  | "missing-key"
  | "network"
  | "timeout"
  | "auth"
  | "unavailable";

export class GoogleMapsLoadError extends Error {
  constructor(
    public readonly code: GoogleMapsLoadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoogleMapsLoadError";
  }
}

type GoogleMapsWindow = Window & {
  google?: typeof google & {
    maps: typeof google.maps & {
      importLibrary?: (name: string) => Promise<unknown>;
    };
  };
  gm_authFailure?: () => void;
  __tokyoTripGoogleMapsAuthBridge?: boolean;
};

const SCRIPT_ID = "google-maps-script";
const DEFAULT_TIMEOUT_MS = 10_000;
let loadPromise: Promise<void> | null = null;

function mapsReady(win: GoogleMapsWindow) {
  return Boolean(win.google?.maps);
}

function installAuthFailureBridge(win: GoogleMapsWindow) {
  if (win.__tokyoTripGoogleMapsAuthBridge) return;

  const previous = win.gm_authFailure;
  win.gm_authFailure = () => {
    previous?.();
    win.dispatchEvent(new Event(GOOGLE_MAPS_AUTH_FAILURE_EVENT));
  };
  win.__tokyoTripGoogleMapsAuthBridge = true;
}

async function ensureLibraries(win: GoogleMapsWindow) {
  const importLibrary = win.google?.maps.importLibrary;
  if (!importLibrary) return;
  await Promise.all([importLibrary.call(win.google?.maps, "places"), importLibrary.call(win.google?.maps, "marker")]);
}

/**
 * Loads the shared Google Maps runtime. Every exit path settles, including
 * script errors, invalid credentials and a script that loads without exposing
 * `window.google.maps`.
 */
export function loadGoogleMaps(
  apiKey: string | undefined,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new GoogleMapsLoadError("unavailable", "目前環境無法載入 Google Maps。"));
  }
  if (!apiKey?.trim()) {
    return Promise.reject(new GoogleMapsLoadError("missing-key", "Google Maps 金鑰尚未設定。"));
  }

  const win = window as GoogleMapsWindow;
  installAuthFailureBridge(win);

  if (mapsReady(win)) {
    return ensureLibraries(win).catch(() => {
      throw new GoogleMapsLoadError("unavailable", "Google Maps 圖庫載入失敗。");
    });
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let createdScript = false;
    const timers: { poll?: number; timeout?: number } = {};
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    const cleanup = () => {
      if (timers.poll !== undefined) window.clearInterval(timers.poll);
      if (timers.timeout !== undefined) window.clearTimeout(timers.timeout);
      script?.removeEventListener("error", onScriptError);
      window.removeEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, onAuthFailure);
    };

    const fail = (error: GoogleMapsLoadError) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (createdScript && !mapsReady(win)) script?.remove();
      loadPromise = null;
      reject(error);
    };

    const succeed = () => {
      if (settled || !mapsReady(win)) return;
      settled = true;
      cleanup();
      void ensureLibraries(win)
        .then(resolve)
        .catch(() => {
          loadPromise = null;
          reject(new GoogleMapsLoadError("unavailable", "Google Maps 圖庫載入失敗。"));
        });
    };

    function onScriptError() {
      fail(new GoogleMapsLoadError("network", "Google Maps 連線失敗，請檢查網路後重試。"));
    }

    function onAuthFailure() {
      fail(new GoogleMapsLoadError("auth", "Google Maps 驗證失敗，請改用外部導航。"));
    }

    window.addEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, onAuthFailure, { once: true });

    if (!script) {
      createdScript = true;
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey.trim())}&v=weekly&libraries=places,marker&language=zh-TW&region=JP`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("error", onScriptError, { once: true });

    // Polling also covers an already-present script whose load event fired
    // before this component mounted.
    timers.poll = window.setInterval(succeed, 100);
    timers.timeout = window.setTimeout(() => {
      fail(new GoogleMapsLoadError("timeout", "Google Maps 載入逾時，請重試或改用外部導航。"));
    }, timeoutMs);
    succeed();
  });

  return loadPromise;
}

export function subscribeToGoogleMapsAuthFailure(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  installAuthFailureBridge(window as GoogleMapsWindow);
  window.addEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, listener);
  return () => window.removeEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, listener);
}
