// -----------------------------------------------------------------------------
// Membership application. Opens the native Flow when MEMBERSHIP_FLOW_ID is set.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { membershipFormData } from "./formText.js";
import { backButton, L, LB, PH, readLangPref } from "../services/i18n.js";
import type { FlowContext, Reply } from "../types.js";

export async function membershipAsk(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  const chat = {
    text: L(pref, {
      te: "🪪 *ఐడి దరఖాస్తు*\n\nపేరు, మొబైల్, నియోజకవర్గం పంపండి. మీ మండల కోఆర్డినేటర్ సంప్రదిస్తారు.",
      en: "🪪 *ID card application*\n\nSend your name, mobile number, and constituency. Your mandal coordinator will follow up.",
    }),
    buttons: [backButton(pref)],
  };
  if (!config.flows.membership) return chat;
  return {
    ...chat,
    flow: {
      flowId: config.flows.membership,
      token: "membership",
      screen: "WHO",
      cta: LB(pref, { te: "దరఖాస్తు", en: "Apply" }),
      body: L(pref, {
        te: "🪪 *ఐడి దరఖాస్తు*\n\nకింద ఫారమ్ తెరిచి వివరాలు పూరించండి.",
        en: "🪪 *ID card application*\n\nTap below and fill in the form.",
      }),
      data: membershipFormData(pref),
      footer: LB(pref, PH.formBack),
    },
  };
}
