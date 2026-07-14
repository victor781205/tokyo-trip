import { describe, expect, it } from "vitest";
import { DISTRICT_FILTERS, RECOMMENDED_FOODS } from "@/components/Food";

describe("verified restaurant data", () => {
  const allFoods = Object.values(RECOMMENDED_FOODS).flat();

  it("uses the current Akihabara Mansei location instead of the closed meat building", () => {
    const item = RECOMMENDED_FOODS.yakiniku.find((food) => food.name.includes("万世"));
    expect(item).toMatchObject({
      name: "焼肉の万世 秋葉原店",
      loc: "秋葉原",
      lat: 35.6973025,
      lng: 139.7714744,
      officialUrl: "https://akiba.or.jp/store/s237",
    });
    expect(JSON.stringify(RECOMMENDED_FOODS)).not.toContain("整棟都是肉料理");
  });

  it("binds the Shibuya Midori entry to Shibuya rather than Umegaoka", () => {
    expect(RECOMMENDED_FOODS.sushi).toContainEqual(
      expect.objectContaining({
        name: "梅丘寿司の美登利 渋谷店",
        loc: "澀谷",
        lat: 35.6583453,
        lng: 139.6967988,
      }),
    );
  });

  it("identifies the intended Ueno Imahan branch precisely", () => {
    expect(RECOMMENDED_FOODS.yakiniku).toContainEqual(
      expect.objectContaining({
        name: "人形町今半 上野広小路店",
        loc: "上野",
        lat: 35.707469,
        lng: 139.772691,
        officialUrl: "https://restaurant.imahan.com/ueno/",
      }),
    );
  });

  it("does not publish volatile hard-coded ratings or unverifiable shops", () => {
    expect(allFoods.every((food) => !("star" in food) && !("reviews" in food))).toBe(true);
    expect(allFoods.some((food) => food.name.includes("薩摩牛"))).toBe(false);
    expect(allFoods.some((food) => food.name.includes("阿美橫丁 鐵火丼"))).toBe(false);
  });

  it("offers a district filter for every curated restaurant", () => {
    const districtIds = new Set(DISTRICT_FILTERS.map((district) => district.id));
    expect([...new Set(allFoods.map((food) => food.loc))].filter((loc) => !districtIds.has(loc)))
      .toEqual([]);
  });

  it("uses the verified current coordinates for recently moved or corrected shops", () => {
    expect(allFoods.find((food) => food.name === "すしざんまい 錦糸町店")).toMatchObject({
      lat: 35.6948712,
      lng: 139.8148557,
    });
    expect(allFoods.find((food) => food.name === "鳥錦 錦糸町総本店")).toMatchObject({
      lat: 35.6988782,
      lng: 139.8134977,
    });
    expect(allFoods.find((food) => food.name.startsWith("LUKE’S LOBSTER"))).toMatchObject({
      lat: 35.665437,
      lng: 139.70449,
    });
    expect(allFoods.find((food) => food.name.startsWith("T’sたんたん"))).toMatchObject({
      lat: 35.681252,
      lng: 139.767242,
    });
  });
});
