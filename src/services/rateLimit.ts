/**
 * Sliding-window rate limiter used by flow 6 (ID card lookups: 5/hour/sender)
 * and reusable for any abuse-prone flow.
 *
 * The in-memory version is fine for a single process / dev. For production and
 * >1 lakh scale, back it with Redis (INCR + EXPIRE) so limits hold across
 * instances — see the TODO below.
 */
import { getRedis } from "./redis.js";

export interface RateLimiter {
  /** Returns true if allowed (and records the hit), false if over the limit. */
  hit(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  async hit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}

/**
 * Redis-backed fixed-window limiter (INCR + PEXPIRE) so limits hold across
 * instances. On a Redis error it fails OPEN (allows the request) — availability
 * over strictness for a best-effort abuse guard.
 */
export class RedisRateLimiter implements RateLimiter {
  async hit(key: string, limit: number, windowMs: number): Promise<boolean> {
    try {
      const redis = await getRedis();
      const k = `rl:${key}`;
      const n = await redis.incr(k);
      if (n === 1) await redis.pExpire(k, windowMs);
      return n <= limit;
    } catch {
      return true;
    }
  }
}
