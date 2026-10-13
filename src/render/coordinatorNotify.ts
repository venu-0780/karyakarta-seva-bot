// -----------------------------------------------------------------------------
// Proactive WhatsApp notification to the area coordinator when a member escalates
// (human handoff). This is a PLATFORM concern — it sends a WhatsApp message to a
// third party (the coordinator), which can't be expressed as a BotResponse to
// the member — so it lives in the render layer and is wired into the escalation
// service at the composition root (src/bot.ts), keeping flows transport-agnostic.
//
// Best-effort: if no coordinator is configured, or WhatsApp creds are missing,
// or the send fails, it silently does nothing. The member still gets their
// confirmation + helpline card from the flow.
//
// NOTE: a coordinator who hasn't messaged the bot in the last 24h sits outside
// the WhatsApp service window, so a free-form text may not deliver. In
// production, send an approved "new escalation" template instead (TODO(prod)).
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import type { EscalationTicket } from "../services/escalation.js";
import { graphThread } from "./graphThread.js";

/** Format a ticket into a compact, scannable coordinator brief. */
function formatTicket(t: EscalationTicket): string {
  const lines = [
    "🆘 *New karyakarta query*",
    `From: wa.me/${t.userId} (lang: ${t.lang})`,
    `Time: ${t.createdAt}`,
  ];
  if (t.history.length) {
    lines.push("", "Recent messages:");
    for (const h of t.history) lines.push(`• ${h}`);
  }
  lines.push("", "Question:", t.query, "", `Reply directly on WhatsApp: +${t.userId}`);
  return lines.join("\n");
}

/** Send the escalation brief to the configured coordinator. Never throws. */
export async function notifyCoordinator(ticket: EscalationTicket): Promise<boolean> {
  const waId = config.coordinator.waId;
  if (!waId || !config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) return false;
  try {
    await graphThread(waId).post({ markdown: formatTicket(ticket) });
    return true;
  } catch {
    return false;
  }
}
