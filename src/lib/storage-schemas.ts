/**
 * localStorage 持久化資料的 zod schema
 *
 * TripContext 在 mount 時會 `JSON.parse` 5 個 slice。過去只包 try/catch 靜默
 * 吞例外，結構錯誤時會被當成有效 state 套到元件上導致畫面崩在 flux 中間態。
 * 這個檔案集中放每個 slice 的最小驗證 schema，parse 失敗就丟掉回到型別預設。
 *
 * 注意：欄位盡量 `.optional().default(...)` 而不是直接 `.optional()`，
 * 才不會讓下游元件需要到處判 undefined。但 id / 必填屬性仍用硬規格，
 * 確保不會被亂 schema 的舊資料偷偷帶進來。
 */

import { z } from "zod";

export const activitySchema = z.object({
  time: z.string().nullish().transform((val) => val ?? ""),
  name: z.string().nullish().transform((val) => val ?? ""),
  desc: z.string().nullish().transform((val) => val ?? ""),
  tag: z.string().nullish().transform((val) => val ?? ""),
});

export const dayPlanSchema = z.object({
  title: z.string().nullish().transform((val) => val ?? ""),
  date: z.string().nullish().transform((val) => val ?? ""),
  activities: z.array(activitySchema).nullish().transform((val) => val ?? []),
});

export const itinerarySchema = z.record(z.string(), dayPlanSchema);

export const budgetItemSchema = z.object({
  id: z.number(),
  name: z.string().nullish().transform((val) => val ?? ""),
  amount: z.number().nullish().transform((val) => val ?? 0),
  category: z.string().nullish().transform((val) => val ?? ""),
  date: z.string().nullish().transform((val) => val ?? ""),
});

export const budgetItemsSchema = z.array(budgetItemSchema);

export const budgetLimitSchema = z.number().nonnegative().finite();

export const customFoodSchema = z.object({
  id: z.number(),
  emoji: z.string().nullish().transform((val) => val ?? ""),
  name: z.string().nullish().transform((val) => val ?? ""),
  location: z.string().nullish().transform((val) => val ?? ""),
  hours: z.string().nullish().transform((val) => val ?? ""),
  desc: z.string().nullish().transform((val) => val ?? ""),
  mapLink: z.string().nullish().transform((val) => val ?? ""),
  image: z.string().nullish().transform((val) => val ?? ""),
  lat: z.number().nullish().transform((val) => val ?? undefined),
  lng: z.number().nullish().transform((val) => val ?? undefined),
});

export const customFoodsSchema = z.array(customFoodSchema);

export const packingItemSchema = z.object({
  id: z.string(),
  name: z.string().nullish().transform((val) => val ?? ""),
  packed: z.boolean().nullish().transform((val) => val ?? false),
  category: z.string().nullish().transform((val) => val ?? ""),
});

export const packingListSchema = z.array(packingItemSchema);

/**
 * 安全 parse helper：parse 失敗回 fallback，不拋例外。
 * 比每個呼叫點手寫 try/catch乾淨。
 */
export function safeParse<T>(
  schema: z.ZodType<T>,
  raw: string | null,
  fallback: T,
): T {
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}
