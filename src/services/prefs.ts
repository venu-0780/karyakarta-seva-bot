// -----------------------------------------------------------------------------
// Long-lived per-user preferences that must outlive the 24h session.
//
// Today this holds only the chosen language. The session store (sess:*) expires
// after a day of inactivity; a returning user should NOT have to pick their
// language again, so the choice is persisted here under a key with no TTL and
// seeded back into the session on the next message.
// -----------------------------------------------------------------------------
import { getRedis } from "./redis.js";
import type { LangPref } from "./i18n.js";

export interface LanguageStore {
  get(userId: string): Promise<LangPref | undefined>;
  set(userId: string, pref: LangPref): Promise<void>;
}

function asPref(v: unknown): LangPref | undefined {
  return v === "te" || v === "en" || v === "both" ? v : undefined;
}

/** In-process store for local dev / single instance. Lost on restart. */
export class MemoryLanguageStore implements LanguageStore {
  private prefs = new Map<string, LangPref>();
  async get(userId: string): Promise<LangPref | undefined> {
    return this.prefs.get(userId);
  }
  async set(userId: string, pref: LangPref): Promise<void> {
    this.prefs.set(userId, pref);
  }
}

/** Redis-backed store. Key `lang:{userId}` has NO expiry, so it persists. */
export class RedisLanguageStore implements LanguageStore {
  async get(userId: string): Promise<LangPref | undefined> {
    try {
      const redis = await getRedis();
      return asPref(await redis.get(`lang:${userId}`));
    } catch {
      return undefined; // fail soft: caller falls back to the first-run picker
    }
  }
  async set(userId: string, pref: LangPref): Promise<void> {
    try {
      const redis = await getRedis();
      await redis.set(`lang:${userId}`, pref);
    } catch {
      // best effort; the session copy still carries the choice for now
    }
  }
}
