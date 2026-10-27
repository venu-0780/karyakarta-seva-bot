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

export interface SendResult {
  ok: boolean;
  /** How the message was delivered, when ok. */
  mode?: "session" | "template";
  /** Graph API error message, when not ok. Safe to show; contains no secrets. */
  error?: string;
}

async function graphMessage(toWaId: string, message: Record<string, unknown>): Promise<SendResult> {
  const token = config.whatsapp.accessToken;
  const phoneId = config.whatsapp.phoneNumberId;
  if (!token || !phoneId || !toWaId) return { ok: false, error: "WhatsApp credentials are not configured" };
  try {
    const res = await fetch(`${config.whatsapp.apiUrl}/${config.whatsapp.graphVersion}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "karyakarta-seva-bot/1.0",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWaId,
        ...message,
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      console.error("WhatsApp send failed", res.status, body);
      let error = body;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) error = parsed.error.message;
      } catch {
        // keep the raw body
      }
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "network";
    console.error("WhatsApp send failed", error);
    return { ok: false, error };
  }
}

/**
 * Free-form text. Delivers only inside the 24h service window (the person has
 * messaged the bot recently). Outside that window WhatsApp rejects it and the
 * caller should fall back to an approved template.
 */
export async function sendTextMessage(toWaId: string, body: string): Promise<SendResult> {
  const result = await graphMessage(toWaId, { type: "text", text: { body } });
  return result.ok ? { ...result, mode: "session" } : result;
}

/** Send one approved template to a wa_id (digits, no +). Never throws. */
export async function sendTemplateMessage(toWaId: string, tpl: TemplateMessage): Promise<SendResult> {
  const components = tpl.bodyParams?.length
    ? [{ type: "body", parameters: tpl.bodyParams.map((text) => ({ type: "text", text })) }]
    : [];
  const result = await graphMessage(toWaId, {
    type: "template",
    template: {
      name: tpl.name,
      language: { code: tpl.language },
      ...(components.length ? { components } : {}),
    },
  });
  return result.ok ? { ...result, mode: "template" } : result;
}
