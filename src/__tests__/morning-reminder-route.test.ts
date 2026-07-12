import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerSupabaseMock, rpcMock } = vi.hoisted(() => ({
  createServerSupabaseMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabase: createServerSupabaseMock,
}));

import { GET } from "@/app/api/push/morning-reminder/route";

describe("morning reminder cron authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    rpcMock.mockResolvedValue({ data: [], error: null });
    createServerSupabaseMock.mockReturnValue({
      client: { rpc: rpcMock },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts Vercel's Bearer token and passes it to the protected RPC", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/push/morning-reminder",
      { headers: { Authorization: "Bearer cron-test-secret" } },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, processed: 0 });
    expect(rpcMock).toHaveBeenCalledWith("list_push_trips_for_cron", {
      p_expected_secret: "cron-test-secret",
      p_provided_secret: "cron-test-secret",
    });
  });

  it.each([
    undefined,
    "Basic cron-test-secret",
    "Bearer wrong-secret",
    "Bearer",
  ])("rejects a missing or invalid Authorization header (%s)", async (authorization) => {
    const headers = authorization ? { Authorization: authorization } : undefined;
    const response = await GET(new NextRequest(
      "http://localhost/api/push/morning-reminder",
      { headers },
    ));

    expect(response.status).toBe(401);
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });

  it("keeps the query-secret fallback for local and test invocations", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/push/morning-reminder?secret=cron-test-secret",
    ));

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("never accepts a query-string secret in a Vercel environment", async () => {
    vi.stubEnv("VERCEL_ENV", "production");

    const response = await GET(new NextRequest(
      "https://example.vercel.app/api/push/morning-reminder?secret=cron-test-secret",
    ));

    expect(response.status).toBe(401);
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });
});
