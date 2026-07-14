import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  createServerSupabaseMock,
  fromMock,
  pushSelectMock,
  syncSelectMock,
  syncInMock,
  deliveryInsertMock,
  deliveryDeleteMock,
  deliveryDeleteFinalEqMock,
} = vi.hoisted(() => ({
  createServerSupabaseMock: vi.fn(),
  fromMock: vi.fn(),
  pushSelectMock: vi.fn(),
  syncSelectMock: vi.fn(),
  syncInMock: vi.fn(),
  deliveryInsertMock: vi.fn(),
  deliveryDeleteMock: vi.fn(),
  deliveryDeleteFinalEqMock: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabase: createServerSupabaseMock,
}));

import { GET } from "@/app/api/push/morning-reminder/route";
import { buildMorningReminderBody } from "@/lib/morning-reminder";

describe("morning reminder cron authentication", () => {
  it("adds a practical preparation time to the daily summary", () => {
    expect(buildMorningReminderBody([
      { time: "08:00", name: "飯店早餐" },
      { time: "09:30", name: "明治神宮" },
    ])).toContain("建議 07:30 開始準備");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    pushSelectMock.mockResolvedValue({ data: [], error: null });
    syncInMock.mockResolvedValue({ data: [], error: null });
    syncSelectMock.mockReturnValue({ in: syncInMock });
    deliveryInsertMock.mockResolvedValue({ error: null });
    deliveryDeleteFinalEqMock.mockResolvedValue({ error: null });
    deliveryDeleteMock.mockReturnValue({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: deliveryDeleteFinalEqMock,
        })),
      })),
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "push_subscriptions") return { select: pushSelectMock };
      if (table === "sync_state") return { select: syncSelectMock };
      if (table === "push_delivery_log") {
        return { insert: deliveryInsertMock, delete: deliveryDeleteMock };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    createServerSupabaseMock.mockReturnValue({
      client: { from: fromMock },
      mode: "service_role",
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("accepts Vercel's Bearer token and reads subscriptions with service_role", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/push/morning-reminder",
      { headers: { Authorization: "Bearer cron-test-secret" } },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, processed: 0 });
    expect(fromMock).toHaveBeenCalledWith("push_subscriptions");
    expect(syncSelectMock).not.toHaveBeenCalled();
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
    expect(pushSelectMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to run when the server client falls back to anon", async () => {
    createServerSupabaseMock.mockReturnValue({
      client: { from: fromMock },
      mode: "anon",
      error: null,
    });

    const response = await GET(new NextRequest(
      "http://localhost/api/push/morning-reminder",
      { headers: { Authorization: "Bearer cron-test-secret" } },
    ));

    expect(response.status).toBe(500);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("never accepts a query-string secret in a Vercel environment", async () => {
    vi.stubEnv("VERCEL_ENV", "production");

    const response = await GET(new NextRequest(
      "https://example.vercel.app/api/push/morning-reminder?secret=cron-test-secret",
    ));

    expect(response.status).toBe(401);
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });

  it("never replays a 2026 itinerary on the same month and day in a later year", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-09-01T00:00:00Z"));
    pushSelectMock.mockResolvedValue({ data: [{ trip_id: "trip-1" }], error: null });
    syncInMock.mockResolvedValue({
      data: [{
        trip_id: "trip-1",
        trip_secret: "secret-1",
        itinerary: null,
      }],
      error: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new NextRequest(
      "http://localhost/api/push/morning-reminder",
      { headers: { Authorization: "Bearer cron-test-secret" } },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ processed: 0 });
    expect(deliveryInsertMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("claims a date before sending and skips duplicate cron executions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    pushSelectMock.mockResolvedValue({ data: [{ trip_id: "trip-1" }], error: null });
    syncInMock.mockResolvedValue({
      data: [{
        trip_id: "trip-1",
        trip_secret: "secret-1",
        itinerary: null,
      }],
      error: null,
    });
    deliveryInsertMock.mockResolvedValue({
      error: { code: "23505", message: "duplicate key" },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new NextRequest(
      "http://localhost/api/push/morning-reminder",
      { headers: { Authorization: "Bearer cron-test-secret" } },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(deliveryInsertMock).toHaveBeenCalledWith({
      trip_id: "trip-1",
      delivery_date: "2026-09-01",
      delivery_type: "morning-reminder",
    });
    expect(body.results[0].detail).toContain("略過重複執行");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("releases the idempotency claim when delivery fails so a retry can run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    pushSelectMock.mockResolvedValue({ data: [{ trip_id: "trip-1" }], error: null });
    syncInMock.mockResolvedValue({
      data: [{
        trip_id: "trip-1",
        trip_secret: "secret-1",
        itinerary: null,
      }],
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: vi.fn().mockResolvedValue({ ok: false, error: "delivery failed" }),
    }));

    const response = await GET(new NextRequest(
      "http://localhost/api/push/morning-reminder",
      { headers: { Authorization: "Bearer cron-test-secret" } },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results[0]).toMatchObject({ sent: false, detail: "delivery failed" });
    expect(deliveryDeleteMock).toHaveBeenCalledTimes(1);
    expect(deliveryDeleteFinalEqMock).toHaveBeenCalledWith("delivery_type", "morning-reminder");
  });

  it("keeps the claim after a partial multi-channel delivery to avoid duplicates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    pushSelectMock.mockResolvedValue({ data: [{ trip_id: "trip-1" }], error: null });
    syncInMock.mockResolvedValue({
      data: [{
        trip_id: "trip-1",
        trip_secret: "secret-1",
        itinerary: null,
      }],
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 207,
      json: vi.fn().mockResolvedValue({ ok: false, partial: true, sent: 1 }),
    }));

    const response = await GET(new NextRequest(
      "http://localhost/api/push/morning-reminder",
      { headers: { Authorization: "Bearer cron-test-secret" } },
    ));
    const body = await response.json();

    expect(body.results[0]).toMatchObject({ sent: true });
    expect(body.results[0].detail).toContain("部分通道成功");
    expect(deliveryDeleteMock).not.toHaveBeenCalled();
  });
});
