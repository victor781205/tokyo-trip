import { describe, it, expect } from "vitest";
import {
  currencyQuerySchema,
  mapInfoQuerySchema,
  flightInfoQuerySchema,
  isAllowedMapUrl,
} from "@/lib/validations";

describe("validations", () => {
  describe("currencyQuerySchema", () => {
    it("accepts empty input", () => {
      const result = currencyQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts valid base", () => {
      const result = currencyQuerySchema.safeParse({ base: "TWD" });
      expect(result.success).toBe(true);
    });

    it("accepts JPY base", () => {
      const result = currencyQuerySchema.safeParse({ base: "JPY" });
      expect(result.success).toBe(true);
    });

    it("rejects base that is too long", () => {
      const result = currencyQuerySchema.safeParse({ base: "A".repeat(20) });
      expect(result.success).toBe(false);
    });

    it("accepts mixed case base", () => {
      const result = currencyQuerySchema.safeParse({ base: "TwD" });
      expect(result.success).toBe(true);
    });
  });

  describe("flightInfoQuerySchema", () => {
    it("accepts empty input", () => {
      const result = flightInfoQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts valid flight number", () => {
      const result = flightInfoQuerySchema.safeParse({
        flight: "JX800",
        date: "2026-09-01",
        inboundDate: "2026-09-06",
      });
      expect(result.success).toBe(true);
    });

    it("rejects malformed travel dates", () => {
      const result = flightInfoQuerySchema.safeParse({ flight: "JX800", date: "09/01/2026" });
      expect(result.success).toBe(false);
    });

    it("rejects flight number that is too long", () => {
      const result = flightInfoQuerySchema.safeParse({ flight: "A".repeat(25) });
      expect(result.success).toBe(false);
    });
  });

  describe("mapInfoQuerySchema", () => {
    it("rejects missing url", () => {
      const result = mapInfoQuerySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects non-google maps url", () => {
      const result = mapInfoQuerySchema.safeParse({ url: "https://example.com" });
      expect(result.success).toBe(false);
    });

    it("rejects non-url strings", () => {
      const result = mapInfoQuerySchema.safeParse({ url: "not-a-url" });
      expect(result.success).toBe(false);
    });

    it("accepts valid google maps url", () => {
      const result = mapInfoQuerySchema.safeParse({
        url: "https://maps.google.com/maps/place/Test",
      });
      expect(result.success).toBe(true);
    });

    it("accepts www.google.com url", () => {
      const result = mapInfoQuerySchema.safeParse({
        url: "https://www.google.com/maps/@35.6762,139.6503",
      });
      expect(result.success).toBe(true);
    });

    it("accepts goo.gl url", () => {
      const result = mapInfoQuerySchema.safeParse({
        url: "https://goo.gl/maps/test123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts maps.app.goo.gl url", () => {
      const result = mapInfoQuerySchema.safeParse({
        url: "https://maps.app.goo.gl/abc123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects apple maps url", () => {
      const result = mapInfoQuerySchema.safeParse({
        url: "https://maps.apple.com/?ll=35.6762,139.6503",
      });
      expect(result.success).toBe(false);
    });

    it("rejects bing maps url", () => {
      const result = mapInfoQuerySchema.safeParse({
        url: "https://www.bing.com/maps?cp=35.6762~139.6503",
      });
      expect(result.success).toBe(false);
    });

    it("rejects www.google.com open-redirect style paths", () => {
      const result = mapInfoQuerySchema.safeParse({
        url: "https://www.google.com/url?q=https://evil.example",
      });
      expect(result.success).toBe(false);
      expect(isAllowedMapUrl("https://www.google.com/url?q=https://evil.example")).toBe(false);
    });

    it("rejects goo.gl non-maps paths", () => {
      expect(isAllowedMapUrl("https://goo.gl/evil")).toBe(false);
      const result = mapInfoQuerySchema.safeParse({ url: "https://goo.gl/evil" });
      expect(result.success).toBe(false);
    });

    it("rejects non-http protocols", () => {
      expect(isAllowedMapUrl("ftp://maps.google.com/maps")).toBe(false);
      expect(isAllowedMapUrl("javascript:alert(1)")).toBe(false);
    });
  });
});
