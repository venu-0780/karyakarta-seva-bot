// -----------------------------------------------------------------------------
// Lightweight, privacy-respecting engagement analytics.
//
// Records coarse counters only — which features are used and how many distinct
// people used the bot each day. No message text, phone numbers, or ID lookups
// are ever stored. Every method is best-effort and fails OPEN: analytics must
// never delay or break a user's reply.
//
// Redis layout (one key per UTC day, auto-expiring after RETENTION):
//   stats:YYYY-MM-DD   HASH  event -> count      (HINCRBY)
//   dau:YYYY-MM-DD     HLL   distinct user ids   (PFADD / PFCOUNT)
// -----------------------------------------------------------------------------
import { getRedis } from "./redis.js";

export interface AnalyticsSnapshot {
  date: string;
  events: Record<string, number>;
  activeUsers: number;
}

export interface Analytics {
  /** Record one event for a user. Never throws. */
  track(event: string, userId: string): Promise<void>;
  /** Read a day's counters (defaults to today, UTC). */
  snapshot(date?: string): Promise<AnalyticsSnapshot>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const RETENTION_SEC = 90 * 24 * 60 * 60; // keep ~3 months of daily rollups

/** In-process analytics for local dev / single instance. Lost on restart. */
export class MemoryAnalytics implements Analytics {
  private events = new Map<string, Map<string, number>>();
  private users = new Map<string, Set<string>>();

  async track(event: string, userId: string): Promise<void> {
    const d = today();
    const e = this.events.get(d) ?? new Map<string, number>();
    e.set(event, (e.get(event) ?? 0) + 1);
    this.events.set(d, e);
    const u = this.users.get(d) ?? new Set<string>();
    u.add(userId);
    this.users.set(d, u);
  }

  async snapshot(date: string = today()): Promise<AnalyticsSnapshot> {
    const e = this.events.get(date) ?? new Map<string, number>();
    return { date, events: Object.fromEntries(e), activeUsers: (this.users.get(date) ?? new Set()).size };
  }
}

/** Redis-backed analytics so counters hold across serverless instances. */
export class RedisAnalytics implements Analytics {
  async track(event: string, userId: string): Promise<void> {
    try {
      const redis = await getRedis();
      const d = today();
      const hkey = `stats:${d}`;
      const ukey = `dau:${d}`;
      await redis.hIncrBy(hkey, event, 1);
      await redis.pfAdd(ukey, userId);
      await redis.expire(hkey, RETENTION_SEC);
      await redis.expire(ukey, RETENTION_SEC);
    } catch {
      // Analytics must never break a reply.
    }
  }

  async snapshot(date: string = today()): Promise<AnalyticsSnapshot> {
    try {
      const redis = await getRedis();
      const raw = await redis.hGetAll(`stats:${date}`);
      const activeUsers = await redis.pfCount(`dau:${date}`);
      const events: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) events[k] = Number(v);
      return { date, events, activeUsers };
    } catch {
      return { date, events: {}, activeUsers: 0 };
    }
  }
}
