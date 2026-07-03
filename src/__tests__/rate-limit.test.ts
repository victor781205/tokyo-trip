import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("rate-limit", () => {
  it("allows requests within limit", () => {
    const result = checkRateLimit("test-key-1", 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("blocks requests exceeding limit", () => {
    const id = "test-block-" + Date.now();
    checkRateLimit(id, 2, 60_000);
    checkRateLimit(id, 2, 60_000);
    const result = checkRateLimit(id, 2, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("resets after window expires", () => {
    const id = "test-reset-" + Date.now();
    checkRateLimit(id, 1, 1);
    const blocked = checkRateLimit(id, 1, 1);
    expect(blocked.allowed).toBe(false);
  });

  it("tracks different identifiers independently", () => {
    const a = checkRateLimit("id-a-" + Date.now(), 1, 60_000);
    const b = checkRateLimit("id-b-" + Date.now(), 1, 60_000);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});
