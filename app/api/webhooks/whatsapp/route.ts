import { after } from "next/server";
import { handleFlowCompletion, handleWhatApiWebhook } from "../../../../src/bot.js";
import { markProcessed } from "../../../../src/services/dedup.js";
import { parseStatusUpdates, recordDeliveries } from "../../../../src/services/delivery.js";
import {
  extractInboundMessageIds,
  parseFlowCompletion,
} from "../../../../src/services/flowWebhook.js";

const CHALLENGE_KEYS = ["challange", "challenge", "hub.challenge"] as const;

function plain(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

/** WhatAPI sends `challange` (their spelling) on GET or POST. Meta sends hub.challenge. */
function challengeFrom(request: Request, raw?: string): string | null {
  const params = new URL(request.url).searchParams;
  for (const key of CHALLENGE_KEYS) {
    const value = params.get(key);
    if (value != null) return value;
  }
  if (!raw) return null;
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    for (const key of CHALLENGE_KEYS) {
      const value = body[key];
      if (typeof value === "string") return value;
    }
  } catch {
    // A message payload is not a challenge.
  }
  return null;
}

// Node.js runtime (not edge): the WhatsApp adapter and node-redis need Node
// APIs. force-dynamic keeps this from ever being statically optimized, and
// maxDuration gives the post-response send work (incl. media) room to finish.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// WhatAPI: GET /webhook?echo=true&challange=<code> and the body must be that code.
// Verify-token check is off for now, matching the manager's sample (VERIFY_TOKEN is empty).
export async function GET(request: Request) {
  // const rejected = rejectVerifyToken(request);
  // if (rejected) return rejected;
  return plain(challengeFrom(request) ?? "OK");
}

// POSTs are either another challenge or a message event. WhatAPI does not sign
// events, so an unsigned body is accepted. Always return 200 or WhatAPI disables
// the webhook.
export async function POST(request: Request) {
  const raw = await request.text();
  // const rejected = rejectVerifyToken(request, raw);
  // if (rejected) return rejected;
  const challenge = challengeFrom(request, raw);
  if (challenge != null) return plain(challenge);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return plain("OK");
  }

  // Idempotency: WhatAPI can deliver retries in quick succession.
  const ids = extractInboundMessageIds(raw);
  if (ids.length > 0) {
    const fresh = await Promise.all(ids.map(markProcessed));
    if (fresh.every((isNew) => !isNew)) {
      return plain("OK");
    }
  }

  const statuses = parseStatusUpdates(raw);
  if (statuses.length) after(() => recordDeliveries(statuses));

  const flow = parseFlowCompletion(raw);
  if (flow?.from && flow.token) {
    after(() => handleFlowCompletion(flow.from, flow.token, flow.payload));
    return plain("OK");
  }

  after(() => handleWhatApiWebhook(payload));
  return plain("OK");
}

// Restore this when the CRM starts sending hub.verify_token.
// function rejectVerifyToken(request: Request, raw?: string): Response | null {
//   const expected = process.env.WHATSAPP_VERIFY_TOKEN;
//   if (!expected) return null;
//   let token = new URL(request.url).searchParams.get("hub.verify_token");
//   if (token == null && raw) {
//     try {
//       const body = JSON.parse(raw) as Record<string, unknown>;
//       if (typeof body["hub.verify_token"] === "string") token = body["hub.verify_token"];
//     } catch {
//       // Not a JSON challenge.
//     }
//   }
//   if (token != null && token !== expected) return plain("Forbidden", 403);
//   return null;
// }
