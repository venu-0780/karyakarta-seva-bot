// -----------------------------------------------------------------------------
// WhatsApp Flow completion handling.
//
// When a user submits a Flow, Meta POSTs an inbound message whose
// interactive.type is "nfm_reply", carrying a `response_json` string with the
// form answers plus the `flow_token` we sent. The installed adapter doesn't
// surface this, so the webhook route detects it here (after verifying the
// X-Hub-Signature-256) and dispatches it via handleFlowCompletion in bot.ts.
// -----------------------------------------------------------------------------
import crypto from "node:crypto";

import { config } from "../config.js";

export interface FlowCompletion {
  /** Sender wa_id (digits). */
  from: string;
  /** Correlation token we set when sending the Flow (e.g. "idstatus", "poll:p2"). */
  token: string;
  /** Parsed form answers. */
  payload: Record<string, unknown>;
}

/** Verify Meta's X-Hub-Signature-256 over the raw body using the app secret. */
export function verifySignature(raw: string, header: string | null): boolean {
  const secret = config.whatsapp.appSecret;
  if (!secret || !header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Collect every inbound message id (`wamid...`) in a webhook body. Used for
 * idempotency: Meta re-delivers the same message (same id) when it doesn't get
 * a fast 200, so we must process each id at most once. Status/delivery webhooks
 * carry no `messages[]`, so they return nothing here.
 */
export function extractInboundMessageIds(raw: string): string[] {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return [];
  }
  const ids: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (body as any)?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      for (const msg of change?.value?.messages ?? []) {
        if (typeof msg?.id === "string" && msg.id) ids.push(msg.id);
      }
    }
  }
  return ids;
}

/** Return the Flow completion in a webhook body, or undefined if there isn't one. */
export function parseFlowCompletion(raw: string): FlowCompletion | undefined {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (body as any)?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      for (const msg of change?.value?.messages ?? []) {
        const nfm = msg?.interactive?.nfm_reply;
        if (msg?.type === "interactive" && nfm) {
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(nfm.response_json ?? "{}");
          } catch {
            data = {};
          }
          const token = typeof data.flow_token === "string" ? data.flow_token : "";
          if (token) return { from: String(msg.from ?? ""), token, payload: data };
        }
      }
    }
  }
  return undefined;
}
