// 注意：此 rate-limiter 使用行程內記憶體 Map。
// - 在 Node.js runtime（單一常駐 process）下，可提供「process sticky」限流，
//   同一 IP 連到同一 process 時有效；跨 process 不共享。
// - 在 Edge runtime 下，每個請求可能在不同 isolate，限流效果幾乎為零。
// 若要真正跨 process / 跨部署的限流，請改用 Vercel KV / Upstash Redis /
// @upstash/ratelimit 等外部儲存（需額外整合與成本）。
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// 固定批次漸進清掃，避免某一個 request 一次 O(n) 掃完整張表。
const CLEANUP_BATCH_SIZE = 64;
const MAX_IDENTIFIER_LENGTH = 256;
export const RATE_LIMIT_MAX_ENTRIES = 10_000;
let cleanupCursor: MapIterator<[string, RateLimitEntry]> | null = null;

function cleanupExpired(now: number) {
  cleanupCursor ??= rateLimitStore.entries();
  for (let scanned = 0; scanned < CLEANUP_BATCH_SIZE; scanned++) {
    const next = cleanupCursor.next();
    if (next.done) {
      cleanupCursor = null;
      return;
    }
    const [key, entry] = next.value;
    if (now >= entry.resetAt) rateLimitStore.delete(key);
  }
}

function normalizeIdentifier(identifier: string) {
  const value = identifier || "anonymous";
  // Header-derived identifiers can be attacker-controlled. Keeping a bounded key
  // prevents one entry from consuming an arbitrarily large amount of memory.
  return value.slice(0, MAX_IDENTIFIER_LENGTH);
}

function touchEntry(key: string, entry: RateLimitEntry) {
  // Map preserves insertion order; moving a hit to the end gives us O(1)-ish LRU
  // eviction when the hard capacity is reached.
  rateLimitStore.delete(key);
  rateLimitStore.set(key, entry);
}

function makeRoomForNewEntry() {
  while (rateLimitStore.size >= RATE_LIMIT_MAX_ENTRIES) {
    const oldest = rateLimitStore.keys().next();
    if (oldest.done) return;
    rateLimitStore.delete(oldest.value);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export function checkRateLimit(
  identifier: string,
  limit = 60,
  windowMs = 60_000
): RateLimitResult {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("rate-limit limit must be a positive safe integer");
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RangeError("rate-limit windowMs must be a positive safe integer");
  }

  const now = Date.now();
  cleanupExpired(now);
  const key = normalizeIdentifier(identifier);
  const entry = rateLimitStore.get(key);

  if (!entry || now >= entry.resetAt) {
    if (entry) rateLimitStore.delete(key);
    makeRoomForNewEntry();
    rateLimitStore.set(key, { count: 1, resetAt: Math.min(Number.MAX_SAFE_INTEGER, now + windowMs) });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    touchEntry(key, entry);
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count++;
  touchEntry(key, entry);
  return { allowed: true, remaining: limit - entry.count };
}

/** Test-only diagnostics; these are not exposed by any route. */
export function resetRateLimitStoreForTests() {
  rateLimitStore.clear();
  cleanupCursor = null;
}

export function getRateLimitStoreSizeForTests() {
  return rateLimitStore.size;
}
