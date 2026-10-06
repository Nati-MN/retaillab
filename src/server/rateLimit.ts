import "server-only";

/**
 * Rate limiting boundary.
 *
 * `RateLimiter` is the interface the app depends on. The default implementation
 * is an in-memory fixed window, which is correct for a single Node process.
 * For multi-instance deployments implement the same interface on Redis/Upstash
 * and swap it in `getRateLimiter()` — no call site changes.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      if (this.buckets.size > 10_000) this.sweep(now);
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }
    bucket.count += 1;
    const allowed = bucket.count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSeconds: allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  private sweep(now: number) {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

const globalForLimiter = globalThis as unknown as { rateLimiter?: RateLimiter };

export function getRateLimiter(): RateLimiter {
  globalForLimiter.rateLimiter ??= new MemoryRateLimiter();
  return globalForLimiter.rateLimiter;
}

export const LIMITS = {
  login: { limit: 10, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 3600 },
  research: { limit: 12, windowSeconds: 3600 },
  analyst: { limit: 60, windowSeconds: 300 },
  write: { limit: 240, windowSeconds: 300 },
} as const;

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Too many requests. Try again in ${retryAfterSeconds}s.`);
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(scope: keyof typeof LIMITS, subject: string): Promise<void> {
  const { limit, windowSeconds } = LIMITS[scope];
  const r = await getRateLimiter().check(`${scope}:${subject}`, limit, windowSeconds);
  if (!r.allowed) throw new RateLimitError(r.retryAfterSeconds);
}
