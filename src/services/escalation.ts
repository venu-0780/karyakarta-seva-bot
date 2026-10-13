// -----------------------------------------------------------------------------
// Human handoff / escalation store.
//
// When the bot can't resolve a query (or the user explicitly asks for a person),
// we capture a short ticket and hand it to a coordinator. This module ONLY
// persists tickets; the actual WhatsApp notification to the coordinator is a
// platform concern wired at the composition root (src/bot.ts via
// src/render/coordinatorNotify.ts), so flows stay transport-agnostic.
//
// Tickets intentionally carry only what a coordinator needs to follow up: the
// member's WhatsApp id (so they can reply), language, the question, and the last
// few non-PII messages for context. No phone numbers / membership data are
// stored here (the ID-lookup flow never routes through escalation).
//
// Redis layout: a capped, auto-expiring list of JSON tickets at `esc:tickets`.
// Memory fallback keeps an in-process ring buffer for local dev / single node.
// -----------------------------------------------------------------------------
import { getRedis } from "./redis.js";
import type { LangPref } from "./i18n.js";

export interface EscalationTicket {
  /** Stable id, e.g. `esc-<ts>-<rand>`. */
  id: string;
  /** Canonical user id (WhatsApp wa_id / thread id) so the coordinator can reply. */
  userId: string;
  /** The member's reply-language preference. */
  lang: LangPref;
  /** The question/problem the member typed. */
  query: string;
  /** Recent prior user messages (oldest first), for context. No PII. */
  history: string[];
  /** ISO timestamp of creation. */
  createdAt: string;
}

export interface EscalationStore {
  /** Persist a ticket. Never throws (failures must not break the user reply). */
  create(ticket: EscalationTicket): Promise<void>;
  /** Most recent tickets first (admin / debugging convenience). */
  recent(limit?: number): Promise<EscalationTicket[]>;
}

// Keep a bounded history so neither store grows without limit.
const MAX_TICKETS = 500;
const RETENTION_SEC = 30 * 24 * 60 * 60; // 30 days

/** Build a ticket with a generated id + timestamp from the raw fields. */
export function makeTicket(
  fields: Omit<EscalationTicket, "id" | "createdAt">,
): EscalationTicket {
  const rand = Math.random().toString(36).slice(2, 8);
  return { ...fields, id: `esc-${Date.now()}-${rand}`, createdAt: new Date().toISOString() };
}

/** In-process store for local dev / single instance. Lost on restart. */
export class MemoryEscalationStore implements EscalationStore {
  private tickets: EscalationTicket[] = [];

  async create(ticket: EscalationTicket): Promise<void> {
    this.tickets.unshift(ticket);
    if (this.tickets.length > MAX_TICKETS) this.tickets.length = MAX_TICKETS;
  }

  async recent(limit = 50): Promise<EscalationTicket[]> {
    return this.tickets.slice(0, limit);
  }
}

/** Redis-backed store so tickets survive across serverless instances. */
export class RedisEscalationStore implements EscalationStore {
  private readonly key = "esc:tickets";

  async create(ticket: EscalationTicket): Promise<void> {
    try {
      const redis = await getRedis();
      await redis.lPush(this.key, JSON.stringify(ticket));
      await redis.lTrim(this.key, 0, MAX_TICKETS - 1);
      await redis.expire(this.key, RETENTION_SEC);
    } catch {
      // Escalation persistence is best-effort; the coordinator notification and
      // the user's confirmation still happen regardless.
    }
  }

  async recent(limit = 50): Promise<EscalationTicket[]> {
    try {
      const redis = await getRedis();
      const raw = await redis.lRange(this.key, 0, limit - 1);
      const out: EscalationTicket[] = [];
      for (const item of raw) {
        try {
          out.push(JSON.parse(item) as EscalationTicket);
        } catch {
          // skip a corrupt entry
        }
      }
      return out;
    } catch {
      return [];
    }
  }
}
