// -----------------------------------------------------------------------------
// Alert audience: every WhatsApp user who has messaged the bot.
//
// The bot records the sender on each inbound message/tap, and proactive alerts
// (press meet LIVE, …) fan out to this set. Meta does not expose the dev-app
// "To" allow list over the API, and after go-live only people who contacted us
// may be messaged anyway, so "has messaged the bot" is the audience.
//
// Redis layout: a set of wa_ids at `alerts:subs` (no expiry). Memory fallback
// for local dev / single node.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { getRedis } from "./redis.js";

export interface SubscriberStore {
  /** Record a user as an alert recipient. Never throws. */
  add(userId: string): Promise<void>;
  /** All recorded recipients. Returns [] on failure. */
  all(): Promise<string[]>;
}

const KEY = "alerts:subs";

/** WhatsApp ids are digits only; anything else (e.g. adapter-prefixed thread ids) is normalized or dropped. */
export function toWaId(userId: string): string | undefined {
  const digits = userId.split(":").pop()?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? digits : undefined;
}

export class MemorySubscriberStore implements SubscriberStore {
  private subs = new Set<string>();
  async add(userId: string): Promise<void> {
    const id = toWaId(userId);
    if (id) this.subs.add(id);
  }
  async all(): Promise<string[]> {
    return [...this.subs];
  }
}

export class RedisSubscriberStore implements SubscriberStore {
  async add(userId: string): Promise<void> {
    const id = toWaId(userId);
    if (!id) return;
    try {
      const redis = await getRedis();
      await redis.sAdd(KEY, id);
    } catch {
      // best effort; the user is re-added on their next message
    }
  }
  async all(): Promise<string[]> {
    try {
      const redis = await getRedis();
      return await redis.sMembers(KEY);
    } catch {
      return [];
    }
  }
}

let shared: SubscriberStore | undefined;

/** Process-wide store, shared by the bot, the alert route, and the CLI script. */
export function subscriberStore(): SubscriberStore {
  shared ??= config.redisUrl ? new RedisSubscriberStore() : new MemorySubscriberStore();
  return shared;
}
