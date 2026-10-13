// -----------------------------------------------------------------------------
// Proactive alerts: notify opted-in workers when something they're waiting on
// changes state. Two kinds, both driven by state already in the data:
//
//   npm run alert -- press-live                     (a press meet is LIVE now)
//   npm run alert -- id-ready 9876543210 9000000001 (those cards ready to collect)
//
// Like scripts/broadcast.ts, business-initiated messages outside the 24h service
// window MUST be pre-approved templates (see docs/DESIGN.md §0.2). This simple
// loop is for dev only; production must use a queue, throttle to the messaging
// tier, honor delivery webhooks + opt-outs, and dedupe (never alert twice for
// the same meet/card). The alert SELECTION logic lives in src/services/alerts.ts
// and is unit-tested; this script only handles delivery.
// -----------------------------------------------------------------------------
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { config } from "../src/config.js";
import { createSampleRepositories } from "../src/data/sample.js";
import {
  idReadyAlertText,
  liveMeetAlertText,
  liveMeets,
  membersReadyToCollect,
  pressLiveSubscribers,
} from "../src/services/alerts.js";

type Kind = "press-live" | "id-ready";

async function sendTemplateAlert(
  adapter: ReturnType<typeof createWhatsAppAdapter>,
  phone: string,
  templateName: string,
  bodyText: string,
): Promise<void> {
  const threadId = await adapter.openDM(phone);
  // TODO(verify): confirm the exact `components` shape of your approved alert
  // template against the installed adapter + WhatsApp Manager layout.
  await adapter.sendTemplate(threadId, {
    name: templateName,
    language: config.broadcastLang,
    components: [{ type: "body", parameters: [{ type: "text", text: bodyText }] }],
  });
  // TODO(prod): throttle to messaging tier; track message id; retry transient errors.
}

async function runPressLive(adapter: ReturnType<typeof createWhatsAppAdapter>): Promise<void> {
  const repos = createSampleRepositories();
  const live = await liveMeets(repos.content);
  if (live.length === 0) {
    console.log("No press meets are LIVE right now — nothing to alert.");
    return;
  }
  const recipients = await pressLiveSubscribers();
  console.log(`${live.length} live meet(s); alerting ${recipients.length} subscriber(s)...`);
  for (const item of live) {
    const text = liveMeetAlertText(item);
    console.log(`  • ${text}`);
    for (const phone of recipients) {
      await sendTemplateAlert(adapter, phone, config.templates.pressLive, text);
    }
  }
}

async function runIdReady(
  adapter: ReturnType<typeof createWhatsAppAdapter>,
  mobiles: string[],
): Promise<void> {
  if (mobiles.length === 0) {
    console.error("Usage: npm run alert -- id-ready <mobile> [<mobile> ...]");
    process.exit(1);
  }
  const repos = createSampleRepositories();
  const records = (await Promise.all(mobiles.map((m) => repos.membership.lookup(m)))).filter(
    (r): r is NonNullable<typeof r> => Boolean(r),
  );
  const ready = membersReadyToCollect(records);
  if (ready.length === 0) {
    console.log("None of the given numbers have a card ready to collect — nothing to alert.");
    return;
  }
  console.log(`${ready.length} card(s) ready; alerting the registered number(s)...`);
  for (const [i, record] of ready.entries()) {
    const text = idReadyAlertText(record);
    console.log(`  • ${text}`);
    // TODO(prod): map a MembershipRecord to its subscriber wa_id; here we reuse
    // the mobile the lookup was keyed by (positional, sample-only).
    const phone = mobiles[i] ?? mobiles[0]!;
    await sendTemplateAlert(adapter, phone, config.templates.idReady, text);
  }
}

async function main() {
  const kind = (process.argv[2] as Kind) ?? "press-live";
  const rest = process.argv.slice(3).map((m) => m.replace(/\D/g, "")).filter(Boolean);
  const adapter = createWhatsAppAdapter();

  if (kind === "press-live") {
    await runPressLive(adapter);
  } else if (kind === "id-ready") {
    await runIdReady(adapter, rest);
  } else {
    console.error(`Unknown alert kind "${kind}". Use "press-live" or "id-ready".`);
    process.exit(1);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
