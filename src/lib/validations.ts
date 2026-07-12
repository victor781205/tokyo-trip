import { z } from "zod";

export const currencyQuerySchema = z.object({
  base: z.string().max(10).optional(),
});

export const flightInfoQuerySchema = z.object({
  flight: z.string().max(20).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  inboundDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Google Maps URL allowlist（與 map-info route 共用邏輯） */
export function isAllowedMapUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname;
    if (host === "maps.google.com" || host === "maps.app.goo.gl") return true;
    // www.google.com / goo.gl 必須落在 /maps，避免 open-redirect 跳板
    if (host === "www.google.com" && parsed.pathname.startsWith("/maps")) return true;
    if (host === "goo.gl" && parsed.pathname.startsWith("/maps")) return true;
    return false;
  } catch {
    return false;
  }
}

export const mapInfoQuerySchema = z.object({
  url: z
    .string()
    .url()
    .refine((val) => isAllowedMapUrl(val), {
      message: "URL must be a Google Maps link",
    }),
});
