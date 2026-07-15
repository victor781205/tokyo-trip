import { describe, it, expect } from "vitest";
import {
  generateSecureToken,
  generateShortId,
  generateTripId,
  generateTripSecret,
} from "@/lib/secure-id";

describe("secure-id", () => {
  it("generateSecureToken returns non-empty base64url-ish string", () => {
    const token = generateSecureToken(16);
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generateSecureToken produces unique values", () => {
    const a = generateSecureToken(16);
    const b = generateSecureToken(16);
    expect(a).not.toBe(b);
  });

  it("generateTripId has trip_ prefix", () => {
    const id = generateTripId();
    expect(id).toMatch(/^trip_[A-Za-z0-9_-]{22}$/);
  });

  it("generateTripSecret has sec_ prefix and higher entropy length", () => {
    const secret = generateTripSecret();
    expect(secret).toMatch(/^sec_[A-Za-z0-9_-]{32}$/);
  });

  it("generateShortId is shorter but still non-empty", () => {
    const id = generateShortId(8);
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects invalid entropy lengths", () => {
    expect(() => generateSecureToken(0)).toThrow(RangeError);
    expect(() => generateSecureToken(1.5)).toThrow(RangeError);
  });
});
