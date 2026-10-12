import { BRAND_IMAGES, TODAY, YDAY } from "../data/sample.js";
import { backButton, LB, PH, readLangPref } from "../services/i18n.js";
import type { FlowContext, Reply } from "../types.js";
import { docResponse } from "./talkingPoints.js";

// Flow 2 — Praja Sankalpam evening paper
export async function prajaSankalpam(ctx: FlowContext, which: "today" | "yday" = "today"): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  const d = await ctx.services.repos.content.prajaSankalpam(which);
  const title = LB(pref, { te: "ప్రజా సంకల్పం", en: "Praja Sankalpam" });
  const label = `📰 ${title} · ${which === "today" ? TODAY : YDAY}`;
  const buttons =
    which === "today"
      ? [{ id: "ps-y", label: LB(pref, PH.ydaysPaper) }, backButton(pref)]
      : [{ id: "ps", label: LB(pref, PH.todaysPaper) }, backButton(pref)];
  return docResponse(pref, d, label, buttons, BRAND_IMAGES.paper);
}
