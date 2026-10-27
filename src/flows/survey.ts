// -----------------------------------------------------------------------------
// Short in-chat rating. Opens the native Flow when SURVEY_FLOW_ID is set.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { surveyFormData } from "./formText.js";
import { backButton, L, LB, readLangPref } from "../services/i18n.js";
import type { FlowContext, Reply } from "../types.js";

export async function surveyAsk(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  const chat = {
    text: L(pref, {
      te: "⭐ ఈ హెల్ప్‌డెస్క్ ఎంత ఉపయోగంగా ఉందో 1 నుండి 5 వరకు చెప్పండి.",
      en: "⭐ How useful is this helpdesk? Reply with a number from 1 to 5.",
    }),
    buttons: [backButton(pref)],
  };
  if (!config.flows.survey) return chat;
  return {
    ...chat,
    flow: {
      flowId: config.flows.survey,
      token: "survey",
      screen: "RATE",
      cta: LB(pref, { te: "రేట్ చేయండి", en: "Rate the bot" }),
      body: L(pref, {
        te: "⭐ ఈ హెల్ప్‌డెస్క్ గురించి ఒక నిమిషం అభిప్రాయం చెప్పండి.",
        en: "⭐ Take a moment to rate this helpdesk.",
      }),
      data: surveyFormData(pref),
      footer: LB(pref, PH.formBack),
    },
  };
}
