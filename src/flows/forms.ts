// -----------------------------------------------------------------------------
// WhatsApp Flow completions for the forms added on top of ID status and polls.
// The webhook route already verified the body; this only turns the answers
// into a stored submission and a confirmation reply.
// -----------------------------------------------------------------------------
import { thanksSticker } from "../config.js";
import { PARTY_CONTACT } from "../data/sample.js";
import { makeTicket } from "../services/escalation.js";
import { backButton, L, readLangPref } from "../services/i18n.js";
import type { FlowContext, Reply } from "../types.js";

function field(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function fieldsOf(payload: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "flow_token") continue;
    const text = field({ [key]: value }, key);
    if (text) out[key] = text;
  }
  return out;
}

/**
 * Handle feedback / event / membership / survey completions.
 * Returns undefined for tokens this module does not own (id status, polls).
 */
export async function completeForm(
  ctx: FlowContext,
  token: string,
  payload: Record<string, unknown>,
): Promise<Reply | undefined> {
  const pref = readLangPref(ctx.session.data);
  const fields = fieldsOf(payload);
  const sticker = thanksSticker();

  if (token === "feedback") {
    const category = fields.category || "feedback";
    const details = fields.details || "(no details)";
    const callback = fields.callback ? `Reply via: ${fields.callback}` : "";
    const phone = fields.phone ? `Phone: ${fields.phone}` : "";
    const query = [`[${category}] ${details}`, callback, phone].filter(Boolean).join("\n");
    const history = ((ctx.session.data.history as string[] | undefined) ?? []).slice(-3);
    try {
      await ctx.services.escalation.create(
        makeTicket({ userId: ctx.userId, lang: pref, query, history }),
      );
    } catch {
      // confirmation still follows
    }
    await ctx.services.submissions.add({ kind: "feedback", userId: ctx.userId, fields });
    await ctx.setState("idle");
    await ctx.services.analytics.track("form:feedback", ctx.userId);
    return {
      reactionEmoji: "🙏",
      ...(sticker ? { sticker } : {}),
      text: L(pref, {
        te: "✅ ధన్యవాదాలు. మీ సందేశం కోఆర్డినేటర్‌కు చేరింది. వారు త్వరలో సంప్రదిస్తారు.",
        en: "✅ Thank you. Your message is with the coordinator, and they'll get back to you.",
      }),
      contacts: [PARTY_CONTACT],
      buttons: [backButton(pref)],
    };
  }

  if (token === "event") {
    await ctx.services.submissions.add({ kind: "event", userId: ctx.userId, fields });
    await ctx.setState("idle");
    await ctx.services.analytics.track("form:event", ctx.userId);
    const name = fields.name || "";
    return {
      reactionEmoji: "✅",
      ...(sticker ? { sticker } : {}),
      text: L(pref, {
        te: `✅ నమోదు అయింది${name ? `, *${name}*` : ""}. మీ స్థానం నిర్ధారణ కోసం కోఆర్డినేటర్ సంప్రదిస్తారు.`,
        en: `✅ You're registered${name ? `, *${name}*` : ""}. A coordinator will confirm your place.`,
      }),
      buttons: [backButton(pref)],
    };
  }

  if (token === "membership") {
    await ctx.services.submissions.add({ kind: "membership", userId: ctx.userId, fields });
    await ctx.setState("idle");
    await ctx.services.analytics.track("form:membership", ctx.userId);
    return {
      reactionEmoji: "✅",
      ...(sticker ? { sticker } : {}),
      text: L(pref, {
        te: "✅ దరఖాస్తు అందింది. మీ మండల కోఆర్డినేటర్ తర్వాతి దశ చెబుతారు.",
        en: "✅ Application received. Your mandal coordinator will tell you the next step.",
      }),
      contacts: [PARTY_CONTACT],
      buttons: [backButton(pref)],
    };
  }

  if (token === "survey") {
    await ctx.services.submissions.add({ kind: "survey", userId: ctx.userId, fields });
    await ctx.setState("idle");
    await ctx.services.analytics.track("form:survey", ctx.userId);
    return {
      reactionEmoji: "🙏",
      ...(sticker ? { sticker } : {}),
      text: L(pref, {
        te: "🙏 ధన్యవాదాలు. మీ రేటింగ్ నమోదైంది.",
        en: "🙏 Thank you. Your rating is recorded.",
      }),
      buttons: [backButton(pref)],
    };
  }

  return undefined;
}
