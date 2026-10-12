import { getRedis } from "./redis.js";
import type { Session } from "../types.js";

/**
 * Minimal session store interface. Back it with Redis in production.
 * A trivial in-memory implementation is provided for local dev / tests.
 */
export interface SessionStore {
  get(userId: string): Promise<Session>;
  set(userId: string, session: Session): Promise<void>;
}

const EMPTY: Session = { state: "idle", data: {} };

export class MemorySessionStore implements SessionStore {
  private map = new Map<string, Session>();

  async get(userId: string): Promise<Session> {
    return this.map.get(userId) ?? { ...EMPTY, data: {} };
  }

  async set(userId: string, session: Session): Promise<void> {
    this.map.set(userId, session);
  }
}

/**
 * Redis-backed session store for multi-instance / serverless deploys. Sessions
 * are kept under `sess:${userId}` as JSON with a 24h TTL (matches the WhatsApp
 * service window). A read error falls back to a fresh session so a Redis blip
 * can't wedge a user.
 */
const SESSION_TTL_SECONDS = 86_400;

export class RedisSessionStore implements SessionStore {
  async get(userId: string): Promise<Session> {
    try {
      const redis = await getRedis();
      const raw = await redis.get(`sess:${userId}`);
      if (raw) return JSON.parse(raw) as Session;
    } catch {
      // fall through to an empty session
    }
    return { ...EMPTY, data: {} };
  }

  async set(userId: string, session: Session): Promise<void> {
    const redis = await getRedis();
    await redis.set(`sess:${userId}`, JSON.stringify(session), { EX: SESSION_TTL_SECONDS });
  }
}
