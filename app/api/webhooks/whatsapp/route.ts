import { after } from "next/server";
import { bot, handleFlowCompletion } from "../../../../src/bot.js";
import { markProcessed } from "../../../../src/services/dedup.js";
import {
  extractInboundMessageIds,
  parseFlowCompletion,
  verifySignature,
} from "../../../../src/services/flowWebhook.js";

// Node.js runtime (not edge): the WhatsApp adapter and node-redis need Node
// APIs. force-dynamic keeps this from ever being statically optimized, and
// maxDuration gives the post-response send work (incl. media) room to finish.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Meta sends a GET verification handshake (hub.verify_token challenge)...
export async function GET(request: Request) {
  return bot.webhooks.whatsapp(request);
}

// ...and POSTs incoming messages / interactive responses (signed, verified
// against WHATSAPP_APP_SECRET). `after` lets us return 200 fast and process async.
export async function POST(request: Request) {
  // Read the raw body once so we can both (a) detect a WhatsApp Flow completion
  // (which the adapter doesn't surface) and (b) hand an identical request to the
  // adapter for everything else. The signature is verified against this raw body.
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (verifySignature(raw, signature)) {
    // Idempotency: Meta re-delivers the same message id until it gets a 200.
    // Mark each inbound id once; if every message here is a repeat, ack and stop
    // so we never reply twice or call the LLM twice for one user message.
    const ids = extractInboundMessageIds(raw);
    if (ids.length > 0) {
      const fresh = await Promise.all(ids.map(markProcessed));
      if (fresh.every((isNew) => !isNew)) {
        return new Response(null, { status: 200 });
      }
    }

    const flow = parseFlowCompletion(raw);
    if (flow?.from && flow.token) {
      after(() => handleFlowCompletion(flow.from, flow.token, flow.payload));
      return new Response(null, { status: 200 });
    }
  }

  // Not a Flow completion (or unverifiable) -> let the adapter handle/verify it.
  const rebuilt = new Request(request.url, { method: "POST", headers: request.headers, body: raw });
  return bot.webhooks.whatsapp(rebuilt, {
    waitUntil: (task) => after(() => task),
  });
}
