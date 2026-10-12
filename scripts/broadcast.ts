// -----------------------------------------------------------------------------
// Scheduled broadcast: pushes the daily talking points (7 AM) and Praja
// Sankalpam (6 PM) as APPROVED WhatsApp template messages to opted-in workers.
//
// Business-initiated messages outside the 24h window MUST be pre-approved
// templates with a document header. See docs/DESIGN.md §0.2 for cost/tier/policy
// risks at >1 lakh scale — this simple loop is for dev only; production must use
// a queue (BullMQ/SQS), throttle to the messaging tier, and honor delivery
// webhooks + opt-outs.
//
// Run: npm run broadcast -- talking_points   (or praja_sankalpam)
// -----------------------------------------------------------------------------
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { config } from "../src/config.js";
import { createSampleRepositories } from "../src/data/sample.js";

type Kind = "talking_points" | "praja_sankalpam";

// TODO(prod): replace with BroadcastRepo.optedIn(category) from the DB.
async function audience(): Promise<string[]> {
  return ["15551234567"]; // sample recipient (E.164, no +)
}

async function main() {
  const kind = (process.argv[2] as Kind) ?? "talking_points";
  const adapter = createWhatsAppAdapter();
  const repos = createSampleRepositories();

  const doc =
    kind === "talking_points"
      ? await repos.content.talkingPoints("today")
      : await repos.content.prajaSankalpam("today");

  const templateName =
    kind === "talking_points" ? config.templates.talkingPoints : config.templates.prajaSankalpam;

  const recipients = await audience();
  console.log(`Broadcasting "${templateName}" to ${recipients.length} recipient(s)...`);

  for (const phone of recipients) {
    const threadId = await adapter.openDM(phone);
    // TODO(verify): confirm the exact `components` shape for a document-header
    // template against the installed adapter + your approved template layout.
    await adapter.sendTemplate(threadId, {
      name: templateName,
      language: "te",
      components: [
        { type: "header", parameters: [{ type: "document", document: { link: doc.link, filename: doc.file } }] },
        { type: "body", parameters: [{ type: "text", text: doc.head }] },
      ],
    });
    // TODO(prod): throttle to messaging tier; track message id; retry on transient errors.
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
