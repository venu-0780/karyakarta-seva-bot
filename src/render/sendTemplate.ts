// -----------------------------------------------------------------------------
// Send an approved WhatsApp template message via a direct Graph API call.
//
// Used by the serverless alert routes (app/api/alerts/*) — which can't use the
// Chat SDK adapter's openDM/sendTemplate the way the CLI script does — to push
// business-initiated alerts (press-meet LIVE, ID ready) to opted-in recipients.
// Mirrors the direct-Graph pattern already used in render/whatsapp.ts.
//
// Best-effort: returns false (and logs) on any missing prerequisite or non-2xx
// response so the caller can tally failures and keep going.
// -----------------------------------------------------------------------------
import { config } from "../config.js";

export interface TemplateMessage {
  /** Approved template name (must exist in WhatsApp Manager). */
  name: string;
  /** Template language code (e.g. "en", "en_US", "te"). */
  language: string;
  /** Ordered text params for the template body ({{1}}, {{2}}, ...). */
  bodyParams?: string[];
}

/** Send one template message to a wa_id (digits, no +). Never throws. */
export async function sendTemplateMessage(toWaId: string, tpl: TemplateMessage): Promise<boolean> {
  const token = config.whatsapp.accessToken;
  const phoneId = config.whatsapp.phoneNumberId;
  if (!token || !phoneId || !toWaId) return false;

  const components = tpl.bodyParams?.length
    ? [{ type: "body", parameters: tpl.bodyParams.map((text) => ({ type: "text", text })) }]
    : [];

  try {
    const res = await fetch(`https://graph.facebook.com/${config.whatsapp.graphVersion}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWaId,
        type: "template",
        template: {
          name: tpl.name,
          language: { code: tpl.language },
          ...(components.length ? { components } : {}),
        },
      }),
    });
    if (!res.ok) {
      console.error("WhatsApp template send failed", res.status, (await res.text()).slice(0, 400));
      return false;
    }
    return true;
  } catch (err) {
    console.error("WhatsApp template send failed", err instanceof Error ? err.message : "network");
    return false;
  }
}
