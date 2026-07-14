import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_TRIP_SNAPSHOT,
  migrateLegacyTripCache,
  mergeRemoteSnapshot,
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
    expect(JSON.parse(localStorage.getItem(tripCacheKey("trip-a")) || "{}").version).toBe(2);
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
});
