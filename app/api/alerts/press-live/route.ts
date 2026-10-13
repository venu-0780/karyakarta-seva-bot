// -----------------------------------------------------------------------------
// POST /api/alerts/press-live — trigger "press meet is LIVE now" alerts.
//
// This is how you fire the alert from a Vercel deployment (you can't run the
// `npm run alert` CLI on serverless). Hit it manually when a meet goes live:
//
//   curl -X POST https://<your-domain>/api/alerts/press-live \
//        -H "Authorization: Bearer $ALERTS_SECRET"
//
// Guarded by the ALERTS_SECRET shared secret (timing-safe compare). If the
// secret isn't configured the route refuses every request, so a deploy can
// never expose an open broadcast trigger.
//
// It reuses the SAME selection logic (src/services/alerts.ts) and audience as
// the CLI script, and sends approved templates via a direct Graph API call.
// Returns a JSON summary of what was sent.
//
// NOTE: business-initiated alerts carry the policy / cost / tier risks in
// docs/DESIGN.md §0. This simple fan-out is fine for a pilot; at scale, enqueue
// the sends, throttle to the messaging tier, dedupe per meet, and honor opt-outs.
// -----------------------------------------------------------------------------
import crypto from "node:crypto";

import { config } from "../../../../src/config.js";
import { createSampleRepositories } from "../../../../src/data/sample.js";
import { liveMeetAlertText, liveMeets, pressLiveSubscribers } from "../../../../src/services/alerts.js";
import { sendTemplateMessage, sendTextMessage } from "../../../../src/render/sendTemplate.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Constant-time check of the Bearer token (or ?secret=) against ALERTS_SECRET. */
function authorized(request: Request): boolean {
  const secret = config.alertsSecret;
  if (!secret) return false; // closed by default
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice(7)
    : new URL(request.url).searchParams.get("secret") ?? "";
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const repos = createSampleRepositories();
  const live = await liveMeets(repos.content);
  if (live.length === 0) {
    return Response.json({ live: 0, recipients: 0, sent: 0, failed: 0 });
  }

  const audience = await pressLiveSubscribers();
  let sent = 0;
  let failed = 0;
  let mode: "session" | "template" | undefined;
  let error: string | undefined;
  for (const item of live) {
    const bodyText = liveMeetAlertText(item);
    for (const to of audience) {
      // Someone who messaged the bot in the last 24h can receive a normal
      // message — no approved template required. Fall back to the template
      // only when WhatsApp says the window is closed.
      let result = await sendTextMessage(to, bodyText);
      if (!result.ok) {
        result = await sendTemplateMessage(to, {
          name: config.templates.pressLive,
          language: config.broadcastLang,
          bodyParams: [bodyText],
        });
      }
      if (result.ok) {
        sent++;
        mode = result.mode;
      } else {
        failed++;
        error = result.error;
      }
    }
  }

  return Response.json({ live: live.length, recipients: audience.length, sent, failed, ...(mode ? { mode } : {}), ...(error ? { error } : {}) });
}
