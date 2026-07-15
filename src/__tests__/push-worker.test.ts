import { afterEach, describe, expect, it, vi } from "vitest";

type WorkerListener = (event: {
  notification: {
    close: () => void;
    data?: Record<string, unknown>;
  };
  waitUntil: (promise: Promise<unknown>) => void;
}) => void;

describe("push service worker notification routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reuses a same-origin window by navigating and focusing it", async () => {
    const listeners = new Map<string, WorkerListener>();
    const focusedAfterNavigation = vi.fn(async () => undefined);
    const navigatedClient = {
      url: "https://tokyo.example/?tab=itinerary",
      focus: focusedAfterNavigation,
      navigate: vi.fn(),
    };
    const navigate = vi.fn(async () => navigatedClient);
    const focus = vi.fn(async () => undefined);
    const openWindow = vi.fn(async () => undefined);
    const scope = {
      location: { origin: "https://tokyo.example" },
      skipWaiting: vi.fn(async () => undefined),
      registration: { showNotification: vi.fn(async () => undefined) },
      clients: {
        claim: vi.fn(async () => undefined),
        matchAll: vi.fn(async () => [{
          url: "https://tokyo.example/?tab=food",
          focus,
          navigate,
        }]),
        openWindow,
      },
      addEventListener: vi.fn((type: string, listener: WorkerListener) => {
        listeners.set(type, listener);
      }),
    };
    vi.stubGlobal("self", scope);

    await import("../../worker/index");

    const close = vi.fn();
    let completion!: Promise<unknown>;
    listeners.get("notificationclick")?.({
      notification: {
        close,
        data: { url: "/?tab=itinerary" },
      },
      waitUntil: (promise) => {
        completion = promise;
      },
    });
    await completion;

    expect(close).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/?tab=itinerary");
    expect(focusedAfterNavigation).toHaveBeenCalledOnce();
    expect(focus).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });
});
