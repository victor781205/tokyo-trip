import { beforeEach, describe, expect, it } from "vitest";
import { activitySyncIdFromSource } from "@/lib/activity-identity";
import { defaultPackingItemId } from "@/lib/packing-defaults";
import {
  EMPTY_TRIP_SNAPSHOT,
  migrateLegacyTripCache,
  mergeRemoteSnapshot,
  mergeSnapshotsThreeWay,
  readTripCache,
  tripCacheKey,
  writeTripCache,
  type TripSnapshot,
} from "@/lib/trip-cache";

function snapshot(name: string): TripSnapshot {
  return {
    ...EMPTY_TRIP_SNAPSHOT,
    customFoods: [{
      id: 1,
      emoji: "🍜",
      name,
      location: "東京",
      hours: "",
      desc: "",
      mapLink: "",
      image: "",
    }],
  };
}

describe("trip-scoped cache", () => {
  beforeEach(() => localStorage.clear());

  it("keeps different trip IDs isolated", () => {
    writeTripCache(localStorage, "trip A", {
      snapshot: snapshot("A 的餐廳"),
      dirtySlices: ["customFoods"],
      remoteRevision: 1,
      remoteUpdatedAt: 10,
      localUpdatedAt: 20,
      legacyMigration: false,
    });
    writeTripCache(localStorage, "trip B", {
      snapshot: snapshot("B 的餐廳"),
      dirtySlices: [],
      remoteRevision: 2,
      remoteUpdatedAt: 30,
      localUpdatedAt: 0,
      legacyMigration: false,
    });

    expect(readTripCache(localStorage, "trip A").snapshot.customFoods[0].name).toBe("A 的餐廳");
    expect(readTripCache(localStorage, "trip B").snapshot.customFoods[0].name).toBe("B 的餐廳");
    expect(tripCacheKey("trip A")).not.toBe(tripCacheKey("trip B"));
  });

  it("keeps only dirty local slices while accepting clean remote slices", () => {
    const local: TripSnapshot = {
      ...snapshot("離線新增餐廳"),
      budgetLimit: 80_000,
      budgetItems: [],
    };
    const remote: TripSnapshot = {
      ...snapshot("遠端餐廳"),
      budgetLimit: 120_000,
      budgetItems: [{ id: 9, name: "車票", amount: 500, category: "交通", date: "2026-07-11" }],
    };

    const merged = mergeRemoteSnapshot(local, remote, ["customFoods"]);

    expect(merged.customFoods[0].name).toBe("離線新增餐廳");
    expect(merged.budgetLimit).toBe(120_000);
    expect(merged.budgetItems[0].name).toBe("車票");
  });

  it("does not migrate another trip's legacy global data from a share link", () => {
    localStorage.setItem("tokyoCustomFoods", JSON.stringify(snapshot("舊行程").customFoods));

    expect(readTripCache(localStorage, "shared-trip").snapshot.customFoods).toEqual([]);
    expect(readTripCache(localStorage, "current-trip", { allowLegacy: true }).snapshot.customFoods[0].name)
      .toBe("舊行程");
  });

  it("moves legacy globals into one namespaced cache and removes every legacy key", () => {
    localStorage.setItem("tokyoCustomFoods", JSON.stringify(snapshot("只屬於 A").customFoods));
    localStorage.setItem("tokyoBudgetLimit", "80000");
    localStorage.setItem("tokyoLocalUpdatedAt", "1234");

    const migrated = migrateLegacyTripCache(localStorage, "trip-a");

    expect(migrated.snapshot.customFoods[0].name).toBe("只屬於 A");
    expect(migrated.dirtySlices).toEqual(expect.arrayContaining(["customFoods", "budgetLimit"]));
    expect(JSON.parse(localStorage.getItem(tripCacheKey("trip-a")) || "{}").version).toBe(3);
    expect(localStorage.getItem("tokyoCustomFoods")).toBeNull();
    expect(localStorage.getItem("tokyoBudgetLimit")).toBeNull();
    expect(localStorage.getItem("tokyoLocalUpdatedAt")).toBeNull();

    // A second trip can no longer inherit A's old global snapshot.
    expect(migrateLegacyTripCache(localStorage, "trip-b").snapshot.customFoods).toEqual([]);
  });

  it("keeps legacy data when the namespaced write fails", () => {
    const values = new Map<string, string>([
      ["tokyoCustomFoods", JSON.stringify(snapshot("不可遺失").customFoods)],
      ["tokyoLocalUpdatedAt", "1234"],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
      removeItem: (key: string) => { values.delete(key); },
    };

    expect(() => migrateLegacyTripCache(storage, "trip-a")).toThrow(/quota/);
    expect(values.has("tokyoCustomFoods")).toBe(true);
    expect(values.has("tokyoLocalUpdatedAt")).toBe(true);
  });

  it("reads version 1 caches as revision zero for a safe first CAS", () => {
    localStorage.setItem(tripCacheKey("legacy-v1"), JSON.stringify({
      version: 1,
      snapshot: snapshot("舊版 namespaced cache"),
      dirtySlices: ["customFoods"],
      remoteUpdatedAt: 99,
      localUpdatedAt: 100,
      legacyMigration: false,
    }));

    expect(readTripCache(localStorage, "legacy-v1")).toMatchObject({
      remoteRevision: 0,
      remoteUpdatedAt: 99,
      dirtySlices: ["customFoods"],
    });
  });

  it("merges concurrent additions inside the same array slice without losing either device", () => {
    const base: TripSnapshot = { ...EMPTY_TRIP_SNAPSHOT, budgetItems: [] };
    const local: TripSnapshot = {
      ...base,
      budgetItems: [{ id: 101, syncId: "budget:a", name: "A 車票", amount: 100, category: "交通", date: "" }],
    };
    const remote: TripSnapshot = {
      ...base,
      budgetItems: [{ id: 202, syncId: "budget:b", name: "B 晚餐", amount: 200, category: "餐飲", date: "" }],
    };

    const merged = mergeSnapshotsThreeWay(base, local, remote, ["budgetItems"]);

    expect(merged.budgetItems.map((item) => item.name)).toEqual(["A 車票", "B 晚餐"]);
  });

  it("keeps an edit when the other device is unchanged and preserves a real deletion", () => {
    const item = { id: "pack-1", name: "護照", packed: false, category: "文件" };
    const base: TripSnapshot = { ...EMPTY_TRIP_SNAPSHOT, packingList: [item] };
    const edited = mergeSnapshotsThreeWay(
      base,
      { ...base, packingList: [{ ...item, packed: true }] },
      base,
      ["packingList"],
    );
    const deleted = mergeSnapshotsThreeWay(
      base,
      { ...base, packingList: [] },
      base,
      ["packingList"],
    );

    expect(edited.packingList[0].packed).toBe(true);
    expect(deleted.packingList).toEqual([]);
  });

  it("converges concurrent same-source schedules to one activity across different days", () => {
    const sourceId = "food:recommended:ramen:shibuya";
    const emptyDay = (title: string) => ({ title, date: "9/1", activities: [] });
    const base: TripSnapshot = {
      ...EMPTY_TRIP_SNAPSHOT,
      itinerary: { day1: emptyDay("Day 1"), day3: emptyDay("Day 3") },
    };
    const local: TripSnapshot = {
      ...base,
      itinerary: {
        ...base.itinerary,
        day3: {
          ...base.itinerary.day3,
          activities: [{
            syncId: "legacy-location-id",
            sourceId,
            time: "18:00",
            name: "用餐：拉麵",
            desc: "澀谷",
            tag: "美食",
          }],
        },
      },
    };
    const remote: TripSnapshot = {
      ...base,
      itinerary: {
        ...base.itinerary,
        day1: {
          ...base.itinerary.day1,
          activities: [{
            sourceId,
            time: "12:00",
            name: "用餐：拉麵",
            desc: "澀谷",
            tag: "美食",
          }],
        },
      },
    };

    const merged = mergeSnapshotsThreeWay(base, local, remote, ["itinerary"]);
    const reversed = mergeSnapshotsThreeWay(base, remote, local, ["itinerary"]);
    const placements = Object.entries(merged.itinerary).flatMap(([dayKey, day]) => (
      day.activities.filter((activity) => activity.sourceId === sourceId).map((activity) => ({ dayKey, activity }))
    ));

    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({
      dayKey: "day1",
      activity: { syncId: activitySyncIdFromSource(sourceId), time: "12:00" },
    });
    expect(reversed.itinerary).toEqual(merged.itinerary);
  });

  it("deduplicates concurrent same-day additions that share a sourceId", () => {
    const sourceId = "food:recommended:sushi:ginza";
    const base: TripSnapshot = {
      ...EMPTY_TRIP_SNAPSHOT,
      itinerary: { day2: { title: "Day 2", date: "9/2", activities: [] } },
    };
    const activity = {
      sourceId,
      name: "用餐：壽司",
      desc: "銀座",
      tag: "美食",
    };
    const local: TripSnapshot = {
      ...base,
      itinerary: { day2: { ...base.itinerary.day2, activities: [{ ...activity, time: "19:00" }] } },
    };
    const remote: TripSnapshot = {
      ...base,
      itinerary: { day2: { ...base.itinerary.day2, activities: [{ ...activity, time: "12:00" }] } },
    };

    const merged = mergeSnapshotsThreeWay(base, local, remote, ["itinerary"]);
    const reversed = mergeSnapshotsThreeWay(base, remote, local, ["itinerary"]);

    expect(merged.itinerary.day2.activities).toHaveLength(1);
    expect(merged.itinerary.day2.activities[0]).toMatchObject({
      sourceId,
      syncId: activitySyncIdFromSource(sourceId),
      time: "12:00",
    });
    expect(reversed.itinerary).toEqual(merged.itinerary);
  });

  it("canonicalizes historical default packing ids without collapsing custom items", () => {
    const passport = { name: "護照", packed: false, category: "證件" };
    const base: TripSnapshot = {
      ...EMPTY_TRIP_SNAPSHOT,
      packingList: [{ id: "old-random-base", ...passport }],
    };
    const local: TripSnapshot = {
      ...base,
      packingList: [
        { id: "old-random-local-a", ...passport },
        { id: "old-random-local-b", ...passport, packed: true },
        { id: "custom-a", name: "Victor 的自訂物品", packed: false, category: "其他" },
      ],
    };
    const remote: TripSnapshot = {
      ...base,
      packingList: [
        { id: "old-random-remote", ...passport },
        { id: "custom-b", name: "Victor 的自訂物品", packed: true, category: "其他" },
      ],
    };

    const merged = mergeSnapshotsThreeWay(base, local, remote, ["packingList"]);
    const passports = merged.packingList.filter(
      (item) => item.category === "證件" && item.name === "護照",
    );

    expect(passports).toEqual([{
      id: defaultPackingItemId("證件", "護照"),
      name: "護照",
      packed: true,
      category: "證件",
    }]);
    expect(merged.packingList.filter((item) => item.name === "Victor 的自訂物品"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "custom-a" }),
        expect.objectContaining({ id: "custom-b" }),
      ]));
  });

  it("merges food recommendation states by key", () => {
    const base: TripSnapshot = { ...EMPTY_TRIP_SNAPSHOT, foodStatuses: {} };
    const merged = mergeSnapshotsThreeWay(
      base,
      { ...base, foodStatuses: { ramen: "wishlist" } },
      { ...base, foodStatuses: { sushi: "visited" } },
      ["foodStatuses"],
    );

    expect(merged.foodStatuses).toEqual({ ramen: "wishlist", sushi: "visited" });
  });
});
