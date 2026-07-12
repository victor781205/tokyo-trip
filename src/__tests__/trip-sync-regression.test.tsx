import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import React, { useEffect, useRef } from "react";
import { act, render, waitFor, screen } from "@testing-library/react";
import type { useTrip as useTripType } from "@/context/TripContext";
import { EMPTY_TRIP_SNAPSHOT, writeTripCache } from "@/lib/trip-cache";

let TripProvider: React.ComponentType<{ children: React.ReactNode }>;
let useTrip: typeof useTripType;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "mock-key";
  const mod = await import("@/context/TripContext");
  TripProvider = mod.TripProvider;
  useTrip = mod.useTrip;
});

// Mock Supabase
const mockMaybeSingle = vi.fn();
const mockRpc = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockUpsert = vi.fn();

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn((_column: string, value: string) => ({
            maybeSingle: () => mockMaybeSingle(value),
          })),
        })),
        update: (...args: unknown[]) => {
          const result = mockUpdate(...args);
          return {
            eq: vi.fn(() => ({
              select: vi.fn(async () => result),
            })),
          };
        },
        insert: (...args: unknown[]) => {
          const result = mockInsert(...args);
          return {
            select: vi.fn(async () => result),
          };
        },
        upsert: (...args: unknown[]) => {
          const result = mockUpsert(...args);
          return {
            select: vi.fn(async () => result),
          };
        },
      })),
      rpc: mockRpc,
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
    })),
  };
});

// Helper component to access TripContext
function TestConsumer({
  onLoad,
  triggerEdit,
}: {
  onLoad?: (context: ReturnType<typeof useTrip>) => void;
  triggerEdit?: boolean;
}) {
  const trip = useTrip();
  const didTriggerEdit = useRef(false);

  useEffect(() => {
    if (trip.isLoaded && onLoad) {
      onLoad(trip);
    }
  }, [trip.isLoaded, trip, onLoad]);

  useEffect(() => {
    if (trip.isLoaded && triggerEdit && !didTriggerEdit.current) {
      didTriggerEdit.current = true;
      trip.setCustomFoods([
        {
          id: 999,
          emoji: "🍔",
          name: "新漢堡",
          location: "澀谷",
          hours: "10:00",
          desc: "非常好吃",
          mapLink: "",
          image: "",
        },
      ]);
    }
  }, [trip, triggerEdit]);

  return <div data-testid="loaded">{trip.isLoaded ? "LOADED" : "LOADING"}</div>;
}

describe("TripContext Sync Regression Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.clearAllMocks();
  });

  afterEach(() => {
  });

  it("successfully applies remote snapshot when remote updated_at is newer than local timestamp", async () => {
    // 1. Setup local storage with older/un-updated local data
    localStorage.setItem("tokyoTripId", "test-trip-id");
    localStorage.setItem("tokyoTripSecret", "test-trip-secret");
    localStorage.setItem(
      "tokyoCustomFoods",
      JSON.stringify([{ id: 1, name: "舊拉麵", emoji: "🍜", location: "舊新宿" }])
    );
    // Explicitly set an older local update timestamp
    localStorage.setItem("tokyoLocalUpdatedAt", "1000");

    // 2. Mock database returning newer remote data with some null fields
    const remoteTs = 5000000;
    mockMaybeSingle.mockResolvedValue({
      data: {
        trip_id: "test-trip-id",
        trip_secret: "test-trip-secret",
        updated_at: new Date(remoteTs).toISOString(),
        custom_foods: [
          {
            id: 2,
            name: "新壽司",
            emoji: "🍣",
            location: "銀座",
            hours: null, // null check!
            mapLink: null, // null check!
            image: null, // null check!
          },
        ],
      },
      error: null,
    });

    let contextRef: ReturnType<typeof useTrip> | undefined;

    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loaded")).toHaveTextContent("LOADED");
    });

    // 3. Verify remote data won and was sanitized successfully. The consumer
    // callback runs in an effect immediately after the LOADED paint, so wait
    // for the actual context snapshot instead of racing that effect.
    await waitFor(() => {
      expect(contextRef).toBeDefined();
      expect(contextRef?.customFoods).toHaveLength(1);
      expect(contextRef?.customFoods[0].name).toBe("新壽司");
      expect(contextRef?.customFoods[0].hours).toBe("");
      expect(contextRef?.customFoods[0].mapLink).toBe("");
    });

    // 4. Verify the trip-scoped cache was updated without writing global slice keys
    const cached = JSON.parse(localStorage.getItem("tokyoTripCache:test-trip-id") || "{}");
    expect(cached.snapshot.customFoods[0].name).toBe("新壽司");
    expect(cached.remoteUpdatedAt).toBe(remoteTs);
  });

  it("updates local timestamp and prepares to push when a local mutation happens", async () => {
    localStorage.setItem("tokyoTripId", "test-trip-id");
    localStorage.setItem("tokyoTripSecret", "test-trip-secret");

    mockMaybeSingle.mockResolvedValue({
      data: null, // No remote data yet
      error: null,
    });

    const beforeMutationTime = Date.now();

    render(
      <TripProvider>
        <TestConsumer triggerEdit={true} />
      </TripProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loaded")).toHaveTextContent("LOADED");
    });

    // Verify the trip-scoped local cache has the local change
    await waitFor(() => {
      const cached = JSON.parse(localStorage.getItem("tokyoTripCache:test-trip-id") || "{}");
      const storedFoods = cached.snapshot?.customFoods || [];
      expect(storedFoods).toHaveLength(1);
      expect(storedFoods[0].name).toBe("新漢堡");
    });

    // Verify the namespaced local timestamp was updated to a recent timestamp
    const cached = JSON.parse(localStorage.getItem("tokyoTripCache:test-trip-id") || "{}");
    const storedTs = Number(cached.localUpdatedAt || "0");
    expect(storedTs).toBeGreaterThanOrEqual(beforeMutationTime);
  });

  it("captures push permission failure via upsert_sync_state RPC and sets syncError", async () => {
    localStorage.setItem("tokyoTripId", "test-trip-id");
    localStorage.setItem("tokyoTripSecret", "wrong-trip-secret");

    // Mock first query (select) returning null because of incorrect secret / no row
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    // Mock SECURITY DEFINER RPC returning forbidden (or legacy RLS message)
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message: "new row violates row-level security policy for table \"sync_state\"",
      },
    });

    let contextRef: ReturnType<typeof useTrip> | undefined;

    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} triggerEdit={true} />
      </TripProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loaded")).toHaveTextContent("LOADED");
    });

    // Wait for the push to execute and catch the error
    await waitFor(() => {
      expect(contextRef?.syncStatus).toBe("error");
      expect(contextRef?.syncError).toMatch(/上傳變更失敗/);
      expect(contextRef?.syncError).toMatch(/密碼不符|權限被拒|row-level security|分享連結/);
    }, { timeout: 4000 });

    expect(mockRpc).toHaveBeenCalledWith(
      "upsert_sync_state",
      expect.objectContaining({
        p_trip_id: "test-trip-id",
        p_trip_secret: "wrong-trip-secret",
      }),
    );
  });

  it("pushes local custom_foods via upsert_sync_state RPC when remote is empty", async () => {
    localStorage.setItem("tokyoTripId", "test-trip-id-ok");
    localStorage.setItem("tokyoTripSecret", "test-trip-secret-ok");

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({
      data: { ok: true, action: "insert", trip_id: "test-trip-id-ok" },
      error: null,
    });

    let contextRef: ReturnType<typeof useTrip> | undefined;

    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} triggerEdit={true} />
      </TripProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loaded")).toHaveTextContent("LOADED");
    });

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalled();
    }, { timeout: 4000 });

    expect(mockRpc).toHaveBeenCalledWith(
      "upsert_sync_state",
      expect.objectContaining({
        p_trip_id: "test-trip-id-ok",
        p_trip_secret: "test-trip-secret-ok",
        p_custom_foods: expect.arrayContaining([
          expect.objectContaining({ name: "新漢堡" }),
        ]),
      }),
    );

    await waitFor(() => {
      expect(contextRef?.syncStatus).toBe("online");
      expect(contextRef?.syncError).toBeNull();
    }, { timeout: 4000 });
  });

  it("falls back to UPDATE/INSERT when upsert_sync_state RPC is not deployed", async () => {
    localStorage.setItem("tokyoTripId", "test-trip-fallback");
    localStorage.setItem("tokyoTripSecret", "test-trip-secret-fallback");

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'Could not find the function public.upsert_sync_state(...) in the schema cache',
        code: "PGRST202",
      },
    });
    // no existing row → update returns empty, insert succeeds
    mockUpdate.mockResolvedValue({ data: [], error: null });
    mockInsert.mockResolvedValue({
      data: [{ trip_id: "test-trip-fallback" }],
      error: null,
    });

    let contextRef: ReturnType<typeof useTrip> | undefined;

    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} triggerEdit={true} />
      </TripProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loaded")).toHaveTextContent("LOADED");
    });

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
      expect(contextRef?.syncStatus).toBe("online");
      expect(contextRef?.syncError).toBeNull();
    }, { timeout: 4000 });
  });

  it("switches from trip A to trip B without reusing trip A's cached state", async () => {
    localStorage.setItem("tokyoTripId", "trip-a");
    localStorage.setItem("tokyoTripSecret", "secret-a");
    writeTripCache(localStorage, "trip-a", {
      snapshot: {
        ...EMPTY_TRIP_SNAPSHOT,
        customFoods: [{
          id: 1,
          emoji: "🍜",
          name: "A 的拉麵",
          location: "上野",
          hours: "",
          desc: "",
          mapLink: "",
          image: "",
        }],
      },
      dirtySlices: [],
      remoteUpdatedAt: 100,
      localUpdatedAt: 0,
      legacyMigration: false,
    });

    mockMaybeSingle.mockImplementation(async (id: string) => ({
      data: {
        trip_id: id,
        trip_secret: id === "trip-a" ? "secret-a" : "secret-b",
        updated_at: new Date(200).toISOString(),
        custom_foods: [{
          id: id === "trip-a" ? 1 : 2,
          emoji: id === "trip-a" ? "🍜" : "🍣",
          name: id === "trip-a" ? "A 的拉麵" : "B 的壽司",
          location: "東京",
          hours: "",
          desc: "",
          mapLink: "",
          image: "",
        }],
      },
      error: null,
    }));

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );

    await waitFor(() => expect(contextRef?.customFoods[0]?.name).toBe("A 的拉麵"));
    await act(async () => {
      expect(await contextRef?.loginToTrip("trip-b", "secret-b")).toBe(true);
    });
    await waitFor(() => expect(contextRef?.customFoods[0]?.name).toBe("B 的壽司"));

    const cacheA = JSON.parse(localStorage.getItem("tokyoTripCache:trip-a") || "{}");
    const cacheB = JSON.parse(localStorage.getItem("tokyoTripCache:trip-b") || "{}");
    expect(cacheA.snapshot.customFoods[0].name).toBe("A 的拉麵");
    expect(cacheB.snapshot.customFoods[0].name).toBe("B 的壽司");
    expect(localStorage.getItem("tokyoTripId")).toBe("trip-b");
  });

  it("keeps trip A's pending edit when a login to trip B fails", async () => {
    localStorage.setItem("tokyoTripId", "trip-a");
    localStorage.setItem("tokyoTripSecret", "secret-a");
    mockMaybeSingle.mockImplementation(async (id: string) => id === "trip-a"
      ? {
          data: {
            trip_id: "trip-a",
            trip_secret: "secret-a",
            updated_at: new Date(200).toISOString(),
            custom_foods: [],
          },
          error: null,
        }
      : { data: null, error: null });
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );
    await waitFor(() => expect(contextRef?.isLoaded).toBe(true));

    act(() => {
      contextRef?.setCustomFoods([{
        id: 3,
        emoji: "🍡",
        name: "A 的離線編輯",
        location: "淺草",
        hours: "",
        desc: "",
        mapLink: "",
        image: "",
      }]);
    });
    await act(async () => {
      expect(await contextRef?.loginToTrip("trip-b", "wrong-secret")).toBe(false);
    });

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        "upsert_sync_state",
        expect.objectContaining({
          p_trip_id: "trip-a",
          p_trip_secret: "secret-a",
          p_custom_foods: expect.arrayContaining([
            expect.objectContaining({ name: "A 的離線編輯" }),
          ]),
        }),
      );
    }, { timeout: 4000 });
  });

  it("restores trip A when a shared trip B link is invalid, including Strict Mode remounts", async () => {
    localStorage.setItem("tokyoTripId", "trip-a");
    localStorage.setItem("tokyoTripSecret", "secret-a");
    window.history.replaceState({}, "", "/#trip=trip-b&secret=wrong-secret");
    mockMaybeSingle.mockImplementation(async (id: string) => id === "trip-a"
      ? {
          data: {
            trip_id: "trip-a",
            trip_secret: "secret-a",
            updated_at: new Date(500).toISOString(),
            custom_foods: [{
              id: 8,
              emoji: "🍜",
              name: "A 的原行程",
              location: "錦糸町",
              hours: "",
              desc: "",
              mapLink: "",
              image: "",
            }],
          },
          error: null,
        }
      : { data: null, error: null });

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <React.StrictMode>
        <TripProvider>
          <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
        </TripProvider>
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(contextRef?.tripId).toBe("trip-a");
      expect(contextRef?.customFoods[0]?.name).toBe("A 的原行程");
    });
    expect(localStorage.getItem("tokyoTripId")).toBe("trip-a");
    expect(localStorage.getItem("tokyoTripSecret")).toBe("secret-a");
    expect(window.location.hash).toBe("");
  });

  it("does not mark a new empty trip shareable until its first cloud write succeeds", async () => {
    localStorage.setItem("tokyoTripId", "new-empty-trip");
    localStorage.setItem("tokyoTripSecret", "new-empty-secret");
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );

    await waitFor(() => expect(contextRef?.isLoaded).toBe(true));
    expect(contextRef?.isShareReady).toBe(false);
    await waitFor(() => expect(contextRef?.isShareReady).toBe(true), { timeout: 4000 });
  });
});
