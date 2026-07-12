// 注意：此 rate-limiter 使用行程內記憶體 Map。
// - 在 Node.js runtime（單一常駐 process）下，可提供「process sticky」限流，
//   同一 IP 連到同一 process 時有效；跨 process 不共享。
// - 在 Edge runtime 下，每個請求可能在不同 isolate，限流效果幾乎為零。
// 若要真正跨 process / 跨部署的限流，請改用 Vercel KV / Upstash Redis /
// @upstash/ratelimit 等外部儲存（需額外整合與成本）。
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL = 60_000;
// 為防止 Map 在高流量下無上限增長，設定硬上限。
// 超過時強制全部清掃一次（重建為「仍在限流窗口內」的條目）。
const MAX_ENTRIES = 10_000;
let lastCleanup = 0;

function cleanup() {
  const now = Date.now();
  const shouldHardReset = rateLimitStore.size > MAX_ENTRIES;
  if (!shouldHardReset && now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
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
  cleanup();

  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  entry.count++;

  if (entry.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  return { allowed: true, remaining: limit - entry.count };
}
