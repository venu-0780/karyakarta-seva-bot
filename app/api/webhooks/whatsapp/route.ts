import crypto from "node:crypto";
import { after } from "next/server";
import { bot, handleFlowCompletion } from "../../../../src/bot.js";
import { markProcessed } from "../../../../src/services/dedup.js";
import {
  extractInboundMessageIds,
  parseFlowCompletion,
  verifySignature,
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
export async function GET(request: Request) {
  return plain(challengeFrom(request) ?? "OK");
}

// POSTs are either another challenge or a message event. WhatAPI does not sign
// events, so an unsigned body is accepted. Always return 200 or WhatAPI disables
// the webhook.
export async function POST(request: Request) {
  const raw = await request.text();
  const challenge = challengeFrom(request, raw);
  if (challenge != null) return plain(challenge);

  const headers = new Headers(request.headers);
  const signature = headers.get("x-hub-signature-256");
  if (!verifySignature(raw, signature)) {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (secret) {
      headers.set(
        "x-hub-signature-256",
        "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex"),
      );
    }
  }

  if (secretPresent(raw, headers)) {
    // Idempotency: Meta re-delivers the same message id until it gets a 200.
    // Mark each inbound id once; if every message here is a repeat, ack and stop
    // so we never reply twice or call the LLM twice for one user message.
    const ids = extractInboundMessageIds(raw);
    if (ids.length > 0) {
      const fresh = await Promise.all(ids.map(markProcessed));
      if (fresh.every((isNew) => !isNew)) {
        return plain("OK");
      }
    }

    const flow = parseFlowCompletion(raw);
    if (flow?.from && flow.token) {
      after(() => handleFlowCompletion(flow.from, flow.token, flow.payload));
      return plain("OK");
    }
  }

  const rebuilt = new Request(request.url, { method: "POST", headers, body: raw });
  await bot.webhooks.whatsapp(rebuilt, {
    waitUntil: (task) => after(() => task),
  });
  return plain("OK");
}

function secretPresent(raw: string, headers: Headers): boolean {
  return verifySignature(raw, headers.get("x-hub-signature-256"));
}
