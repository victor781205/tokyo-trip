import { describe, expect, it, vi } from "vitest";
import {
  createOfflineTripPack,
  getRainFallbacks,
  isOfflineTripPack,
  persistOfflineTripPack,
  readOfflineTripPack,
  shouldShowRainPlan,
} from "@/lib/offline-pack";

function createMemoryCacheStorage() {
  const stores = new Map<string, Map<string, Response>>();
  const keyFor = (input: RequestInfo | URL) => {
    const raw = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    return new URL(raw, window.location.origin).toString();
  };
  const cacheStorage = {
    open: vi.fn(async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        put: async (input: RequestInfo | URL, response: Response) => {
          store.set(keyFor(input), response.clone());
        },
        match: async (input: RequestInfo | URL, options?: CacheQueryOptions) => {
          const key = keyFor(input);
          if (!options?.ignoreSearch) return store.get(key)?.clone();
          const target = new URL(key);
          target.search = "";
          for (const [candidate, response] of store) {
            const normalized = new URL(candidate);
            normalized.search = "";
            if (normalized.toString() === target.toString()) return response.clone();
          }
          return undefined;
        },
      } as Cache;
    }),
  } as unknown as CacheStorage;
  return { cacheStorage, stores };
}

describe("offline trip pack", () => {
  it("contains essential offline data without a trip secret", () => {
    const pack = createOfflineTripPack({
      tripId: "trip-1",
      itinerary: {},
      budgetLimit: 100_000,
      budgetItems: [],
      packingList: [],
      savedAt: new Date("2026-07-14T10:00:00Z"),
    });

    expect(pack.savedAt).toBe("2026-07-14T10:00:00.000Z");
    expect(pack.hotel.addressJa).toContain("墨田区");
    expect(pack.emergency.map((item) => item.number)).toEqual(
      expect.arrayContaining(["110", "119"]),
    );
    expect(JSON.stringify(pack)).not.toContain("secret");
  });

  it("shows a rain plan at 50 percent and returns day-specific alternatives", () => {
    expect(shouldShowRainPlan("50")).toBe(true);
    expect(shouldShowRainPlan("20")).toBe(false);
    expect(getRainFallbacks(4).join(" ")).toContain("teamLab");
  });

  it("commits a readable pack only after the HTML app shell is cached and verified", async () => {
    const { cacheStorage } = createMemoryCacheStorage();
    const pack = createOfflineTripPack({
      tripId: "trip-verified",
      itinerary: {},
      budgetLimit: 100_000,
      budgetItems: [],
      packingList: [],
      savedAt: new Date("2026-07-14T10:00:00Z"),
    });
    const fetcher = vi.fn(async () => new Response("<!doctype html><html></html>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }));

    const verified = await persistOfflineTripPack({ cacheStorage, pack, fetcher });

    expect(fetcher).toHaveBeenCalledWith("/", expect.objectContaining({ cache: "no-cache" }));
    expect(verified.savedAt).toBe(pack.savedAt);
    expect(await readOfflineTripPack(cacheStorage, pack.tripId)).toEqual(pack);
    expect(isOfflineTripPack(verified)).toBe(true);
  });

  it("does not publish a new pack when the required app shell is unavailable", async () => {
    const { cacheStorage } = createMemoryCacheStorage();
    const pack = createOfflineTripPack({
      tripId: "trip-partial",
      itinerary: {},
      budgetLimit: 100_000,
      budgetItems: [],
      packingList: [],
    });

    await expect(persistOfflineTripPack({
      cacheStorage,
      pack,
      fetcher: async () => new Response("unavailable", { status: 503 }),
    })).rejects.toThrow("app shell");
    expect(await readOfflineTripPack(cacheStorage, pack.tripId)).toBeNull();
  });

  it("rejects corrupt or cross-trip cached payloads", async () => {
    const { cacheStorage, stores } = createMemoryCacheStorage();
    const cache = await cacheStorage.open("tokyo-trip-offline-pack-v1");
    await cache.put("/__offline-pack__/trip-a", new Response(JSON.stringify({ version: 1 })));

    expect(isOfflineTripPack({ version: 1 })).toBe(false);
    expect(await readOfflineTripPack(cacheStorage, "trip-a")).toBeNull();
    expect(stores.size).toBeGreaterThan(0);
  });

  it("rejects a superficially valid pack with corrupt nested viewer data", () => {
    const pack = createOfflineTripPack({
      tripId: "trip-corrupt",
      itinerary: {},
      budgetLimit: 100_000,
      budgetItems: [],
      packingList: [],
    });

    expect(isOfflineTripPack({
      ...pack,
      itinerary: {
        day1: { title: "第一天", date: "2026-07-14", activities: [null] },
      },
    })).toBe(false);
    expect(isOfflineTripPack({ ...pack, emergency: [] })).toBe(false);
    expect(isOfflineTripPack({
      ...pack,
      packingList: [{ id: "passport", name: "護照", packed: "yes", category: "文件" }],
    })).toBe(false);
  });
});
