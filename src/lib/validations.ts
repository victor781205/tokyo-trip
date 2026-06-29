import { z } from "zod";

export const currencyQuerySchema = z.object({
  base: z.string().max(10).optional(),
});

export const flightInfoQuerySchema = z.object({
  flight: z.string().max(20).optional(),
});

export const mapInfoQuerySchema = z.object({
  url: z.string().url().refine(
    (val) => {
      try {
        const parsed = new URL(val);
        return (
          parsed.hostname === "maps.google.com" ||
          parsed.hostname === "www.google.com" ||
          parsed.hostname === "goo.gl" ||
          parsed.hostname === "maps.app.goo.gl"
        );
      } catch {
        return false;
      }
    },
    { message: "URL must be a Google Maps link" }
  ),
});
