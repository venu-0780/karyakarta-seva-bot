// -----------------------------------------------------------------------------
// WhatsApp Flow completions for the forms added on top of ID status and polls.
// The webhook route already verified the body; this only turns the answers
// into a stored submission and a confirmation reply.
// -----------------------------------------------------------------------------
import { thanksSticker } from "../config.js";
import { PARTY_CONTACT } from "../data/sample.js";
import type { PressMeet } from "../data/repository.js";
import { makeTicket, ticketRef } from "../services/escalation.js";
import type { EventDay } from "./events.js";
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

const EVENT_DAYS = new Set(["today", "tmrw", "yday"]);

/** The meet picked in the event form: token carries the day, `slot` the index in that day's list. */
async function chosenMeet(
  ctx: FlowContext,
  day: string,
  slot: string | undefined,
): Promise<{ label: string; meet: PressMeet } | undefined> {
  if (!EVENT_DAYS.has(day) || !slot || !/^\d+$/.test(slot)) return undefined;
  const { label, list } = await ctx.services.repos.content.pressMeets(day as EventDay);
  const meet = list[Number(slot)];
  return meet ? { label, meet } : undefined;
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
    const ticket = makeTicket({ userId: ctx.userId, lang: pref, query, history });
    let ref = "";
    try {
      await ctx.services.escalation.create(ticket);
      ref = ticketRef(ticket.id);
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
        te:
          "✅ ధన్యవాదాలు. మీ సందేశం కోఆర్డినేటర్‌కు చేరింది. వారు త్వరలో సంప్రదిస్తారు." +
          (ref ? `\nటికెట్: *${ref}*` : ""),
        en:
          "✅ Thank you. Your message is with the coordinator, and they'll get back to you." +
          (ref ? `\nTicket: *${ref}*` : ""),
      }),
      contacts: [PARTY_CONTACT],
      buttons: [backButton(pref)],
    };
  }

  if (token === "event" || token.startsWith("event:")) {
    const meet = await chosenMeet(ctx, token.slice(6), fields.slot);
    const saved = meet
      ? { ...fields, meet: `${meet.label} ${meet.meet.time} · ${meet.meet.who} · ${meet.meet.topic}` }
      : fields;
    await ctx.services.submissions.add({ kind: "event", userId: ctx.userId, fields: saved });
    await ctx.setState("idle");
    await ctx.services.analytics.track("form:event", ctx.userId);
    const name = fields.name || "";
    const which = meet ? `\n\n📢 *${meet.meet.time} · ${meet.meet.who}*\n${meet.meet.topic}\n_${meet.meet.where}_` : "";
    return {
      reactionEmoji: "✅",
      ...(sticker ? { sticker } : {}),
      text: L(pref, {
        te: `✅ నమోదు అయింది${name ? `, *${name}*` : ""}. మీ స్థానం నిర్ధారణ కోసం కోఆర్డినేటర్ సంప్రదిస్తారు.${which}`,
        en: `✅ You're registered${name ? `, *${name}*` : ""}. A coordinator will confirm your place.${which}`,
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
