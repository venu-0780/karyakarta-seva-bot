// -----------------------------------------------------------------------------
// Structured form submissions (event registration, membership, survey, feedback).
//
// Flows stay transport-agnostic: they call `ctx.services.submissions.add` and
// never talk to Redis or WhatsApp. The store is a capped list, same shape as
// the escalation tickets, so a coordinator can review what people submitted.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { getRedis } from "./redis.js";

export type SubmissionKind = "feedback" | "event" | "membership" | "survey";

export interface Submission {
  id: string;
  kind: SubmissionKind;
  userId: string;
  fields: Record<string, string>;
  createdAt: string;
}

export interface SubmissionStore {
  add(input: Omit<Submission, "id" | "createdAt">): Promise<Submission>;
  recent(limit?: number): Promise<Submission[]>;
}

const MAX_ITEMS = 500;
const RETENTION_SEC = 30 * 24 * 60 * 60;

function makeSubmission(input: Omit<Submission, "id" | "createdAt">): Submission {
  const rand = Math.random().toString(36).slice(2, 8);
  return { ...input, id: `sub-${Date.now()}-${rand}`, createdAt: new Date().toISOString() };
}

export class MemorySubmissionStore implements SubmissionStore {
  private items: Submission[] = [];

  async add(input: Omit<Submission, "id" | "createdAt">): Promise<Submission> {
    const item = makeSubmission(input);
    this.items.unshift(item);
    if (this.items.length > MAX_ITEMS) this.items.length = MAX_ITEMS;
    return item;
  }

  async recent(limit = 50): Promise<Submission[]> {
    return this.items.slice(0, limit);
  }
}

export class RedisSubmissionStore implements SubmissionStore {
  private readonly key = "forms:submissions";

  async add(input: Omit<Submission, "id" | "createdAt">): Promise<Submission> {
    const item = makeSubmission(input);
    try {
      const redis = await getRedis();
      await redis.lPush(this.key, JSON.stringify(item));
      await redis.lTrim(this.key, 0, MAX_ITEMS - 1);
      await redis.expire(this.key, RETENTION_SEC);
    } catch {
      // Persistence is best-effort; the user still gets a confirmation.
    }
    return item;
  }

  async recent(limit = 50): Promise<Submission[]> {
    try {
      const redis = await getRedis();
      const raw = await redis.lRange(this.key, 0, limit - 1);
      return raw.flatMap((line) => {
        try {
          return [JSON.parse(line) as Submission];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }
}

let shared: SubmissionStore | undefined;

export function submissionStore(): SubmissionStore {
  shared ??= config.redisUrl ? new RedisSubmissionStore() : new MemorySubmissionStore();
  return shared;
}
