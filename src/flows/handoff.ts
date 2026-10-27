// -----------------------------------------------------------------------------
// Human handoff / escalation flow.
//
// When the bot can't help (or the member asks for a person), it offers to route
// the query to their area coordinator. The member types one message; we store a
// ticket (ctx.services.escalation) — which also notifies the coordinator over
// WhatsApp at the composition root — and confirm back with the helpline card.
//
// Transport-agnostic like every other flow: it never imports a platform SDK or
// the renderer. The coordinator-facing WhatsApp send is injected via the
// escalation service wired in src/bot.ts.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { PARTY_CONTACT } from "../data/sample.js";
import { makeTicket } from "../services/escalation.js";
import { backButton, helpButton, L, LB, PH, readLangPref } from "../services/i18n.js";
import type { FlowContext, Reply } from "../types.js";

// Deliberately specific so it never hijacks a normal content query — it only
// fires on an explicit request for a human / complaint. Covers English, Telugu
// script, and common transliterations.
const WANTS_HUMAN_RE =
  /\b(?:human|agent|representative|coordinator|complaint|complain|grievance|customer\s*(?:care|support)|real\s*person|talk\s+to\s+(?:a\s+)?(?:person|someone|human|agent|coordinator))\b|కోఆర్డినేటర్|ఫిర్యాదు|ఫిర్యాదు\s*చేయ|కార్యకర్తతో|వ్యక్తితో|మనిషితో|\b(?:coordinator|phiryadu|firyadu|complaint)\b/i;

/** True when the message is an explicit ask for a human / to raise a complaint. */
export function wantsHuman(raw: string): boolean {
  return WANTS_HUMAN_RE.test(raw.trim());
}

/** A reply-button that starts the handoff, reused by the unmatched fallback. */
export function handoffButton(pref: ReturnType<typeof readLangPref>) {
  return { id: "handoff", label: LB(pref, PH.talkToCoordinator) };
}

/**
 * Step 1 — ask the member to type their question. Sets the `handoff` state so
 * the next free-text message is captured as the escalation (see router.runText).
 */
export async function escalationStart(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("handoff", ctx.session.data);
  await ctx.services.analytics.track("use:handoff", ctx.userId);
  const pref = readLangPref(ctx.session.data);
  const chat = {
    text: L(pref, {
      te:
        "🧑‍💼 *కోఆర్డినేటర్ సహాయం*\n\n" +
        "మీ ప్రశ్న లేదా సమస్యను ఒకే మెసేజ్‌లో టైప్ చేయండి. దాన్ని మీ ప్రాంత కోఆర్డినేటర్‌కు పంపుతాం — వారు మిమ్మల్ని సంప్రదిస్తారు.",
      en:
        "🧑‍💼 *Coordinator help*\n\n" +
        "Type your question or problem in one message. We'll pass it to your area coordinator, who will get back to you.",
    }),
    buttons: [backButton(pref)],
  };
  if (!config.flows.feedback) return chat;
  return {
    ...chat,
    flow: {
      flowId: config.flows.feedback,
      token: "feedback",
      screen: "TYPE",
      cta: LB(pref, { te: "ఫారమ్ తెరవండి", en: "Open form" }),
      body: L(pref, {
        te: "🧑‍💼 *కోఆర్డినేటర్ సహాయం*\n\nఫిర్యాదు, సూచన లేదా అభిప్రాయం కింద ఫారమ్‌లో పంపండి.",
        en: "🧑‍💼 *Coordinator help*\n\nSend a complaint, suggestion, or note with the form below.",
      }),
    },
  };
}

/**
 * Step 2 — the member's message while in the `handoff` state. Stores the ticket
 * (which notifies the coordinator) and confirms, with the helpline card so they
 * always have an immediate fallback. Returns to the idle state.
 */
export async function escalationSubmit(ctx: FlowContext, query: string): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const q = query.trim();
  // Guard: an empty message just re-prompts rather than filing a blank ticket.
  if (!q) return escalationStart(ctx);

  const history = ((ctx.session.data.history as string[] | undefined) ?? [])
    .filter((m) => m !== q)
    .slice(-3);
  const ticket = makeTicket({ userId: ctx.userId, lang: pref, query: q, history });

  // create() persists AND notifies the coordinator (wired in bot.ts). Best
  // effort — a failure here must not block the member's confirmation.
  try {
    await ctx.services.escalation.create(ticket);
  } catch {
    // ignore — confirmation + helpline still follow
  }
  await ctx.setState("idle");
  await ctx.services.analytics.track("handoff:submit", ctx.userId);

  return [
    {
      text: L(pref, {
        te:
          "✅ ధన్యవాదాలు! మీ సందేశాన్ని మీ ప్రాంత కోఆర్డినేటర్‌కు పంపాం. వారు త్వరలో మిమ్మల్ని సంప్రదిస్తారు.\n" +
          "అత్యవసరమైతే కింద ఉన్న హెల్ప్‌లైన్‌కు కాల్ చేయవచ్చు.",
        en:
          "✅ Thank you! I've passed your message to your area coordinator — they'll reach out to you soon.\n" +
          "If it's urgent, you can call the helpline below.",
      }),
      contacts: [PARTY_CONTACT],
      buttons: [backButton(pref)],
    },
  ];
}

/**
 * The "I didn't understand" fallback, upgraded to offer a human. Shown by the
 * router when nothing matched. Keeps Help + Menu but leads with the coordinator.
 */
export function escalationOffer(ctx: FlowContext, notUnderstood: string): Reply {
  const pref = readLangPref(ctx.session.data);
  const offer = L(pref, {
    te: "\n\nలేదా మీ ప్రాంత కోఆర్డినేటర్‌తో మాట్లాడాలనుకుంటే కింద నొక్కండి.",
    en: "\n\nOr tap below to talk to your area coordinator.",
  });
  return {
    text: `⚠️ ${notUnderstood}${offer}`,
    buttons: [handoffButton(pref), helpButton(pref), backButton(pref)],
  };
}
