import type { DocEdition } from "../data/repository.js";
import { BRAND_IMAGES, TODAY, YDAY } from "../data/sample.js";
import { backButton, L, LB, PH, readLangPref, type LangPref } from "../services/i18n.js";
import type { BotResponse, FlowContext, Reply } from "../types.js";

/** Shared document card used by both talking points (1) and Praja Sankalpam (2). */
export function docResponse(
  pref: LangPref,
  d: DocEdition,
  label: string,
  buttons: BotResponse["buttons"],
  headerImage?: string,
): Reply {
  const caption = `${d.pages} ${LB(pref, PH.pagesFmt)} · ${d.size} · ${d.lang}`;
  const card: BotResponse = {
    documents: [{ filename: d.file, url: d.link, caption }],
    text: `*${label}*\n${d.head}\n\n${LB(pref, PH.readOnline)}: ${d.link}`,
    buttons,
    ...(headerImage ? { headerImage } : {}),
  };
  if (d.audioUrl?.startsWith("https://")) return [{ audio: { url: d.audioUrl } }, card];
  return card;
}

// Flow 1 — Daily talking points
export async function talkingPoints(ctx: FlowContext, which: "today" | "yday" = "today"): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  const d = await ctx.services.repos.content.talkingPoints(which);
  const title = LB(pref, { te: "టాకింగ్ పాయింట్స్", en: "Talking points" });
  const label = `📌 ${title} · ${which === "today" ? TODAY : YDAY}`;
  const buttons =
    which === "today"
      ? [{ id: "tp-y", label: LB(pref, PH.ydaysPoints) }, backButton(pref)]
      : [{ id: "tp", label: LB(pref, PH.todaysPoints) }, backButton(pref)];
  return docResponse(pref, d, label, buttons, BRAND_IMAGES.speech);
}
