import { TODAY, YDAY } from "../data/sample.js";
import type { FlowContext, Reply } from "../types.js";
import { BACK } from "./menu.js";
import { docResponse } from "./talkingPoints.js";

// Flow 2 — Praja Sankalpam evening paper
export async function prajaSankalpam(ctx: FlowContext, which: "today" | "yday" = "today"): Promise<Reply> {
  await ctx.setState("idle");
  const d = await ctx.services.repos.content.prajaSankalpam(which);
  const label = `📰 Praja Sankalpam · ${which === "today" ? TODAY : YDAY}`;
  const buttons =
    which === "today"
      ? [{ id: "ps-y", label: "Yesterday's paper" }, BACK]
      : [{ id: "ps", label: "Today's paper" }, BACK];
  return docResponse(d, label, buttons);
}
