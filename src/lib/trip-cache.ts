import { z } from "zod";
import { activitySyncIdFromSource } from "@/lib/activity-identity";
import {
  defaultPackingItemId,
  isDefaultPackingEntry,
} from "@/lib/packing-defaults";
import {
  budgetItemsSchema,
  budgetLimitSchema,
  customFoodsSchema,
  foodStatusesSchema,
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
  "foodStatuses",
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
  foodStatuses: z.infer<typeof foodStatusesSchema>;
};

export type TripCache = {
  snapshot: TripSnapshot;
  /** Last server snapshot used as the common ancestor for three-way merges. */
  baseSnapshot: TripSnapshot;
  dirtySlices: SyncSlice[];
  /** Server-issued monotonic revision used for optimistic concurrency control. */
  remoteRevision: number;
  remoteUpdatedAt: number;
  localUpdatedAt: number;
  /** 舊版全域 key 尚未透過首次 revision-CAS 完成匯入。 */
  legacyMigration: boolean;
  /** Small local safety net; newest entry first and capped at 20. */
  history: TripRevision[];
};

export type TripRevision = {
  revision: number;
  savedAt: number;
  snapshot: TripSnapshot;
};

export type TripProfile = {
  tripId: string;
  tripSecret: string;
  label: string;
  lastUsedAt: number;
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
  foodStatuses: foodStatusesSchema.default({}),
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
const revisionSchema = z.object({
  revision: z.number().int().nonnegative().finite(),
  savedAt: z.number().nonnegative().finite(),
  snapshot: snapshotSchema,
});
const cacheV3Schema = z.object({
  version: z.literal(3),
  snapshot: snapshotSchema,
  baseSnapshot: snapshotSchema,
  dirtySlices: z.array(syncSliceSchema).default([]),
  remoteRevision: z.number().int().nonnegative().finite().default(0),
  remoteUpdatedAt: z.number().nonnegative().finite().default(0),
  localUpdatedAt: z.number().nonnegative().finite().default(0),
  legacyMigration: z.boolean().default(false),
  history: z.array(revisionSchema).max(20).default([]),
});

export const EMPTY_TRIP_SNAPSHOT: TripSnapshot = {
  itinerary: {},
  budgetLimit: 100000,
  budgetItems: [],
  customFoods: [],
  packingList: [],
  foodStatuses: {},
};

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableId(prefix: string, value: unknown) {
  return `${prefix}:${shortHash(JSON.stringify(value))}`;
}

function normalizePackingItems(items: TripSnapshot["packingList"]): TripSnapshot["packingList"] {
  const normalized: TripSnapshot["packingList"] = [];
  const defaultIndexes = new Map<string, number>();

  for (const item of items) {
    if (!isDefaultPackingEntry(item.category, item.name)) {
      normalized.push(item);
      continue;
    }

    const id = defaultPackingItemId(item.category, item.name);
    const existingIndex = defaultIndexes.get(id);
    if (existingIndex === undefined) {
      defaultIndexes.set(id, normalized.length);
      normalized.push({ ...item, id });
      continue;
    }

    const existing = normalized[existingIndex];
    normalized[existingIndex] = {
      ...existing,
      packed: existing.packed || item.packed,
    };
  }

  return normalized;
}

/** Backfill immutable activity identities for legacy/default itineraries. */
export function ensureStableItineraryActivityIds(
  itinerary: TripSnapshot["itinerary"],
): TripSnapshot["itinerary"] {
  return Object.fromEntries(Object.entries(itinerary).map(([dayKey, day]) => [
    dayKey,
    {
      ...day,
      activities: day.activities.map((activity, index) => ({
        ...activity,
        syncId: activity.sourceId
          ? activitySyncIdFromSource(activity.sourceId)
          : activity.syncId || stableId(`activity:${dayKey}:${index}`, {
            time: activity.time,
            name: activity.name,
          }),
      })),
    },
  ]));
}

/** Add immutable merge identities without invalidating legacy public ids. */
export function ensureStableEntityIds(snapshot: TripSnapshot): TripSnapshot {
  return {
    ...snapshot,
    itinerary: ensureStableItineraryActivityIds(snapshot.itinerary),
    budgetItems: snapshot.budgetItems.map((item) => ({
      ...item,
      syncId: item.syncId || `budget:${item.id}`,
    })),
    customFoods: snapshot.customFoods.map((item) => ({
      ...item,
      syncId: item.syncId || `food:${item.id}`,
    })),
    packingList: normalizePackingItems(snapshot.packingList),
  };
}

export function tripCacheKey(tripId: string) {
  return `tokyoTripCache:${encodeURIComponent(tripId)}`;
}

export const TRIP_PROFILE_INDEX_KEY = "tokyoTripProfiles:v1";

function cloneSnapshot(snapshot: TripSnapshot): TripSnapshot {
  return structuredClone(snapshot);
}

function legacyBaseSnapshot(snapshot: TripSnapshot, dirtySlices: Iterable<SyncSlice>) {
  const dirty = new Set(dirtySlices);
  return {
    itinerary: dirty.has("itinerary") ? EMPTY_TRIP_SNAPSHOT.itinerary : snapshot.itinerary,
    budgetLimit: dirty.has("budgetLimit") ? EMPTY_TRIP_SNAPSHOT.budgetLimit : snapshot.budgetLimit,
    budgetItems: dirty.has("budgetItems") ? EMPTY_TRIP_SNAPSHOT.budgetItems : snapshot.budgetItems,
    customFoods: dirty.has("customFoods") ? EMPTY_TRIP_SNAPSHOT.customFoods : snapshot.customFoods,
    packingList: dirty.has("packingList") ? EMPTY_TRIP_SNAPSHOT.packingList : snapshot.packingList,
    foodStatuses: dirty.has("foodStatuses") ? EMPTY_TRIP_SNAPSHOT.foodStatuses : snapshot.foodStatuses,
  };
}

function meaningfulSlices(snapshot: TripSnapshot): SyncSlice[] {
  const slices: SyncSlice[] = [];
  if (Object.keys(snapshot.itinerary).length > 0) slices.push("itinerary");
  if (snapshot.budgetLimit !== EMPTY_TRIP_SNAPSHOT.budgetLimit) slices.push("budgetLimit");
  if (snapshot.budgetItems.length > 0) slices.push("budgetItems");
  if (snapshot.customFoods.length > 0) slices.push("customFoods");
  if (snapshot.packingList.length > 0) slices.push("packingList");
  if (Object.keys(snapshot.foodStatuses).length > 0) slices.push("foodStatuses");
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
    foodStatuses: {},
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
      const parsedV3 = cacheV3Schema.safeParse(value);
      if (parsedV3.success) {
        return {
          snapshot: ensureStableEntityIds(parsedV3.data.snapshot),
          baseSnapshot: ensureStableEntityIds(parsedV3.data.baseSnapshot),
          dirtySlices: [...new Set(parsedV3.data.dirtySlices)],
          remoteRevision: parsedV3.data.remoteRevision,
          remoteUpdatedAt: parsedV3.data.remoteUpdatedAt,
          localUpdatedAt: parsedV3.data.localUpdatedAt,
          legacyMigration: parsedV3.data.legacyMigration,
          history: parsedV3.data.history.map((entry) => ({
            ...entry,
            snapshot: ensureStableEntityIds(entry.snapshot),
          })),
        };
      }
      const parsedV2 = cacheV2Schema.safeParse(value);
      if (parsedV2.success) {
        const snapshot = ensureStableEntityIds(parsedV2.data.snapshot);
        return {
          snapshot,
          baseSnapshot: legacyBaseSnapshot(snapshot, parsedV2.data.dirtySlices),
          dirtySlices: [...new Set(parsedV2.data.dirtySlices)],
          remoteRevision: parsedV2.data.remoteRevision,
          remoteUpdatedAt: parsedV2.data.remoteUpdatedAt,
          localUpdatedAt: parsedV2.data.localUpdatedAt,
          legacyMigration: parsedV2.data.legacyMigration,
          history: [],
        };
      }
      // Version 1 caches predate CAS. They remain readable and start at revision 0,
      // forcing the first write to refetch/resolve a conflict instead of guessing.
      const parsedV1 = cacheV1Schema.safeParse(value);
      if (parsedV1.success) {
        const snapshot = ensureStableEntityIds(parsedV1.data.snapshot);
        return {
          snapshot,
          baseSnapshot: legacyBaseSnapshot(snapshot, parsedV1.data.dirtySlices),
          dirtySlices: [...new Set(parsedV1.data.dirtySlices)],
          remoteRevision: 0,
          remoteUpdatedAt: parsedV1.data.remoteUpdatedAt,
          localUpdatedAt: parsedV1.data.localUpdatedAt,
          legacyMigration: parsedV1.data.legacyMigration,
          history: [],
        };
      }
    } catch {
      // Corrupt cache falls through to a safe empty/legacy snapshot.
    }
  }

  const snapshot = ensureStableEntityIds(
    allowLegacy ? readLegacySnapshot(storage) : EMPTY_TRIP_SNAPSHOT,
  );
  const dirtySlices = allowLegacy ? meaningfulSlices(snapshot) : [];
  const rawLegacyUpdatedAt = allowLegacy ? Number(storage.getItem(LEGACY_KEYS.updatedAt)) : 0;
  const legacyUpdatedAt = Number.isFinite(rawLegacyUpdatedAt) && rawLegacyUpdatedAt > 0
    ? rawLegacyUpdatedAt
    : 0;
  return {
    snapshot,
    baseSnapshot: legacyBaseSnapshot(snapshot, dirtySlices),
    dirtySlices,
    remoteRevision: 0,
    remoteUpdatedAt: 0,
    localUpdatedAt: dirtySlices.length > 0 ? legacyUpdatedAt : 0,
    legacyMigration: dirtySlices.length > 0,
    history: [],
  };
}

export function writeTripCache(
  storage: StorageWriter,
  tripId: string,
  cache: Omit<TripCache, "baseSnapshot" | "history"> &
    Partial<Pick<TripCache, "baseSnapshot" | "history">>,
) {
  storage.setItem(tripCacheKey(tripId), JSON.stringify({
    version: 3,
    snapshot: cache.snapshot,
    baseSnapshot: cache.baseSnapshot ?? legacyBaseSnapshot(cache.snapshot, cache.dirtySlices),
    dirtySlices: [...new Set(cache.dirtySlices)],
    remoteRevision: cache.remoteRevision,
    remoteUpdatedAt: cache.remoteUpdatedAt,
    localUpdatedAt: cache.localUpdatedAt,
    legacyMigration: cache.legacyMigration,
    history: (cache.history ?? []).slice(0, 20),
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

export type RemoteSnapshotParseResult =
  | { success: true; snapshot: TripSnapshot }
  | { success: false; invalidSlices: SyncSlice[] };

/** Strict remote validation: callers must never present malformed data as synced. */
export function parseRemoteRecordToSnapshot(
  record: Record<string, unknown>,
  fallback: TripSnapshot = EMPTY_TRIP_SNAPSHOT,
): RemoteSnapshotParseResult {
  const valueOrFallback = <T,>(value: unknown, fallbackValue: T) =>
    value === undefined ? fallbackValue : value;
  const parsed = {
    itinerary: itinerarySchema.safeParse(valueOrFallback(record.itinerary, fallback.itinerary)),
    budgetLimit: budgetLimitSchema.safeParse(valueOrFallback(record.budget_limit, fallback.budgetLimit)),
    budgetItems: budgetItemsSchema.safeParse(valueOrFallback(record.budget_items, fallback.budgetItems)),
    customFoods: customFoodsSchema.safeParse(valueOrFallback(record.custom_foods, fallback.customFoods)),
    packingList: packingListSchema.safeParse(valueOrFallback(record.packing_list, fallback.packingList)),
    foodStatuses: foodStatusesSchema.safeParse(valueOrFallback(record.food_statuses, fallback.foodStatuses)),
  };
  const invalidSlices = (Object.entries(parsed) as Array<[
    SyncSlice,
    { success: boolean }
  ]>)
    .filter(([, result]) => !result.success)
    .map(([slice]) => slice);
  if (invalidSlices.length > 0) return { success: false, invalidSlices };
  return {
    success: true,
    snapshot: ensureStableEntityIds({
      itinerary: parsed.itinerary.success ? parsed.itinerary.data : {},
      budgetLimit: parsed.budgetLimit.success ? parsed.budgetLimit.data : 100000,
      budgetItems: parsed.budgetItems.success ? parsed.budgetItems.data : [],
      customFoods: parsed.customFoods.success ? parsed.customFoods.data : [],
      packingList: parsed.packingList.success ? parsed.packingList.data : [],
      foodStatuses: parsed.foodStatuses.success ? parsed.foodStatuses.data : {},
    }),
  };
}

export function remoteRecordToSnapshot(
  record: Record<string, unknown>,
  fallback: TripSnapshot = EMPTY_TRIP_SNAPSHOT,
): TripSnapshot {
  const parsedFoods = customFoodsSchema.safeParse(record.custom_foods);
  return ensureStableEntityIds({
    itinerary: parseValue(itinerarySchema, record.itinerary, fallback.itinerary),
    budgetLimit: parseValue(budgetLimitSchema, record.budget_limit, fallback.budgetLimit),
    budgetItems: parseValue(budgetItemsSchema, record.budget_items, fallback.budgetItems),
    customFoods: parsedFoods.success ? parsedFoods.data : fallback.customFoods,
    packingList: parseValue(packingListSchema, record.packing_list, fallback.packingList),
    foodStatuses: parseValue(
      foodStatusesSchema,
      record.food_statuses ?? {},
      fallback.foodStatuses,
    ),
  });
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeObject<T extends Record<string, unknown>>(base: T, local: T, remote: T): T {
  const result: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const before = base[key];
    const ours = local[key];
    const theirs = remote[key];
    result[key] = same(ours, before) ? theirs : same(theirs, before) ? ours : ours;
  }
  return result as T;
}

function mergeEntityArray<T extends Record<string, unknown>>(
  base: T[],
  local: T[],
  remote: T[],
  keyOf: (item: T) => string,
  cloneCollision: (item: T, collisionKey: string) => T,
): T[] {
  const baseMap = new Map(base.map((item) => [keyOf(item), item]));
  const localMap = new Map(local.map((item) => [keyOf(item), item]));
  const remoteMap = new Map(remote.map((item) => [keyOf(item), item]));
  const order = [...local.map(keyOf), ...remote.map(keyOf)].filter(
    (key, index, all) => all.indexOf(key) === index,
  );
  const merged: T[] = [];

  for (const key of order) {
    const before = baseMap.get(key);
    const ours = localMap.get(key);
    const theirs = remoteMap.get(key);
    if (same(ours, before)) {
      if (theirs) merged.push(theirs);
      continue;
    }
    if (same(theirs, before) || same(ours, theirs)) {
      if (ours) merged.push(ours);
      continue;
    }
    // Concurrent delete vs edit: retain the edited entity. A deletion against
    // an unchanged ancestor is handled by the equality branches above.
    if (!ours && theirs) {
      merged.push(theirs);
      continue;
    }
    if (ours && !theirs) {
      merged.push(ours);
      continue;
    }
    if (!ours || !theirs) continue;
    if (!before) {
      // Extremely rare same-id concurrent additions must remain two entries.
      merged.push(ours, cloneCollision(theirs, key));
    } else {
      merged.push(mergeObject(before, ours, theirs));
    }
  }
  return merged;
}

type ItineraryActivity = TripSnapshot["itinerary"][string]["activities"][number];
type SourcedActivityPlacement = { dayKey: string; activity: ItineraryActivity };

function sourcedActivityKey(activity: ItineraryActivity) {
  return activity.sourceId ? activitySyncIdFromSource(activity.sourceId) : undefined;
}

function compareSourcedPlacements(
  left: SourcedActivityPlacement,
  right: SourcedActivityPlacement,
) {
  const leftKey = JSON.stringify([left.dayKey, left.activity.time, left.activity]);
  const rightKey = JSON.stringify([right.dayKey, right.activity.time, right.activity]);
  return leftKey.localeCompare(rightKey, "en", { numeric: true });
}

/** Collapse historical same-source duplicates inside one snapshot deterministically. */
function collectSourcedActivityPlacements(itinerary: TripSnapshot["itinerary"]) {
  const placements = new Map<string, SourcedActivityPlacement>();
  for (const [dayKey, day] of Object.entries(itinerary)) {
    for (const activity of day.activities) {
      const sourceKey = sourcedActivityKey(activity);
      if (!sourceKey) continue;
      const candidate = { dayKey, activity };
      const current = placements.get(sourceKey);
      if (!current || compareSourcedPlacements(candidate, current) < 0) {
        placements.set(sourceKey, candidate);
      }
    }
  }
  return placements;
}

function chooseSourcedActivityPlacement(
  before: SourcedActivityPlacement | undefined,
  ours: SourcedActivityPlacement | undefined,
  theirs: SourcedActivityPlacement | undefined,
) {
  if (same(ours, before)) return theirs;
  if (same(theirs, before) || same(ours, theirs)) return ours;

  // A concurrent edit or move is retained over a deletion. Deleting an
  // unchanged ancestor was already handled by the equality branches above.
  if (!ours && theirs) return theirs;
  if (ours && !theirs) return ours;
  if (!ours || !theirs) return undefined;

  // Both devices changed the same source differently. This symmetric tie
  // break means swapping local/remote still chooses the exact same placement.
  return compareSourcedPlacements(ours, theirs) <= 0 ? ours : theirs;
}

function reconcileSourcedActivities(
  base: TripSnapshot["itinerary"],
  local: TripSnapshot["itinerary"],
  remote: TripSnapshot["itinerary"],
  merged: TripSnapshot["itinerary"],
) {
  const basePlacements = collectSourcedActivityPlacements(base);
  const localPlacements = collectSourcedActivityPlacements(local);
  const remotePlacements = collectSourcedActivityPlacements(remote);
  const sourceKeys = new Set([
    ...basePlacements.keys(),
    ...localPlacements.keys(),
    ...remotePlacements.keys(),
  ]);

  for (const sourceKey of sourceKeys) {
    const chosen = chooseSourcedActivityPlacement(
      basePlacements.get(sourceKey),
      localPlacements.get(sourceKey),
      remotePlacements.get(sourceKey),
    );

    for (const [dayKey, day] of Object.entries(merged)) {
      const activities = day.activities.filter(
        (activity) => sourcedActivityKey(activity) !== sourceKey,
      );
      if (activities.length !== day.activities.length) {
        merged[dayKey] = { ...day, activities };
      }
    }

    if (!chosen) continue;
    const fallbackDay = local[chosen.dayKey] ?? remote[chosen.dayKey] ?? base[chosen.dayKey];
    const targetDay = merged[chosen.dayKey] ?? {
      title: fallbackDay?.title ?? "",
      date: fallbackDay?.date ?? "",
      activities: [],
    };
    const activity = {
      ...chosen.activity,
      syncId: activitySyncIdFromSource(chosen.activity.sourceId!),
    };
    merged[chosen.dayKey] = {
      ...targetDay,
      activities: [...targetDay.activities, activity].sort((left, right) => (
        left.time.localeCompare(right.time, "zh-TW", { numeric: true })
      )),
    };
  }

  return merged;
}

function mergeItinerary(
  base: TripSnapshot["itinerary"],
  local: TripSnapshot["itinerary"],
  remote: TripSnapshot["itinerary"],
) {
  const merged: TripSnapshot["itinerary"] = {};
  const dayKeys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const dayKey of dayKeys) {
    const before = base[dayKey];
    const ours = local[dayKey];
    const theirs = remote[dayKey];
    if (same(ours, before)) {
      if (theirs) merged[dayKey] = theirs;
      continue;
    }
    if (same(theirs, before) || same(ours, theirs)) {
      if (ours) merged[dayKey] = ours;
      continue;
    }
    if (!ours && theirs) {
      merged[dayKey] = theirs;
      continue;
    }
    if (ours && !theirs) {
      merged[dayKey] = ours;
      continue;
    }
    if (!ours || !theirs) continue;
    const baseDay = before ?? { title: "", date: "", activities: [] };
    merged[dayKey] = {
      title: same(ours.title, baseDay.title) ? theirs.title : ours.title,
      date: same(ours.date, baseDay.date) ? theirs.date : ours.date,
      activities: mergeEntityArray(
        baseDay.activities,
        ours.activities,
        theirs.activities,
        (item) => item.syncId || stableId(`activity:${dayKey}`, item),
        (item, key) => ({ ...item, syncId: `${key}:conflict:${shortHash(JSON.stringify(item))}` }),
      ),
    };
  }
  return reconcileSourcedActivities(base, local, remote, merged);
}

function mergeRecord<T extends string>(
  base: Record<string, T>,
  local: Record<string, T>,
  remote: Record<string, T>,
) {
  const merged: Record<string, T> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const before = base[key];
    const ours = local[key];
    const theirs = remote[key];
    const value = same(ours, before) ? theirs : same(theirs, before) ? ours : ours;
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/** Three-way, entity-aware merge used after a revision CAS conflict. */
export function mergeSnapshotsThreeWay(
  baseInput: TripSnapshot,
  localInput: TripSnapshot,
  remoteInput: TripSnapshot,
  dirtySlices: Iterable<SyncSlice>,
): TripSnapshot {
  const dirty = new Set(dirtySlices);
  const base = ensureStableEntityIds(baseInput);
  const local = ensureStableEntityIds(localInput);
  const remote = ensureStableEntityIds(remoteInput);
  const chooseScalar = <T,>(slice: SyncSlice, before: T, ours: T, theirs: T) => {
    if (!dirty.has(slice)) return theirs;
    if (same(ours, before)) return theirs;
    if (same(theirs, before)) return ours;
    return ours;
  };
  return {
    itinerary: dirty.has("itinerary")
      ? mergeItinerary(base.itinerary, local.itinerary, remote.itinerary)
      : remote.itinerary,
    budgetLimit: chooseScalar(
      "budgetLimit",
      base.budgetLimit,
      local.budgetLimit,
      remote.budgetLimit,
    ),
    budgetItems: dirty.has("budgetItems")
      ? mergeEntityArray(
        base.budgetItems,
        local.budgetItems,
        remote.budgetItems,
        (item) => item.syncId || `budget:${item.id}`,
        (item, key) => {
          const hash = Number.parseInt(shortHash(JSON.stringify(item)), 36);
          const id = Number.isSafeInteger(hash) ? 2_000_000_000_000 + hash : item.id + 1;
          return { ...item, id, syncId: `${key}:conflict:${shortHash(JSON.stringify(item))}` };
        },
      )
      : remote.budgetItems,
    customFoods: dirty.has("customFoods")
      ? mergeEntityArray(
        base.customFoods,
        local.customFoods,
        remote.customFoods,
        (item) => item.syncId || `food:${item.id}`,
        (item, key) => {
          const hash = Number.parseInt(shortHash(JSON.stringify(item)), 36);
          const id = Number.isSafeInteger(hash) ? 3_000_000_000_000 + hash : item.id + 1;
          return { ...item, id, syncId: `${key}:conflict:${shortHash(JSON.stringify(item))}` };
        },
      )
      : remote.customFoods,
    packingList: dirty.has("packingList")
      ? mergeEntityArray(
        base.packingList,
        local.packingList,
        remote.packingList,
        (item) => item.id,
        (item, key) => ({ ...item, id: `${key}-conflict-${shortHash(JSON.stringify(item))}` }),
      )
      : remote.packingList,
    foodStatuses: dirty.has("foodStatuses")
      ? mergeRecord(base.foodStatuses, local.foodStatuses, remote.foodStatuses)
      : remote.foodStatuses,
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
    foodStatuses: dirty.has("foodStatuses") ? local.foodStatuses : remote.foodStatuses,
  };
}

export function addRevisionToHistory(
  history: TripRevision[],
  revision: number,
  savedAt: number,
  snapshot: TripSnapshot,
): TripRevision[] {
  if (!Number.isSafeInteger(revision) || revision < 0) return history.slice(0, 20);
  const next = [
    { revision, savedAt, snapshot: cloneSnapshot(ensureStableEntityIds(snapshot)) },
    ...history.filter((entry) => entry.revision !== revision),
  ];
  return next.slice(0, 20);
}

export function readTripProfiles(storage: StorageReader): TripProfile[] {
  try {
    const raw = storage.getItem(TRIP_PROFILE_INDEX_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is TripProfile => Boolean(
      item && typeof item === "object"
      && typeof item.tripId === "string" && item.tripId.trim()
      && typeof item.tripSecret === "string" && item.tripSecret.trim()
      && typeof item.label === "string"
      && Number.isFinite(item.lastUsedAt),
    )).sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, 10);
  } catch {
    return [];
  }
}

export function upsertTripProfile(storage: StorageWriter & StorageReader, profile: TripProfile) {
  const profiles = readTripProfiles(storage).filter((item) => item.tripId !== profile.tripId);
  storage.setItem(TRIP_PROFILE_INDEX_KEY, JSON.stringify([profile, ...profiles].slice(0, 10)));
}
