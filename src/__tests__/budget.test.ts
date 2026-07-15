import { describe, expect, it } from "vitest";
import {
  createBudgetItem,
  getBudgetDateForTripDay,
  getBudgetTripDayLabel,
  getTokyoBudgetDate,
  normalizeBudgetDate,
} from "@/lib/budget";

describe("budget data normalization", () => {
  it("normalizes legacy YYYY/M/D values and derives the day badge from the same date", () => {
    expect(normalizeBudgetDate("2026/9/2")).toBe("2026-09-02");
    expect(normalizeBudgetDate("2026.9.2")).toBe("2026-09-02");
    expect(getBudgetTripDayLabel("2026/9/2")).toBe("Day 2");
    expect(normalizeBudgetDate("2026/2/30")).toBeNull();
  });

  it("uses Tokyo's calendar day for newly scanned expenses", () => {
    expect(getTokyoBudgetDate(new Date("2026-08-31T16:30:00.000Z"))).toBe("2026-09-01");
    expect(getBudgetDateForTripDay(6)).toBe("2026-09-06");
    expect(getBudgetDateForTripDay(7)).toBeNull();
  });

  it("creates the shared expense schema with the established trip members", () => {
    expect(createBudgetItem({
      id: 42,
      name: "  晚餐  ",
      amount: "3600",
      category: "food",
      date: "2026/9/1",
    })).toEqual({
      id: 42,
      name: "晚餐",
      amount: 3600,
      category: "food",
      date: "2026-09-01",
      payer: "Victor",
      participants: ["Victor", "毓寧"],
    });

    expect(createBudgetItem({
      name: "無人分攤",
      amount: 100,
      category: "other",
      date: "2026-09-01",
      participants: [],
    })).toBeNull();
  });
});
