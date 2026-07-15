import { z } from "zod";

export const currencyQuerySchema = z.object({
  base: z.string().max(10).optional(),
});

export const flightInfoQuerySchema = z.object({
  flight: z.string().max(20).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  inboundDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Google Maps URL allowlist（與 map-info route / Food 前端共用） */
export function isAllowedMapUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    // 常見分享短網址與完整 maps host
    if (
      host === "maps.google.com" ||
      host === "maps.app.goo.gl" ||
      host === "maps.google.co.jp" ||
      host === "google.com" ||
      host === "google.co.jp"
    ) {
      // google.com 根路徑必須是 /maps（避免 /url 跳板）
      if (host === "google.com" || host === "google.co.jp") {
        return parsed.pathname.startsWith("/maps");
      }
      return true;
    }
    // www.google.com / goo.gl 必須落在 /maps，避免 open-redirect 跳板
    if (
      (host === "www.google.com" || host === "www.google.co.jp") &&
      parsed.pathname.startsWith("/maps")
    ) {
      return true;
    }
    if (host === "goo.gl" && parsed.pathname.startsWith("/maps")) return true;
    return false;
  } catch {
    return false;
  }
}

/** 前端快速判斷：是否看起來像 Google Maps 連結（含常見貼上格式） */
export function looksLikeGoogleMapsUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  if (isAllowedMapUrl(value)) return true;
  // 使用者常貼不完整或帶空白的網址：用 host 關鍵字做寬鬆預檢
  return (
    /maps\.app\.goo\.gl/i.test(value) ||
    /(?:^|\/\/)(?:www\.)?google\.(?:com|co\.jp)\/maps/i.test(value) ||
    /(?:^|\/\/)maps\.google\./i.test(value) ||
    /goo\.gl\/maps\//i.test(value)
  );
}

export const mapInfoQuerySchema = z.object({
  url: z
    .string()
    .max(2048)
    .url()
    .refine((val) => isAllowedMapUrl(val), {
      message: "URL must be a Google Maps link",
    }),
});
