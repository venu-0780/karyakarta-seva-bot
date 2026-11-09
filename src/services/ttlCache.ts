// -----------------------------------------------------------------------------
// Small TTL key-value store with a set-if-absent lock. Redis in production (so
// Vercel instances share tokens, lookups, and locks); memory for local dev and
// tests. Values are JSON-serialisable.
// -----------------------------------------------------------------------------
import { getRedis } from "./redis.js";

export interface TtlCache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
  /** Set-if-absent. Returns false when another holder already has the key. */
  acquire(key: string, ttlMs: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

export class MemoryTtlCache implements TtlCache {
  private entries = new Map<string, { value: unknown; expires: number }>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    this.entries.set(key, { value, expires: Date.now() + ttlMs });
  }

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    if ((await this.get(key)) !== undefined) return false;
    await this.set(key, "1", ttlMs);
    return true;
  }

  async release(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

export class RedisTtlCache implements TtlCache {
  async get<T>(key: string): Promise<T | undefined> {
    const raw = await (await getRedis()).get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    await (await getRedis()).set(key, JSON.stringify(value), { PX: ttlMs });
  }

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    return (await (await getRedis()).set(key, "1", { NX: true, PX: ttlMs })) === "OK";
  }

  async release(key: string): Promise<void> {
    await (await getRedis()).del(key);
  }
}
