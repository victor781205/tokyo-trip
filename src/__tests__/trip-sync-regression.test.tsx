import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import React, { useEffect, useRef } from "react";
import { act, render, waitFor, screen } from "@testing-library/react";
import type { useTrip as useTripType } from "@/context/TripContext";
import { EMPTY_TRIP_SNAPSHOT, readTripProfiles, writeTripCache } from "@/lib/trip-cache";
import { PENDING_SHARE_CREDENTIAL_KEY } from "@/lib/trip-credentials";

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
const selectedColumns: string[] = [];
const createdClientHeaders: Record<string, string>[] = [];

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn((_url: string, _key: string, options?: {
      global?: { headers?: Record<string, string> };
    }) => {
      createdClientHeaders.push(options?.global?.headers ?? {});
      return ({
      from: vi.fn(() => ({
        select: vi.fn((columns: string) => {
          selectedColumns.push(columns);
          return ({
          eq: vi.fn((_column: string, value: string) => ({
            maybeSingle: () => mockMaybeSingle(value, columns, options?.global?.headers ?? {}),
          })),
          });
        }),
      })),
      rpc: mockRpc,
      });
    }),
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
    selectedColumns.length = 0;
    createdClientHeaders.length = 0;
  });

  afterEach(() => {
  });

  it("applies a higher server revision without selecting trip_secret", async () => {
    localStorage.setItem("tokyoTripId", "test-trip-id");
    localStorage.setItem("tokyoTripSecret", "test-trip-secret");
    writeTripCache(localStorage, "test-trip-id", {
      snapshot: {
        ...EMPTY_TRIP_SNAPSHOT,
        customFoods: [{
          id: 1,
          name: "舊拉麵",
          emoji: "🍜",
          location: "舊新宿",
          hours: "",
          desc: "",
          mapLink: "",
          image: "",
        }],
      },
      dirtySlices: [],
      remoteRevision: 1,
      remoteUpdatedAt: 1_000,
      localUpdatedAt: 0,
      legacyMigration: false,
    });

    const remoteTs = 5000000;
    mockMaybeSingle.mockResolvedValue({
      data: {
        trip_id: "test-trip-id",
        revision: 2,
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
    expect(cached.remoteRevision).toBe(2);
    expect(cached.remoteUpdatedAt).toBe(remoteTs);
    expect(selectedColumns.every((columns) => columns !== "*" && !columns.includes("trip_secret"))).toBe(true);
    expect(selectedColumns.every((columns) => {
      const selected = columns.split(",");
      return !selected.includes("id") && !selected.includes("trip_id");
    })).toBe(true);
    expect(createdClientHeaders).toContainEqual({
      "x-trip-id": "test-trip-id",
      "x-trip-secret": "test-trip-secret",
    });
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

  it("captures push permission failure from sync_trip_slices and sets syncError", async () => {
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
      "sync_trip_slices_v2",
      expect.objectContaining({
        p_trip_id: "test-trip-id",
        p_trip_secret: "wrong-trip-secret",
        p_expected_revision: 0,
        p_dirty_slices: ["customFoods"],
      }),
    );
  });

  it("pushes only dirty custom_foods through the CAS RPC when remote is empty", async () => {
    localStorage.setItem("tokyoTripId", "test-trip-id-ok");
    localStorage.setItem("tokyoTripSecret", "test-trip-secret-ok");

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        action: "insert",
        revision: 1,
        updated_at: "2026-07-14T00:00:00.000Z",
      },
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
      "sync_trip_slices_v2",
      expect.objectContaining({
        p_trip_id: "test-trip-id-ok",
        p_trip_secret: "test-trip-secret-ok",
        p_expected_revision: 0,
        p_dirty_slices: ["customFoods"],
        p_custom_foods: expect.arrayContaining([
          expect.objectContaining({ name: "新漢堡" }),
        ]),
      }),
    );
    const rpcArgs = mockRpc.mock.calls.find(([name]) => name === "sync_trip_slices_v2")?.[1];
    expect(rpcArgs).not.toHaveProperty("p_itinerary");
    expect(rpcArgs).not.toHaveProperty("p_budget_items");
    expect(rpcArgs).not.toHaveProperty("p_updated_at");

    await waitFor(() => {
      expect(contextRef?.syncStatus).toBe("online");
      expect(contextRef?.syncError).toBeNull();
    }, { timeout: 4000 });
  });

  it("fails closed instead of direct table writes when the CAS RPC is not deployed", async () => {
    localStorage.setItem("tokyoTripId", "test-trip-fallback");
    localStorage.setItem("tokyoTripSecret", "test-trip-secret-fallback");

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'Could not find the function public.sync_trip_slices(...) in the schema cache',
        code: "PGRST202",
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

    await waitFor(() => {
      expect(contextRef?.syncStatus).toBe("error");
      expect(contextRef?.syncError).toMatch(/安全升級|停止寫入/);
    }, { timeout: 4000 });
    expect(mockRpc).toHaveBeenCalledWith(
      "sync_trip_slices_v2",
      expect.objectContaining({ p_expected_revision: 0 }),
    );
  });

  it("stops after three CAS conflicts and keeps the dirty slice for recovery", async () => {
    localStorage.setItem("tokyoTripId", "legacy-trip");
    localStorage.setItem("tokyoTripSecret", "0505");
    let pulledRevision = 0;
    mockMaybeSingle.mockImplementation(async () => {
      pulledRevision += 1;
      return {
        data: {
          revision: pulledRevision,
          updated_at: `2000-01-0${Math.min(pulledRevision, 9)}T00:00:00.000Z`,
          itinerary: {},
          budget_limit: 100000,
          budget_items: [],
          custom_foods: [],
          packing_list: [],
        },
        error: null,
      };
    });
    mockRpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
      data: {
        ok: false,
        conflict: true,
        revision: Number(args.p_expected_revision) + 1,
      },
      error: null,
    }));

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} triggerEdit />
      </TripProvider>,
    );

    await waitFor(() => {
      expect(contextRef?.syncStatus).toBe("error");
      expect(contextRef?.syncError).toMatch(/重試 3 次/);
    }, { timeout: 5000 });
    expect(mockRpc).toHaveBeenCalledTimes(3);
    const cached = JSON.parse(localStorage.getItem("tokyoTripCache:legacy-trip") || "{}");
    expect(cached.dirtySlices).toContain("customFoods");
    expect(cached.snapshot.customFoods[0].name).toBe("新漢堡");
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
      remoteRevision: 1,
      remoteUpdatedAt: 100,
      localUpdatedAt: 0,
      legacyMigration: false,
    });

    mockMaybeSingle.mockImplementation(async (id: string) => ({
      data: {
        trip_id: id,
        revision: 2,
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
            revision: 1,
            updated_at: new Date(200).toISOString(),
            custom_foods: [],
          },
          error: null,
        }
      : { data: null, error: null });
    mockRpc.mockResolvedValue({
      data: { ok: true, revision: 2, updated_at: "2026-07-14T00:00:00.000Z" },
      error: null,
    });

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
        "sync_trip_slices_v2",
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
            revision: 1,
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

  it("never accepts query-string credentials and scrubs them without removing unrelated URL state", async () => {
    localStorage.setItem("tokyoTripId", "trip-a");
    localStorage.setItem("tokyoTripSecret", "secret-a");
    window.history.replaceState(
      { preserved: true },
      "",
      "/?lang=zh&trip=trip-b&secret=leaked#view=budget",
    );
    mockMaybeSingle.mockImplementation(async (id: string) => ({
      data: id === "trip-a"
        ? {
            trip_id: "trip-a",
            revision: 1,
            updated_at: "2026-07-14T00:00:00.000Z",
            itinerary: {},
            budget_limit: 100000,
            budget_items: [],
            custom_foods: [],
            packing_list: [],
          }
        : null,
      error: null,
    }));

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );

    await waitFor(() => expect(contextRef?.tripId).toBe("trip-a"));
    expect(mockMaybeSingle.mock.calls.map(([id]) => id)).not.toContain("trip-b");
    expect(window.location.search).toBe("?lang=zh");
    expect(window.location.hash).toBe("#view=budget");
    expect(window.history.state).toEqual({ preserved: true });
  });

  it("accepts hash credentials, verifies them, then removes only credential hash keys", async () => {
    localStorage.setItem("tokyoTripId", "trip-a");
    localStorage.setItem("tokyoTripSecret", "secret-a");
    localStorage.setItem("tokyoCustomFoods", JSON.stringify([{
      id: 77,
      emoji: "🍜",
      name: "只屬於舊行程 A",
      location: "上野",
      hours: "",
      desc: "",
      mapLink: "",
      image: "",
    }]));
    window.history.replaceState(
      {},
      "",
      "/?lang=zh#trip=trip-b&secret=secret-b&view=budget",
    );
    mockMaybeSingle.mockImplementation(async (id: string) => ({
      data: id === "trip-b"
        ? {
            trip_id: "trip-b",
            revision: 4,
            updated_at: "2026-07-14T00:00:00.000Z",
            itinerary: {},
            budget_limit: 88000,
            budget_items: [],
            custom_foods: [],
            packing_list: [],
          }
        : null,
      error: null,
    }));

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );

    await waitFor(() => {
      expect(contextRef?.tripId).toBe("trip-b");
      expect(contextRef?.budgetLimit).toBe(88000);
    });
    expect(localStorage.getItem("tokyoTripId")).toBe("trip-b");
    expect(localStorage.getItem("tokyoTripSecret")).toBe("secret-b");
    expect(JSON.parse(localStorage.getItem("tokyoTripCache:trip-a") || "{}")
      .snapshot.customFoods[0].name).toBe("只屬於舊行程 A");
    expect(localStorage.getItem("tokyoCustomFoods")).toBeNull();
    expect(contextRef?.customFoods).toEqual([]);
    expect(window.location.search).toBe("?lang=zh");
    expect(window.location.hash).toBe("#view=budget");
  });

  it("recovers a clean-browser share after an outage without trusting it before verification", async () => {
    window.history.replaceState({}, "", "/#trip=trip-b&secret=secret-b");
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "temporary transport failure" },
    });

    let firstContext: ReturnType<typeof useTrip> | undefined;
    const firstMount = render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (firstContext = ctx)} />
      </TripProvider>,
    );

    await waitFor(() => {
      expect(firstContext?.tripId).toBe("trip-b");
      expect(firstContext?.syncStatus).toBe("offline");
    });
    expect(window.location.hash).toBe("");
    expect(localStorage.getItem("tokyoTripId")).toBeNull();
    expect(localStorage.getItem("tokyoTripSecret")).toBeNull();
    expect(readTripProfiles(localStorage)).toEqual([]);
    expect(firstContext?.isShareReady).toBe(false);
    expect(firstContext?.getShareLink()).toBe("");
    expect(JSON.parse(localStorage.getItem(PENDING_SHARE_CREDENTIAL_KEY) || "{}")).toMatchObject({
      status: "unverified",
      source: "share-hash",
      tripId: "trip-b",
      tripSecret: "secret-b",
    });

    act(() => {
      firstContext?.setCustomFoods([{
        id: 44,
        emoji: "🍙",
        name: "B 的離線飯糰",
        location: "東京站",
        hours: "",
        desc: "",
        mapLink: "",
        image: "",
      }]);
    });
    await waitFor(() => {
      const cached = JSON.parse(localStorage.getItem("tokyoTripCache:trip-b") || "{}");
      expect(cached.snapshot.customFoods[0].name).toBe("B 的離線飯糰");
      expect(cached.dirtySlices).toContain("customFoods");
    });
    firstMount.unmount();

    mockMaybeSingle.mockResolvedValue({
      data: {
        revision: 3,
        updated_at: "2026-07-14T00:00:00.000Z",
        itinerary: {},
        budget_limit: 100000,
        budget_items: [],
        custom_foods: [],
        packing_list: [],
        food_statuses: {},
      },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: { ok: true, revision: 4, updated_at: "2026-07-14T00:00:01.000Z" },
      error: null,
    });

    let recoveredContext: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (recoveredContext = ctx)} />
      </TripProvider>,
    );

    await waitFor(() => {
      expect(recoveredContext?.tripId).toBe("trip-b");
      expect(recoveredContext?.syncStatus).toBe("online");
      expect(recoveredContext?.customFoods[0]?.name).toBe("B 的離線飯糰");
      expect(localStorage.getItem("tokyoTripId")).toBe("trip-b");
      expect(localStorage.getItem("tokyoTripSecret")).toBe("secret-b");
    });
    expect(localStorage.getItem(PENDING_SHARE_CREDENTIAL_KEY)).toBeNull();
    expect(readTripProfiles(localStorage)).toContainEqual(expect.objectContaining({
      tripId: "trip-b",
      tripSecret: "secret-b",
    }));
  });

  it("rejects a wrong clean-browser share secret without persisting it as trusted", async () => {
    window.history.replaceState({}, "", "/#trip=trip-b&secret=wrong-secret");
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );

    await waitFor(() => {
      expect(contextRef?.tripId).toBe("trip-b");
      expect(contextRef?.syncStatus).toBe("error");
      expect(contextRef?.syncError).toMatch(/找不到此行程|密碼不正確/);
    });
    expect(localStorage.getItem("tokyoTripId")).toBeNull();
    expect(localStorage.getItem("tokyoTripSecret")).toBeNull();
    expect(localStorage.getItem(PENDING_SHARE_CREDENTIAL_KEY)).toBeNull();
    expect(readTripProfiles(localStorage)).toEqual([]);
    expect(contextRef?.isShareReady).toBe(false);
    expect(contextRef?.getShareLink()).toBe("");

    act(() => {
      contextRef?.setCustomFoods([{
        id: 45,
        emoji: "🍜",
        name: "不應寫入錯誤行程",
        location: "東京",
        hours: "",
        desc: "",
        mapLink: "",
        image: "",
      }]);
    });
    const rejectedCache = JSON.parse(localStorage.getItem("tokyoTripCache:trip-b") || "{}");
    expect(rejectedCache.snapshot.customFoods).toEqual([]);
  });

  it("does not create a new trip when an unavailable pending share is later rejected", async () => {
    window.history.replaceState({}, "", "/#trip=trip-b&secret=wrong-secret");
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "temporary transport failure" },
    });

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );
    await waitFor(() => expect(contextRef?.syncStatus).toBe("offline"));
    expect(localStorage.getItem(PENDING_SHARE_CREDENTIAL_KEY)).not.toBeNull();

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    act(() => window.dispatchEvent(new Event("online")));

    await waitFor(() => {
      expect(contextRef?.syncStatus).toBe("error");
      expect(contextRef?.syncError).toMatch(/找不到此行程|密碼不正確/);
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(localStorage.getItem(PENDING_SHARE_CREDENTIAL_KEY)).toBeNull();
    expect(localStorage.getItem("tokyoTripId")).toBeNull();
    expect(localStorage.getItem("tokyoTripSecret")).toBeNull();
    expect(readTripProfiles(localStorage)).toEqual([]);
    expect(contextRef?.getShareLink()).toBe("");
  });

  it("merges two devices that race on one revision even when timestamps move backwards", async () => {
    localStorage.setItem("tokyoTripId", "legacy-short-id");
    localStorage.setItem("tokyoTripSecret", "0505");

    let server = {
      trip_id: "legacy-short-id",
      revision: 1,
      // Intentionally older than the clients' clocks. Revision must win.
      updated_at: "2000-01-03T00:00:00.000Z",
      itinerary: {},
      budget_limit: 100000,
      budget_items: [],
      custom_foods: [] as Array<Record<string, unknown>>,
      packing_list: [] as Array<Record<string, unknown>>,
    };
    const attempts: Array<{ expected: number; slices: string[]; hasClientTimestamp: boolean }> = [];

    mockMaybeSingle.mockImplementation(async (id: string) => ({
      data: id === server.trip_id ? structuredClone(server) : null,
      error: null,
    }));
    mockRpc.mockImplementation(async (name: string, rawArgs: Record<string, unknown>) => {
      expect(name).toBe("sync_trip_slices_v2");
      const expected = Number(rawArgs.p_expected_revision);
      const slices = rawArgs.p_dirty_slices as string[];
      attempts.push({
        expected,
        slices,
        hasClientTimestamp: Object.hasOwn(rawArgs, "p_updated_at"),
      });
      if (expected !== server.revision) {
        return {
          data: { ok: false, conflict: true, revision: server.revision },
          error: null,
        };
      }

      server = {
        ...server,
        revision: server.revision + 1,
        // Simulate server/NTP clock rollback across successful revisions.
        updated_at: server.revision === 1
          ? "2000-01-02T00:00:00.000Z"
          : "2000-01-01T00:00:00.000Z",
        custom_foods: slices.includes("customFoods")
          ? structuredClone(rawArgs.p_custom_foods as Array<Record<string, unknown>>)
          : server.custom_foods,
        budget_limit: slices.includes("budgetLimit")
          ? Number(rawArgs.p_budget_limit)
          : server.budget_limit,
      };
      return {
        data: {
          ok: true,
          revision: server.revision,
          updated_at: server.updated_at,
        },
        error: null,
      };
    });

    let deviceA: ReturnType<typeof useTrip> | undefined;
    let deviceB: ReturnType<typeof useTrip> | undefined;
    render(
      <>
        <TripProvider>
          <TestConsumer onLoad={(ctx) => (deviceA = ctx)} />
        </TripProvider>
        <TripProvider>
          <TestConsumer onLoad={(ctx) => (deviceB = ctx)} />
        </TripProvider>
      </>,
    );
    await waitFor(() => {
      expect(deviceA?.isLoaded).toBe(true);
      expect(deviceB?.isLoaded).toBe(true);
    });

    act(() => {
      deviceA?.setCustomFoods([{
        id: 42,
        emoji: "🍣",
        name: "裝置 A 的壽司",
        location: "銀座",
        hours: "",
        desc: "",
        mapLink: "",
        image: "",
      }]);
      deviceB?.setBudgetLimit(123456);
    });

    await waitFor(() => expect(server.revision).toBe(3), { timeout: 6000 });
    expect(server.custom_foods).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "裝置 A 的壽司" }),
    ]));
    expect(server.budget_limit).toBe(123456);
    expect(attempts.filter(({ expected }) => expected === 1)).toHaveLength(2);
    expect(attempts.filter(({ expected }) => expected === 2)).toHaveLength(1);
    expect(attempts.every(({ hasClientTimestamp }) => !hasClientTimestamp)).toBe(true);

    // A bounded authenticated pull converges both clients after the race.
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => {
      expect(deviceA?.budgetLimit).toBe(123456);
      expect(deviceB?.customFoods[0]?.name).toBe("裝置 A 的壽司");
    });
  });

  it("recovers a committed secret rotation when the RPC resolves with an ambiguous network error", async () => {
    localStorage.setItem("tokyoTripId", "rotate-trip");
    localStorage.setItem("tokyoTripSecret", "old-secret");
    let serverSecret = "old-secret";
    let serverRevision = 1;
    const remoteRecord = () => ({
      trip_id: "rotate-trip",
      revision: serverRevision,
      updated_at: new Date(serverRevision * 1000).toISOString(),
      itinerary: {},
      budget_limit: 100000,
      budget_items: [],
      custom_foods: [],
      packing_list: [],
      food_statuses: {},
    });
    mockMaybeSingle.mockImplementation(async (
      id: string,
      _columns: string,
      headers: Record<string, string>,
    ) => ({
      data: id === "rotate-trip" && headers["x-trip-secret"] === serverSecret
        ? remoteRecord()
        : null,
      error: null,
    }));
    mockRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("rotate_trip_secret");
      serverSecret = String(args.p_new_secret);
      serverRevision += 1;
      return { data: null, error: { message: "TypeError: Failed to fetch" } };
    });

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );
    await waitFor(() => expect(contextRef?.syncStatus).toBe("online"));

    let result: Awaited<ReturnType<NonNullable<typeof contextRef>["rotateTripSecret"]>> | undefined;
    await act(async () => {
      result = await contextRef?.rotateTripSecret();
    });

    expect(result).toMatchObject({ ok: true, newSecret: serverSecret });
    expect(contextRef?.tripSecret).toBe(serverSecret);
    expect(localStorage.getItem("tokyoTripSecret")).toBe(serverSecret);
    expect(localStorage.getItem("tokyoTripPendingRotation:v1")).toBeNull();
  });

  it("keeps the rotation recovery marker when the new secret cannot be read back from storage", async () => {
    localStorage.setItem("tokyoTripId", "rotate-storage-trip");
    localStorage.setItem("tokyoTripSecret", "old-secret");
    let serverSecret = "old-secret";
    let serverRevision = 1;
    mockMaybeSingle.mockImplementation(async (
      id: string,
      _columns: string,
      headers: Record<string, string>,
    ) => ({
      data: id === "rotate-storage-trip" && headers["x-trip-secret"] === serverSecret
        ? {
          trip_id: id,
          revision: serverRevision,
          updated_at: new Date(serverRevision * 1000).toISOString(),
          itinerary: {},
          budget_limit: 100000,
          budget_items: [],
          custom_foods: [],
          packing_list: [],
          food_statuses: {},
        }
        : null,
      error: null,
    }));
    mockRpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => {
      serverSecret = String(args.p_new_secret);
      serverRevision += 1;
      return { data: { ok: true, revision: serverRevision }, error: null };
    });

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );
    await waitFor(() => expect(contextRef?.syncStatus).toBe("online"));

    const originalSetItem = Storage.prototype.setItem;
    const storageSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "tokyoTripSecret" && value !== "old-secret") {
        throw new DOMException("quota", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    });
    try {
      await act(async () => {
        expect(await contextRef?.rotateTripSecret()).toMatchObject({ ok: true });
      });
      expect(contextRef?.tripSecret).toBe(serverSecret);
      expect(localStorage.getItem("tokyoTripSecret")).toBe("old-secret");
      expect(localStorage.getItem("tokyoTripPendingRotation:v1")).not.toBeNull();
      expect(contextRef?.storageError).toMatch(/無法持久保存|復原點/);
    } finally {
      storageSpy.mockRestore();
    }
  });

  it("clears rollback candidates after catching up and when switching trips", async () => {
    localStorage.setItem("tokyoTripId", "rollback-a");
    localStorage.setItem("tokyoTripSecret", "secret-a");
    writeTripCache(localStorage, "rollback-a", {
      snapshot: { ...EMPTY_TRIP_SNAPSHOT, budgetLimit: 111000 },
      dirtySlices: [],
      remoteRevision: 5,
      remoteUpdatedAt: 5000,
      localUpdatedAt: 0,
      legacyMigration: false,
    });
    let revisionA = 4;
    mockMaybeSingle.mockImplementation(async (id: string) => ({
      data: id === "rollback-a"
        ? {
          trip_id: id,
          revision: revisionA,
          updated_at: new Date(revisionA * 1000).toISOString(),
          itinerary: {},
          budget_limit: revisionA * 1000,
          budget_items: [],
          custom_foods: [],
          packing_list: [],
          food_statuses: {},
        }
        : {
          trip_id: "rollback-b",
          revision: 1,
          updated_at: new Date(1000).toISOString(),
          itinerary: {},
          budget_limit: 222000,
          budget_items: [],
          custom_foods: [],
          packing_list: [],
          food_statuses: {},
        },
      error: null,
    }));

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );
    await waitFor(() => expect(contextRef?.hasRevisionRollback).toBe(true));

    revisionA = 6;
    await act(async () => {
      expect(await contextRef?.retrySync()).toBe(true);
    });
    await waitFor(() => expect(contextRef?.hasRevisionRollback).toBe(false));
    expect(contextRef?.budgetLimit).toBe(6000);

    revisionA = 5;
    await act(async () => {
      expect(await contextRef?.retrySync()).toBe(false);
    });
    await waitFor(() => expect(contextRef?.hasRevisionRollback).toBe(true));

    await act(async () => {
      expect(await contextRef?.loginToTrip("rollback-b", "secret-b")).toBe(true);
    });
    expect(contextRef?.hasRevisionRollback).toBe(false);
    expect(contextRef?.applyAuthoritativeRollback()).toBe(false);
    expect(contextRef?.tripId).toBe("rollback-b");
    expect(contextRef?.budgetLimit).toBe(222000);
  });

  it("does not mark a new empty trip shareable until its first cloud write succeeds", async () => {
    localStorage.setItem("tokyoTripId", "trip_ABCDEFGHIJKLMNOPQRSTUV");
    localStorage.setItem("tokyoTripSecret", "sec_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        action: "insert",
        revision: 1,
        updated_at: "2026-07-14T00:00:00.000Z",
      },
      error: null,
    });

    let contextRef: ReturnType<typeof useTrip> | undefined;
    render(
      <TripProvider>
        <TestConsumer onLoad={(ctx) => (contextRef = ctx)} />
      </TripProvider>,
    );

    await waitFor(() => expect(contextRef?.isLoaded).toBe(true));
    expect(contextRef?.isShareReady).toBe(false);
    const getShareLinkFromFirstRender = contextRef?.getShareLink;
    await waitFor(() => expect(contextRef?.isShareReady).toBe(true), { timeout: 4000 });
    expect(getShareLinkFromFirstRender?.()).toContain(
      "#trip=trip_ABCDEFGHIJKLMNOPQRSTUV&secret=sec_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef",
    );
    expect(mockRpc).toHaveBeenCalledWith(
      "sync_trip_slices_v2",
      expect.objectContaining({
        p_expected_revision: 0,
        p_dirty_slices: [],
      }),
    );
  });
});
