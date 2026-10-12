// -----------------------------------------------------------------------------
// Outbound broadcast helper: business-initiated daily briefing via an
// IMAGE-HEADER template message.
//
// WHY a template: outside WhatsApp's 24-hour customer-service window the Cloud
// API only accepts PRE-APPROVED template messages. This is the single "premium"
// push the installed @chat-adapter/whatsapp exposes (adapter.sendTemplate).
//
// WHAT TO CREATE IN META (WhatsApp Manager -> Message Templates) so this works:
//   Name:      talking_points_daily          (matches TEMPLATE_TALKING_POINTS)
//   Category:  MARKETING  (or UTILITY if purely transactional)
//   Language:  en  (override with TEMPLATE_LANG)
//   Header:    IMAGE                          -> filled by headerImageUrl below
//   Body:      "🙏 {{1}} briefing is ready.\n\n*{{2}}*\nTap below to read."
//                                              -> {{1}} = date, {{2}} = headline
//   Button:    URL (dynamic) "Open briefing"  -> trailing {{1}} filled by linkParam
//
// Credentials (access token, phone number ID) are auto-detected from the same
// WHATSAPP_* env vars the webhook uses; nothing is logged here.
// -----------------------------------------------------------------------------
import { createWhatsAppAdapter, type WhatsAppTemplateMessage } from "@chat-adapter/whatsapp";

import { config } from "../config.js";

export interface DailyBriefing {
  /** Recipient WhatsApp id (digits only, country code, no '+'). */
  toWaId: string;
  /** Public HTTPS image shown as the template header. */
  headerImageUrl: string;
  /** Body variable {{1}} — e.g. "09 Oct 2026" or "Today". */
  date: string;
  /** Body variable {{2}} — the one-line headline. */
  headline: string;
  /**
   * URL-button variable: the dynamic trailing segment appended to the button's
   * base URL approved in the template (e.g. a doc id or slug). Omit if the
   * template's button URL is fully static.
   */
  linkParam?: string;
  /** Template name; defaults to the talking-points daily template. */
  template?: string;
  /** Template language code; defaults to TEMPLATE_LANG or "en". */
  language?: string;
}

// One adapter instance for outbound pushes (reads WHATSAPP_* env at construction).
const adapter = createWhatsAppAdapter();

/** Build the template payload (exported for unit testing without a live send). */
export function buildBriefingTemplate(b: DailyBriefing): WhatsAppTemplateMessage {
  const components: WhatsAppTemplateMessage["components"] = [
    { type: "header", parameters: [{ type: "image", image: { link: b.headerImageUrl } }] },
    {
      type: "body",
      parameters: [
        { type: "text", text: b.date },
        { type: "text", text: b.headline },
      ],
    },
  ];
  if (b.linkParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: 0,
      parameters: [{ type: "text", text: b.linkParam }],
    });
  }
  return {
    name: b.template ?? config.templates.talkingPoints,
    language: b.language ?? config.broadcastLang,
    components,
  };
}

/**
 * Send one daily-briefing template to a single recipient. Returns true on
 * success, false if the phone number id is missing or the Cloud API rejects it
 * (for example an unapproved template). Never throws, so a bad recipient can't
 * break a batch loop.
 */
export async function sendDailyBriefing(b: DailyBriefing): Promise<boolean> {
  const phoneNumberId = config.whatsapp.phoneNumberId;
  if (!phoneNumberId || !b.toWaId) return false;
  const threadId = adapter.encodeThreadId({ phoneNumberId, userWaId: b.toWaId });
  try {
    await adapter.sendTemplate(threadId, buildBriefingTemplate(b));
    return true;
  } catch {
    return false;
  }
}

/** Fan a briefing out to many recipients sequentially; returns a per-id result. */
export async function broadcastDailyBriefing(
  recipients: string[],
  briefing: Omit<DailyBriefing, "toWaId">,
): Promise<{ sent: string[]; failed: string[] }> {
  const sent: string[] = [];
  const failed: string[] = [];
  for (const toWaId of recipients) {
    (await sendDailyBriefing({ ...briefing, toWaId }) ? sent : failed).push(toWaId);
  }
  return { sent, failed };
}
