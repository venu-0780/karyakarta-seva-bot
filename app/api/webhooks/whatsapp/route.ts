import { after } from "next/server";
import { bot } from "../../../../src/bot.js";

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
  return bot.webhooks.whatsapp(request, {
    waitUntil: (task) => after(() => task),
  });
}
