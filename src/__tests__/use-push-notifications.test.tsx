import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ListenerRecord = {
  event: string;
  callback: (payload: unknown) => void;
  active: boolean;
  remove: ReturnType<typeof vi.fn>;
};

const pushMocks = vi.hoisted(() => ({
  listeners: [] as ListenerRecord[],
  addListener: vi.fn(),
  removeAllListeners: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  register: vi.fn(),
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: pushMocks.addListener,
    removeAllListeners: pushMocks.removeAllListeners,
    checkPermissions: pushMocks.checkPermissions,
    requestPermissions: pushMocks.requestPermissions,
    register: pushMocks.register,
  },
}));

vi.mock("@/lib/platform", () => ({
  isNativePlatform: () => true,
  platform: () => "ios",
  getActiveServiceWorker: vi.fn(),
  isIOSBrowser: () => false,
  isStandaloneWebApp: () => false,
  waitForServiceWorkerControl: vi.fn(),
}));

import { usePushNotifications } from "@/hooks/usePushNotifications";

function emit(event: string, payload: unknown) {
  for (const listener of pushMocks.listeners) {
    if (listener.active && listener.event === event) listener.callback(payload);
  }
}

describe("usePushNotifications native lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    pushMocks.listeners.splice(0);
    pushMocks.checkPermissions.mockResolvedValue({ receive: "granted" });
    pushMocks.requestPermissions.mockResolvedValue({ receive: "granted" });
    pushMocks.addListener.mockImplementation(async (event: string, callback: (payload: unknown) => void) => {
      const record: ListenerRecord = {
        event,
        callback,
        active: true,
        remove: vi.fn(async () => {
          record.active = false;
        }),
      };
      pushMocks.listeners.push(record);
      return { remove: record.remove };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves native registration only after a real token is acknowledged by the backend", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    pushMocks.register.mockImplementation(async () => {
      emit("registration", { value: "native-token-123" });
    });

    const { result } = renderHook(() => usePushNotifications("trip-1", "secret-1"));
    await waitFor(() => expect(pushMocks.addListener).toHaveBeenCalledTimes(4));

    let registration!: Promise<Awaited<ReturnType<typeof result.current.register>>>;
    act(() => {
      registration = result.current.register();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const settled = vi.fn();
    void registration.then(settled, settled);
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled).not.toHaveBeenCalled();

    resolveFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    let registered;
    await act(async () => {
      registered = await registration;
    });

    expect(registered).toEqual({ token: "native-token-123", platform: "ios" });
    expect(fetchMock).toHaveBeenCalledWith("/api/push/subscribe", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        trip_id: "trip-1",
        trip_secret: "secret-1",
        token: "native-token-123",
        platform: "ios",
      }),
    }));
    await waitFor(() => expect(result.current.registered).toBe(true));
    expect(result.current.token).toBe("native-token-123");
  });

  it("idempotently revalidates an existing marker on startup", async () => {
    localStorage.setItem("tokyoPushRegistration:trip-revalidate", JSON.stringify({
      token: "existing-native-token",
      platform: "ios",
      verifiedAt: "2026-07-14T00:00:00.000Z",
    }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePushNotifications("trip-revalidate", "secret-revalidate"));

    await waitFor(() => expect(result.current.registered).toBe(true));
    expect(result.current.token).toBe("existing-native-token");
    expect(fetchMock).toHaveBeenCalledWith("/api/push/subscribe", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        trip_id: "trip-revalidate",
        trip_secret: "secret-revalidate",
        token: "existing-native-token",
        platform: "ios",
      }),
    }));
  });

  it("keeps revalidation credentials isolated when the active trip changes mid-flight", async () => {
    localStorage.setItem("tokyoPushRegistration:trip-old", JSON.stringify({
      token: "old-token",
      platform: "ios",
      verifiedAt: "2026-07-14T00:00:00.000Z",
    }));
    localStorage.setItem("tokyoPushRegistration:trip-new", JSON.stringify({
      token: "new-token",
      platform: "ios",
      verifiedAt: "2026-07-14T00:00:00.000Z",
    }));
    const pending = new Map<string, (response: Response) => void>();
    const bodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return new Promise<Response>((resolve) => {
        pending.set(String(body.trip_id), resolve);
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ id, secret }) => usePushNotifications(id, secret),
      { initialProps: { id: "trip-old", secret: "secret-old" } },
    );
    await waitFor(() => expect(pending.has("trip-old")).toBe(true));

    rerender({ id: "trip-new", secret: "secret-new" });
    await waitFor(() => expect(pending.has("trip-new")).toBe(true));

    await act(async () => {
      pending.get("trip-new")?.(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    await waitFor(() => expect(result.current.registered).toBe(true));
    expect(result.current.token).toBe("new-token");

    await act(async () => {
      pending.get("trip-old")?.(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(bodies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        trip_id: "trip-old",
        trip_secret: "secret-old",
        token: "old-token",
      }),
      expect.objectContaining({
        trip_id: "trip-new",
        trip_secret: "secret-new",
        token: "new-token",
      }),
    ]));
    expect(result.current.registered).toBe(true);
    expect(result.current.token).toBe("new-token");
  });

  it("rejects the register promise when the async token report fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("database unavailable", { status: 503 })));
    pushMocks.register.mockImplementation(async () => {
      emit("registration", { value: "native-token-failed" });
    });

    const { result } = renderHook(() => usePushNotifications("trip-2", "secret-2"));
    await waitFor(() => expect(pushMocks.addListener).toHaveBeenCalledTimes(4));

    let error: unknown;
    await act(async () => {
      try {
        await result.current.register();
      } catch (caught) {
        error = caught;
      }
    });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("推播訂閱寫入後端失敗 (503)");
    expect(result.current.registered).toBe(false);
    expect(result.current.token).toBeNull();
  });

  it("removes only listener handles owned by the unmounted hook instance", async () => {
    const first = renderHook(() => usePushNotifications("trip-a", "secret-a"));
    await waitFor(() => expect(pushMocks.addListener).toHaveBeenCalledTimes(4));
    const firstRecords = pushMocks.listeners.slice(0, 4);

    const second = renderHook(() => usePushNotifications("trip-b", "secret-b"));
    await waitFor(() => expect(pushMocks.addListener).toHaveBeenCalledTimes(8));
    const secondRecords = pushMocks.listeners.slice(4, 8);
    const onNotification = vi.fn();
    act(() => second.result.current.onNotification(onNotification));

    first.unmount();
    await waitFor(() => {
      expect(firstRecords.every((record) => record.remove.mock.calls.length === 1)).toBe(true);
    });
    expect(secondRecords.every((record) => record.remove.mock.calls.length === 0)).toBe(true);
    expect(pushMocks.removeAllListeners).not.toHaveBeenCalled();

    emit("pushNotificationReceived", { title: "仍可收到", body: "第二個 hook 不受影響" });
    expect(onNotification).toHaveBeenCalledWith({
      title: "仍可收到",
      body: "第二個 hook 不受影響",
      data: undefined,
    });

    second.unmount();
  });

  it("removes the native token from the backend before clearing local registration", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    pushMocks.register.mockImplementation(async () => {
      emit("registration", { value: "native-token-to-remove" });
    });

    const { result } = renderHook(() => usePushNotifications("trip-delete", "secret-delete"));
    await waitFor(() => expect(pushMocks.addListener).toHaveBeenCalledTimes(4));
    await act(async () => {
      await result.current.register();
    });
    expect(result.current.registered).toBe(true);

    await act(async () => {
      await result.current.unregister();
    });

    expect(fetchMock).toHaveBeenLastCalledWith("/api/push/subscribe", expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({
        trip_id: "trip-delete",
        trip_secret: "secret-delete",
        token: "native-token-to-remove",
      }),
    }));
    expect(result.current.registered).toBe(false);
    expect(result.current.token).toBeNull();
  });

  it("still clears the local token when an old credential was revoked by rotation", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(
      init?.method === "DELETE" ? "credential rotated" : JSON.stringify({ ok: true }),
      { status: init?.method === "DELETE" ? 403 : 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    pushMocks.register.mockImplementation(async () => {
      emit("registration", { value: "rotated-native-token" });
    });

    const { result } = renderHook(() => usePushNotifications("trip-rotated", "old-secret"));
    await waitFor(() => expect(pushMocks.addListener).toHaveBeenCalledTimes(4));
    await act(async () => {
      await result.current.register();
      await result.current.unregister();
    });

    expect(result.current.registered).toBe(false);
    expect(result.current.token).toBeNull();
  });
});
