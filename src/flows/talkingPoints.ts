import type { DocEdition } from "../data/repository.js";
import { TODAY, YDAY } from "../data/sample.js";
import type { BotResponse, FlowContext, Reply } from "../types.js";
import { BACK } from "./menu.js";

/** Shared document card used by both talking points (1) and Praja Sankalpam (2). */
export function docResponse(d: DocEdition, label: string, buttons: BotResponse["buttons"]): BotResponse {
  return {
    documents: [{ filename: d.file, url: d.link, caption: `${d.pages} pages · ${d.size} · ${d.lang}` }],
    text: `*${label}*\n${d.head}\n\nRead online: ${d.link}`,
    buttons,
  };
}

// Flow 1 — Daily talking points
export async function talkingPoints(ctx: FlowContext, which: "today" | "yday" = "today"): Promise<Reply> {
  await ctx.setState("idle");
  const d = await ctx.services.repos.content.talkingPoints(which);
  const label = which === "today" ? `📌 Talking points · ${TODAY}` : `📌 Talking points · ${YDAY}`;
  const buttons =
    which === "today"
      ? [{ id: "tp-y", label: "Yesterday's points" }, BACK]
      : [{ id: "tp", label: "Today's points" }, BACK];
  return docResponse(d, label, buttons);
}
