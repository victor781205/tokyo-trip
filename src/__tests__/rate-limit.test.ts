import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  checkRateLimit,
  getRateLimitStoreSizeForTests,
  RATE_LIMIT_MAX_ENTRIES,
  resetRateLimitStoreForTests,
} from "@/lib/rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    resetRateLimitStoreForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRateLimitStoreForTests();
  });

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T00:00:00.000Z"));
    const id = "test-reset";
    checkRateLimit(id, 1, 1_000);
    const blocked = checkRateLimit(id, 1, 1_000);
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(1_000);
    expect(checkRateLimit(id, 1, 1_000)).toEqual({ allowed: true, remaining: 0 });
  });

  it("tracks different identifiers independently", () => {
    const a = checkRateLimit("id-a-" + Date.now(), 1, 60_000);
    const b = checkRateLimit("id-b-" + Date.now(), 1, 60_000);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("enforces a true hard capacity under identifier flooding", () => {
    for (let index = 0; index < RATE_LIMIT_MAX_ENTRIES + 250; index++) {
      checkRateLimit(`flood-${index}`, 1, 60_000);
    }

    expect(getRateLimitStoreSizeForTests()).toBe(RATE_LIMIT_MAX_ENTRIES);
  });

  it("bounds attacker-controlled identifier length", () => {
    const sharedPrefix = "x".repeat(256);
    expect(checkRateLimit(`${sharedPrefix}-one`, 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit(`${sharedPrefix}-two`, 1, 60_000).allowed).toBe(false);
    expect(getRateLimitStoreSizeForTests()).toBe(1);
  });

  it("fails closed on invalid limiter configuration", () => {
    expect(() => checkRateLimit("invalid", 0, 60_000)).toThrow(RangeError);
    expect(() => checkRateLimit("invalid", 1, 0)).toThrow(RangeError);
  });
});
