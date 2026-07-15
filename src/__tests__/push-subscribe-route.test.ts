import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabase: mocks.createServerSupabase,
  isForbiddenRpcError: (message?: string) => message === "forbidden",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 29, retryAfter: 0 }),
}));

import { DELETE, POST } from "@/app/api/push/subscribe/route";

function request(body: unknown, method: "POST" | "DELETE" = "DELETE") {
  return new NextRequest("http://localhost/api/push/subscribe", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerSupabase.mockReturnValue({
      client: { rpc: mocks.rpc },
      mode: "anon",
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: { ok: true, id: "push-1" }, error: null });
  });

  it("requires an HTTPS endpoint and both encryption keys for web push", async () => {
    const response = await POST(request({
      trip_id: "trip-1",
      trip_secret: "secret-1",
      token: "http://push.example.test/subscription",
      platform: "web",
      keys: { p256dh: "long-enough-p256dh" },
    }, "POST"));

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("passes a complete web subscription to the credential-bound RPC", async () => {
    const keys = { p256dh: "long-enough-p256dh", auth: "auth-key-value" };
    const response = await POST(request({
      trip_id: "trip-1",
      trip_secret: "secret-1",
      token: "https://push.example.test/subscription",
      platform: "web",
      keys,
    }, "POST"));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("upsert_push_subscription", {
      p_trip_id: "trip-1",
      p_trip_secret: "secret-1",
      p_token: "https://push.example.test/subscription",
      p_platform: "web",
      p_keys: keys,
    });
  });
});

describe("DELETE /api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerSupabase.mockReturnValue({
      client: { rpc: mocks.rpc },
      mode: "anon",
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: { ok: true, deleted: 1 }, error: null });
  });

  it("deletes only the caller-provided device token after credential validation", async () => {
    const response = await DELETE(request({
      trip_id: "trip-1",
      trip_secret: "secret-1",
      token: "device-token",
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_push_tokens", {
      p_trip_id: "trip-1",
      p_trip_secret: "secret-1",
      p_tokens: ["device-token"],
    });
  });

  it("does not reveal whether a trip exists when credentials are rejected", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "forbidden" },
    });

    const response = await DELETE(request({
      trip_id: "trip-1",
      trip_secret: "wrong",
      token: "device-token",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "代號或密碼錯誤" });
  });

  it("rejects an empty or oversized deletion request before calling Supabase", async () => {
    const response = await DELETE(request({
      trip_id: "",
      trip_secret: "",
      token: "",
    }));

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
