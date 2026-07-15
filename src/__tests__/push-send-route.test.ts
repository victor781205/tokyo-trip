import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  subscriptions: [] as Array<{
    token: string;
    platform: "web" | "ios" | "android";
    keys: { p256dh?: string; auth?: string } | null;
  }>,
  rpc: vi.fn(),
  createServerSupabase: vi.fn(),
  getMessagingSafe: vi.fn(),
  sendEachForMulticast: vi.fn(),
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabase: mocks.createServerSupabase,
  isForbiddenRpcError: () => false,
}));

vi.mock("@/lib/firebase-admin", () => ({
  getMessagingSafe: mocks.getMessagingSafe,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 19, retryAfter: 0 }),
}));

vi.mock("web-push", () => ({
  setVapidDetails: mocks.setVapidDetails,
  sendNotification: mocks.sendNotification,
}));

import { POST } from "@/app/api/push/send/route";

function request(tripSecret = "secret-1") {
  return new NextRequest("http://localhost/api/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "push-send-test",
    },
    body: JSON.stringify({
      trip_id: "trip-1",
      trip_secret: tripSecret,
      title: "今日行程",
      body: "準備出發",
      data: { day: 1 },
    }),
  });
}

describe("push send channel isolation and token cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscriptions.splice(0);
    vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "list_push_subscriptions") {
        return { data: mocks.subscriptions, error: null };
      }
      if (name === "delete_push_tokens") {
        return { data: null, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    mocks.createServerSupabase.mockReturnValue({
      client: { rpc: mocks.rpc },
      mode: "service_role",
      error: null,
    });
    mocks.getMessagingSafe.mockResolvedValue({
      messaging: { sendEachForMulticast: mocks.sendEachForMulticast },
      initError: null,
    });
    mocks.sendNotification.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts legacy trip secrets up to the database limit", async () => {
    const legacySecret = "s".repeat(100);

    const response = await POST(request(legacySecret));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("list_push_subscriptions", {
      p_trip_id: "trip-1",
      p_trip_secret: legacySecret,
    });
  });

  it("still sends Web Push when FCM is not configured and reports a partial result", async () => {
    mocks.subscriptions.push(
      { token: "native-1", platform: "ios", keys: null },
      { token: "https://push.example/web-1", platform: "web", keys: { p256dh: "p", auth: "a" } },
    );
    mocks.getMessagingSafe.mockResolvedValue({ messaging: null, initError: "missing firebase env" });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(body).toMatchObject({
      ok: false,
      partial: true,
      sent: 1,
      failed: 1,
      channels: {
        native: { requested: 1, sent: 0, failed: 1 },
        web: { requested: 1, sent: 1, failed: 0 },
      },
    });
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith("delete_push_tokens", expect.anything());
  });

  it("deletes only explicit invalid native tokens and Web Push 404/410 endpoints", async () => {
    mocks.subscriptions.push(
      { token: "native-invalid", platform: "android", keys: null },
      { token: "native-transient", platform: "android", keys: null },
      { token: "https://push.example/expired", platform: "web", keys: { p256dh: "p1", auth: "a1" } },
      { token: "https://push.example/good", platform: "web", keys: { p256dh: "p2", auth: "a2" } },
    );
    mocks.sendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 2,
      responses: [
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered", message: "gone" },
        },
        {
          success: false,
          error: { code: "messaging/internal-error", message: "retry later" },
        },
      ],
    });
    mocks.sendNotification.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint.endsWith("/expired")) {
        throw { statusCode: 410, message: "subscription expired" };
      }
      return {};
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(body).toMatchObject({
      partial: true,
      sent: 1,
      failed: 3,
      removedInvalidTokens: 2,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("delete_push_tokens", {
      p_trip_id: "trip-1",
      p_trip_secret: "secret-1",
      p_tokens: ["native-invalid", "https://push.example/expired"],
    });
    const cleanupCall = mocks.rpc.mock.calls.find(([name]) => name === "delete_push_tokens");
    expect(cleanupCall?.[1].p_tokens).not.toContain("native-transient");
  });

  it("continues the web channel after a whole FCM batch throws without deleting native tokens", async () => {
    mocks.subscriptions.push(
      { token: "native-retry", platform: "ios", keys: null },
      { token: "https://push.example/web-ok", platform: "web", keys: { p256dh: "p", auth: "a" } },
    );
    mocks.sendEachForMulticast.mockRejectedValue(new Error("FCM temporary outage"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(body.channels.native).toMatchObject({ requested: 1, sent: 0, failed: 1 });
    expect(body.channels.web).toMatchObject({ requested: 1, sent: 1, failed: 0 });
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith("delete_push_tokens", expect.anything());
  });
});
