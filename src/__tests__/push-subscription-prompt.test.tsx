import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  usePushNotifications: vi.fn(),
}));

vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: mocks.usePushNotifications,
}));

vi.mock("@/lib/platform", () => ({
  getPushCapabilitySnapshot: () => "test-capability",
  isIOSBrowser: () => false,
  isStandaloneWebApp: () => true,
}));

import { PushSubscriptionPrompt } from "@/components/PushSubscriptionPrompt";

describe("PushSubscriptionPrompt test delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePushNotifications.mockReturnValue({
      current: "web",
      permission: "granted",
      registered: true,
      token: "https://push.example/device",
      register: mocks.register,
      unregister: mocks.unregister,
      onNotification: vi.fn(),
      onNotificationClick: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("warns that the test targets every subscribed device before sending", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      sent: 3,
      failed: 0,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PushSubscriptionPrompt tripId="trip-1" tripSecret="secret-1" />);

    fireEvent.click(screen.getByRole("button", { name: "測試全部訂閱裝置" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("全部已訂閱裝置，不只目前這台");

    fireEvent.click(screen.getByRole("button", { name: "確認發送到全部裝置" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/push/send", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        trip_id: "trip-1",
        trip_secret: "secret-1",
        title: "東京行程測試提醒",
        body: "推播已經接通，之後每日行程提醒會用同一條通道送出。",
        data: { type: "test-reminder", url: "/?tab=itinerary" },
      }),
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("這趟旅程的 3 個訂閱裝置");
  });
});
