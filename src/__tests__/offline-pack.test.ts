import { describe, expect, it, vi } from "vitest";
import {
  createOfflineTripPack,
  getRainFallbacks,
  isOfflineTripPack,
  OFFLINE_PACK_MAX_IMPORT_BYTES,
  persistImportedOfflineTripPack,
  persistOfflineTripPack,
  readOfflineTripPack,
  shouldShowRainPlan,
  validateOfflineTripPackImport,
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
        delete: async (input: RequestInfo | URL) => store.delete(keyFor(input)),
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

  it("strictly validates a same-trip exported backup before import", () => {
    const pack = createOfflineTripPack({
      tripId: "trip-import",
      itinerary: {
        day1: {
          title: "抵達東京",
          date: "9/1",
          activities: [{ time: "12:55", name: "成田機場", desc: "入境", tag: "交通" }],
        },
      },
      budgetLimit: 120_000,
      budgetItems: [],
      packingList: [],
    });

    const result = validateOfflineTripPackImport(JSON.stringify(pack), "trip-import");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack).toEqual(pack);
      expect(result.byteLength).toBeGreaterThan(0);
    }
  });

  it("rejects oversized, unsupported, cross-trip, and extra-field backup data", () => {
    const pack = createOfflineTripPack({
      tripId: "trip-a",
      itinerary: {},
      budgetLimit: 100_000,
      budgetItems: [],
      packingList: [],
    });

    expect(validateOfflineTripPackImport(
      "x".repeat(OFFLINE_PACK_MAX_IMPORT_BYTES + 1),
      "trip-a",
    )).toMatchObject({ ok: false, code: "too_large" });
    expect(validateOfflineTripPackImport(
      JSON.stringify({ ...pack, version: 2 }),
      "trip-a",
    )).toMatchObject({ ok: false, code: "unsupported_version" });
    expect(validateOfflineTripPackImport(
      JSON.stringify(pack),
      "trip-b",
    )).toMatchObject({ ok: false, code: "trip_mismatch" });
    expect(validateOfflineTripPackImport(
      JSON.stringify({ ...pack, hotel: { ...pack.hotel, extra: "not allowed" } }),
      "trip-a",
    )).toMatchObject({ ok: false, code: "invalid_schema" });
  });

  it("persists a confirmed imported snapshot without requiring the network shell", async () => {
    const { cacheStorage } = createMemoryCacheStorage();
    const pack = createOfflineTripPack({
      tripId: "trip-import",
      itinerary: {},
      budgetLimit: 100_000,
      budgetItems: [],
      packingList: [],
    });

    const verified = await persistImportedOfflineTripPack({
      cacheStorage,
      pack,
      expectedTripId: "trip-import",
    });

    expect(verified).toEqual(pack);
    expect(await readOfflineTripPack(cacheStorage, "trip-import")).toEqual(pack);
  });

  it("refuses to write an imported snapshot for another trip", async () => {
    const { cacheStorage } = createMemoryCacheStorage();
    const pack = createOfflineTripPack({
      tripId: "trip-a",
      itinerary: {},
      budgetLimit: 100_000,
      budgetItems: [],
      packingList: [],
    });

    await expect(persistImportedOfflineTripPack({
      cacheStorage,
      pack,
      expectedTripId: "trip-b",
    })).rejects.toThrow("validation");
    expect(await readOfflineTripPack(cacheStorage, "trip-b")).toBeNull();
  });
});
