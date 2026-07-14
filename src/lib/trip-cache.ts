import { z } from "zod";
import {
  budgetItemsSchema,
  budgetLimitSchema,
  customFoodsSchema,
  itinerarySchema,
  packingListSchema,
  safeParse,
} from "@/lib/storage-schemas";

export const SYNC_SLICES = [
  "itinerary",
  "budgetLimit",
  "budgetItems",
  "customFoods",
  "packingList",
] as const;

export type SyncSlice = (typeof SYNC_SLICES)[number];

type CachedCustomFood = Omit<z.infer<typeof customFoodsSchema>[number], "lat" | "lng"> & {
  lat?: number;
  lng?: number;
};

export type TripSnapshot = {
  itinerary: z.infer<typeof itinerarySchema>;
  budgetLimit: z.infer<typeof budgetLimitSchema>;
  budgetItems: z.infer<typeof budgetItemsSchema>;
  customFoods: CachedCustomFood[];
  packingList: z.infer<typeof packingListSchema>;
};

export type TripCache = {
  snapshot: TripSnapshot;
  dirtySlices: SyncSlice[];
  /** Server-issued monotonic revision used for optimistic concurrency control. */
  remoteRevision: number;
  remoteUpdatedAt: number;
  localUpdatedAt: number;
  /** 舊版全域 key 尚未透過首次 revision-CAS 完成匯入。 */
  legacyMigration: boolean;
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;
type LegacyMigrationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const LEGACY_KEYS = {
  itinerary: "tokyoItinerary",
  budgetItems: "tokyoBudget",
  budgetLimit: "tokyoBudgetLimit",
  customFoods: "tokyoCustomFoods",
  packingList: "tokyoPackingList",
  updatedAt: "tokyoLocalUpdatedAt",
} as const;

const syncSliceSchema = z.enum(SYNC_SLICES);
const snapshotSchema = z.object({
  itinerary: itinerarySchema,
  budgetLimit: budgetLimitSchema,
  budgetItems: budgetItemsSchema,
  customFoods: customFoodsSchema,
  packingList: packingListSchema,
});
const cacheV1Schema = z.object({
  version: z.literal(1),
  snapshot: snapshotSchema,
  dirtySlices: z.array(syncSliceSchema).default([]),
  remoteUpdatedAt: z.number().nonnegative().finite().default(0),
  localUpdatedAt: z.number().nonnegative().finite().default(0),
  legacyMigration: z.boolean().default(false),
});
const cacheV2Schema = z.object({
  version: z.literal(2),
  snapshot: snapshotSchema,
  dirtySlices: z.array(syncSliceSchema).default([]),
  remoteRevision: z.number().int().nonnegative().finite().default(0),
  remoteUpdatedAt: z.number().nonnegative().finite().default(0),
  localUpdatedAt: z.number().nonnegative().finite().default(0),
  legacyMigration: z.boolean().default(false),
});

export const EMPTY_TRIP_SNAPSHOT: TripSnapshot = {
  itinerary: {},
  budgetLimit: 100000,
  budgetItems: [],
  customFoods: [],
  packingList: [],
};

export function tripCacheKey(tripId: string) {
  return `tokyoTripCache:${encodeURIComponent(tripId)}`;
}

function meaningfulSlices(snapshot: TripSnapshot): SyncSlice[] {
  const slices: SyncSlice[] = [];
  if (Object.keys(snapshot.itinerary).length > 0) slices.push("itinerary");
  if (snapshot.budgetLimit !== EMPTY_TRIP_SNAPSHOT.budgetLimit) slices.push("budgetLimit");
  if (snapshot.budgetItems.length > 0) slices.push("budgetItems");
  if (snapshot.customFoods.length > 0) slices.push("customFoods");
  if (snapshot.packingList.length > 0) slices.push("packingList");
  return slices;
}

function readLegacySnapshot(storage: StorageReader): TripSnapshot {
  return {
    itinerary: safeParse(itinerarySchema, storage.getItem(LEGACY_KEYS.itinerary), {}),
    budgetItems: safeParse(budgetItemsSchema, storage.getItem(LEGACY_KEYS.budgetItems), []),
    budgetLimit: safeParse(
      budgetLimitSchema,
      storage.getItem(LEGACY_KEYS.budgetLimit),
      EMPTY_TRIP_SNAPSHOT.budgetLimit,
    ),
    customFoods: safeParse(customFoodsSchema, storage.getItem(LEGACY_KEYS.customFoods), []),
    packingList: safeParse(packingListSchema, storage.getItem(LEGACY_KEYS.packingList), []),
  };
}

export function readTripCache(
  storage: StorageReader,
  tripId: string,
  { allowLegacy = false }: { allowLegacy?: boolean } = {},
): TripCache {
  const raw = storage.getItem(tripCacheKey(tripId));
  if (raw) {
    try {
      const value = JSON.parse(raw);
      const parsedV2 = cacheV2Schema.safeParse(value);
      if (parsedV2.success) {
        return {
          snapshot: parsedV2.data.snapshot,
          dirtySlices: [...new Set(parsedV2.data.dirtySlices)],
          remoteRevision: parsedV2.data.remoteRevision,
          remoteUpdatedAt: parsedV2.data.remoteUpdatedAt,
          localUpdatedAt: parsedV2.data.localUpdatedAt,
          legacyMigration: parsedV2.data.legacyMigration,
        };
      }
      // Version 1 caches predate CAS. They remain readable and start at revision 0,
      // forcing the first write to refetch/resolve a conflict instead of guessing.
      const parsedV1 = cacheV1Schema.safeParse(value);
      if (parsedV1.success) {
        return {
          snapshot: parsedV1.data.snapshot,
          dirtySlices: [...new Set(parsedV1.data.dirtySlices)],
          remoteRevision: 0,
          remoteUpdatedAt: parsedV1.data.remoteUpdatedAt,
          localUpdatedAt: parsedV1.data.localUpdatedAt,
          legacyMigration: parsedV1.data.legacyMigration,
        };
      }
    } catch {
      // Corrupt cache falls through to a safe empty/legacy snapshot.
    }
  }

  const snapshot = allowLegacy ? readLegacySnapshot(storage) : EMPTY_TRIP_SNAPSHOT;
  const dirtySlices = allowLegacy ? meaningfulSlices(snapshot) : [];
  const rawLegacyUpdatedAt = allowLegacy ? Number(storage.getItem(LEGACY_KEYS.updatedAt)) : 0;
  const legacyUpdatedAt = Number.isFinite(rawLegacyUpdatedAt) && rawLegacyUpdatedAt > 0
    ? rawLegacyUpdatedAt
    : 0;
  return {
    snapshot,
    dirtySlices,
    remoteRevision: 0,
    remoteUpdatedAt: 0,
    localUpdatedAt: dirtySlices.length > 0 ? legacyUpdatedAt : 0,
    legacyMigration: dirtySlices.length > 0,
  };
}

export function writeTripCache(
  storage: StorageWriter,
  tripId: string,
  cache: TripCache,
) {
  storage.setItem(tripCacheKey(tripId), JSON.stringify({
    version: 2,
    snapshot: cache.snapshot,
    dirtySlices: [...new Set(cache.dirtySlices)],
    remoteRevision: cache.remoteRevision,
    remoteUpdatedAt: cache.remoteUpdatedAt,
    localUpdatedAt: cache.localUpdatedAt,
    legacyMigration: cache.legacyMigration,
  }));
}

/**
 * Imports the pre-trip-scoped global cache exactly once.
 *
 * Cleanup deliberately happens only after the namespaced write succeeds. If
 * storage is full, the legacy data remains available for a later retry rather
 * than being destroyed halfway through migration.
 */
export function migrateLegacyTripCache(
  storage: LegacyMigrationStorage,
  tripId: string,
): TripCache {
  const cache = readTripCache(storage, tripId, { allowLegacy: true });
  writeTripCache(storage, tripId, cache);
  for (const key of Object.values(LEGACY_KEYS)) {
    storage.removeItem(key);
  }
  return cache;
}

function parseValue<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

export function remoteRecordToSnapshot(
  record: Record<string, unknown>,
  fallback: TripSnapshot = EMPTY_TRIP_SNAPSHOT,
): TripSnapshot {
  const parsedFoods = customFoodsSchema.safeParse(record.custom_foods);
  return {
    itinerary: parseValue(itinerarySchema, record.itinerary, fallback.itinerary),
    budgetLimit: parseValue(budgetLimitSchema, record.budget_limit, fallback.budgetLimit),
    budgetItems: parseValue(budgetItemsSchema, record.budget_items, fallback.budgetItems),
    customFoods: parsedFoods.success ? parsedFoods.data : fallback.customFoods,
    packingList: parseValue(packingListSchema, record.packing_list, fallback.packingList),
  };
}

export function mergeRemoteSnapshot(
  local: TripSnapshot,
  remote: TripSnapshot,
  dirtySlices: Iterable<SyncSlice>,
): TripSnapshot {
  const dirty = new Set(dirtySlices);
  return {
    itinerary: dirty.has("itinerary") ? local.itinerary : remote.itinerary,
    budgetLimit: dirty.has("budgetLimit") ? local.budgetLimit : remote.budgetLimit,
    budgetItems: dirty.has("budgetItems") ? local.budgetItems : remote.budgetItems,
    customFoods: dirty.has("customFoods") ? local.customFoods : remote.customFoods,
    packingList: dirty.has("packingList") ? local.packingList : remote.packingList,
  };
}
