import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveServiceWorker: vi.fn(),
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock("@/lib/platform", () => ({
  isNativePlatform: () => false,
  platform: () => "web",
  getActiveServiceWorker: mocks.getActiveServiceWorker,
  isIOSBrowser: () => false,
  isStandaloneWebApp: () => false,
  waitForServiceWorkerControl: vi.fn(),
}));

import { usePushNotifications } from "@/hooks/usePushNotifications";

describe("usePushNotifications web unregistration", () => {
  const unsubscribe = vi.fn(async () => true);
  const subscription = {
    endpoint: "https://push.example/web-retry",
    expirationTime: null,
    unsubscribe,
    toJSON: () => ({ keys: { p256dh: "p256dh-key", auth: "auth-key" } }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: {},
    });
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn(async () => "granted"),
    });
    mocks.getActiveServiceWorker.mockResolvedValue({
      pushManager: {
        getSubscription: vi.fn(async () => subscription),
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window.navigator, "serviceWorker");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not unsubscribe the browser or clear state after a backend 5xx", async () => {
    localStorage.setItem("tokyoPushRegistration:trip-web-retry", JSON.stringify({
      token: subscription.endpoint,
      platform: "web",
      verifiedAt: "2026-07-15T00:00:00.000Z",
    }));
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(
      init?.method === "DELETE" ? "database unavailable" : JSON.stringify({ ok: true }),
      { status: init?.method === "DELETE" ? 503 : 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePushNotifications("trip-web-retry", "secret-web-retry"));
    expect(result.current.current).toBe("web");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.registered).toBe(true));
    expect(result.current.token).toBe(subscription.endpoint);

    let error: unknown;
    await act(async () => {
      try {
        await result.current.unregister();
      } catch (caught) {
        error = caught;
      }
    });

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("取消推播失敗 (503)");
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(result.current.registered).toBe(true);
    expect(result.current.token).toBe(subscription.endpoint);
    expect(localStorage.getItem("tokyoPushRegistration:trip-web-retry")).toContain(subscription.endpoint);
  });
});
