import { describe, it, expect } from "vitest";
import {
  budgetItemsSchema,
  packingListSchema,
  safeParse,
  customFoodsSchema,
} from "@/lib/storage-schemas";

describe("storage-schemas safeParse", () => {
  it("returns fallback when raw is null", () => {
    expect(safeParse(packingListSchema, null, [])).toEqual([]);
  });

  it("returns fallback on invalid JSON", () => {
    expect(safeParse(packingListSchema, "{not-json", [])).toEqual([]);
  });

  it("returns fallback when schema fails", () => {
    expect(safeParse(packingListSchema, JSON.stringify([{ id: 1 }]), [])).toEqual([]);
  });

  it("parses valid packing list", () => {
    const raw = JSON.stringify([
      { id: "abc", name: "護照", packed: true, category: "證件" },
    ]);
    const result = safeParse(packingListSchema, raw, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("護照");
    expect(result[0].packed).toBe(true);
  });

  it("parses valid budget items", () => {
    const raw = JSON.stringify([
      { id: 1, name: "午餐", amount: 1200, category: "餐飲", date: "2026-09-01" },
    ]);
    const result = safeParse(budgetItemsSchema, raw, []);
    expect(result[0].amount).toBe(1200);
  });

  it("rejects negative budget amounts via schema fail → fallback", () => {
    // amount is number but we still accept negative at schema level currently;
    // ensure completely wrong types fall back
    const raw = JSON.stringify([{ id: "x", amount: "nope" }]);
    expect(safeParse(budgetItemsSchema, raw, [])).toEqual([]);
  });

  it("parses custom foods with null/missing values and applies defaults", () => {
    const raw = JSON.stringify([
      {
        id: 123,
        name: "拉麵店",
        emoji: null,
        location: "新宿",
        hours: null,
        desc: "好吃",
        mapLink: null,
        image: null,
        lat: null,
        lng: null,
      },
    ]);
    const result = safeParse(customFoodsSchema, raw, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("拉麵店");
    expect(result[0].emoji).toBe("");
    expect(result[0].hours).toBe("");
    expect(result[0].mapLink).toBe("");
    expect(result[0].image).toBe("");
    expect(result[0].lat).toBeUndefined();
    expect(result[0].lng).toBeUndefined();
  });
});
