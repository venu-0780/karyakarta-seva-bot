// -----------------------------------------------------------------------------
// Outbound delivery counters from WhatsApp status webhooks.
//
// Each outbound message can report sent, delivered, read, and failed. Retries
// of the same (message id, status) pair are counted once. No message text or
// phone numbers are stored — only the four counters.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { getRedis } from "./redis.js";

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface StatusUpdate {
  id: string;
  status: DeliveryStatus;
  recipient: string;
  error?: string;
}

const STATUSES = new Set<DeliveryStatus>(["sent", "delivered", "read", "failed"]);
const SEEN_TTL_SEC = 7 * 24 * 60 * 60;
const COUNTS_KEY = "delivery:counts";

const memorySeen = new Set<string>();
const memoryCounts = new Map<DeliveryStatus, number>();

function isStatus(value: string): value is DeliveryStatus {
  return STATUSES.has(value as DeliveryStatus);
}

/** Pull status objects out of a WhatsApp webhook body. Ignores inbound messages. */
export function parseStatusUpdates(raw: string): StatusUpdate[] {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return [];
  }
  const updates: StatusUpdate[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (body as any)?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      for (const item of change?.value?.statuses ?? []) {
        const id = typeof item?.id === "string" ? item.id : "";
        const status = typeof item?.status === "string" ? item.status : "";
        if (!id || !isStatus(status)) continue;
        const error = item?.errors?.[0]?.title ?? item?.errors?.[0]?.message;
        updates.push({
          id,
          status,
          recipient: typeof item?.recipient_id === "string" ? item.recipient_id : "",
          ...(typeof error === "string" && error ? { error } : {}),
        });
      }
    }
  }
  return updates;
}

async function alreadySeen(id: string, status: DeliveryStatus): Promise<boolean> {
  const key = `${id}:${status}`;
  if (config.redisUrl) {
    try {
      const redis = await getRedis();
      const res = await redis.set(`delivery:seen:${key}`, "1", { NX: true, EX: SEEN_TTL_SEC });
      return res !== "OK";
    } catch {
      return false;
    }
  }
  if (memorySeen.has(key)) return true;
  memorySeen.add(key);
  if (memorySeen.size > 20_000) memorySeen.clear();
  return false;
}

/** Count each (message, status) once. Never throws. */
export async function recordDeliveries(updates: StatusUpdate[]): Promise<void> {
  for (const update of updates) {
    if (await alreadySeen(update.id, update.status)) continue;
    if (config.redisUrl) {
      try {
        const redis = await getRedis();
        await redis.hIncrBy(COUNTS_KEY, update.status, 1);
        await redis.expire(COUNTS_KEY, SEEN_TTL_SEC);
      } catch {
        // best-effort
      }
      continue;
    }
    memoryCounts.set(update.status, (memoryCounts.get(update.status) ?? 0) + 1);
    if (update.status === "failed" && update.error) {
      console.error("WhatsApp delivery failed", update.id, update.error);
    }
  }
}

/** In-memory counters for local dev and tests. Redis deploys read the hash. */
export function memoryDeliveryCounts(): Record<string, number> {
  return Object.fromEntries(memoryCounts);
}
