// -----------------------------------------------------------------------------
// Webhook idempotency.
//
// Meta's Cloud API re-delivers a message (identical `wamid` id) whenever it does
// not receive a timely 200 — on timeouts, cold starts, or transient errors.
// Without dedup that means the bot replies twice and, now, calls the LLM twice.
// `markProcessed` records each id the FIRST time it is seen and reports repeats
// so the route can ack-and-skip them.
//
// Backed by Redis (atomic SET NX) when REDIS_URL is set — required for the
// serverless / multi-instance case where retries can land on different workers.
// Falls back to an in-process map for local dev / single instance. Fails OPEN:
// on a Redis error we treat the message as fresh (a rare double-reply beats
// silently dropping a real message).
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { getRedis } from "./redis.js";

// Meta retries within a short window; 1h of memory comfortably covers it.
const DEDUP_TTL_MS = 60 * 60 * 1000;

const memory = new Map<string, number>();

function markProcessedMemory(id: string): boolean {
  const now = Date.now();
  // Opportunistic cleanup so the map can't grow unbounded on a long-lived process.
  if (memory.size > 10_000) {
    for (const [k, t] of memory) if (now - t > DEDUP_TTL_MS) memory.delete(k);
  }
  const seen = memory.get(id);
  if (seen !== undefined && now - seen < DEDUP_TTL_MS) return false;
  memory.set(id, now);
  return true;
}

/**
 * Returns true the FIRST time an id is seen (process it), false on a duplicate
 * (ack and skip). Never throws.
 */
export async function markProcessed(id: string): Promise<boolean> {
  if (!id) return true;
  if (config.redisUrl) {
    try {
      const redis = await getRedis();
      // SET key value NX PX ttl -> "OK" when newly set, null when it already existed.
      const res = await redis.set(`dedup:${id}`, "1", { NX: true, PX: DEDUP_TTL_MS });
      return res === "OK";
    } catch {
      return true; // fail open
    }
  }
  return markProcessedMemory(id);
}
