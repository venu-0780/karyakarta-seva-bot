// -----------------------------------------------------------------------------
// Shared node-redis client. One lazily-connected client is reused across warm
// serverless invocations (module scope survives between requests on Vercel),
// so we don't open a new TCP connection per message.
//
// Works with any standard redis:// / rediss:// URL (Upstash, Redis Cloud, etc.).
// The same `redis` package backs @chat-adapter/state-redis, so one URL serves
// both the Chat SDK state and the app's own session / rate-limit stores.
// -----------------------------------------------------------------------------
import { createClient, type RedisClientType } from "redis";

import { config } from "../config.js";

let clientPromise: Promise<RedisClientType> | undefined;

/** Get the shared, connected Redis client. Throws if REDIS_URL is not set. */
export function getRedis(): Promise<RedisClientType> {
  if (!config.redisUrl) throw new Error("REDIS_URL is not set");
  if (!clientPromise) {
    const client: RedisClientType = createClient({ url: config.redisUrl });
    // Never let a transient connection error crash the process; the next command
    // triggers node-redis's automatic reconnect.
    client.on("error", () => {});
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}
