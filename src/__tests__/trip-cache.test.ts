import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_TRIP_SNAPSHOT,
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
      remoteUpdatedAt: 10,
      localUpdatedAt: 20,
      legacyMigration: false,
    });
    writeTripCache(localStorage, "trip B", {
      snapshot: snapshot("B 的餐廳"),
      dirtySlices: [],
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
});
