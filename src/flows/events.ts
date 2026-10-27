// -----------------------------------------------------------------------------
// Press-meet registration. The schedule stays in the chat; a second bubble
// opens the native Flow when EVENT_FLOW_ID is set.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { eventFormData } from "./formText.js";
import { backButton, L, LB, readLangPref } from "../services/i18n.js";
import type { BotResponse, FlowContext } from "../types.js";

export function eventInvite(ctx: FlowContext): BotResponse | undefined {
  const flowId = config.flows.event;
  if (!flowId) return undefined;
  const pref = readLangPref(ctx.session.data);
  return {
    flow: {
      flowId,
      token: "event",
      screen: "WHO",
      cta: LB(pref, { te: "నమోదు చేయండి", en: "Register" }),
      body: L(pref, {
        te: "🎟️ ఈ ప్రెస్ మీట్‌కు హాజరు కావాలా? కింద నమోదు చేయండి.",
        en: "🎟️ Want to attend? Register with the button below.",
      }),
      data: eventFormData(pref),
    },
    menuButton: backButton(pref),
    text: L(pref, {
      te: "నమోదు ఫారమ్ ఇప్పుడు అందుబాటులో లేదు. కోఆర్డినేటర్‌కు మెసేజ్ పంపండి.",
      en: "The registration form isn't available right now. Message your coordinator to sign up.",
    }),
  };
}
