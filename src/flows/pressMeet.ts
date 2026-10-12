import { BRAND_IMAGES, TODAY, TMRW, YDAY } from "../data/sample.js";
import type { Button, FlowContext, Reply } from "../types.js";
import { BACK } from "./menu.js";

const DAY_WORD = { today: "Today", tmrw: "Tomorrow", yday: "Yesterday" } as const;
const PILL = { live: "🔴 LIVE", up: "🔜 Upcoming", rec: "⏺ Recording" } as const;
const LINK_LABEL = { live: "Watch live", up: "Live link", rec: "Watch recording" } as const;

// Flow 3 — Press meet schedule (day picker)
export async function pressMeet(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  return {
    text: "📢 *Press meet schedule*\nWhich day do you want?",
    headerImage: BRAND_IMAGES.news,
    buttons: [
      { id: "pm-today", label: `Today · ${TODAY.slice(0, 6)}` },
      { id: "pm-tmrw", label: `Tomorrow · ${TMRW.slice(0, 6)}` },
      { id: "pm-yday", label: `Yesterday · ${YDAY.slice(0, 6)}` },
    ],
  };
}

// Flow 3 — a specific day's schedule
export async function pressMeetDay(ctx: FlowContext, day: "today" | "tmrw" | "yday"): Promise<Reply> {
  const { label, list } = await ctx.services.repos.content.pressMeets(day);
  const body =
    `📅 *${DAY_WORD[day]} · ${label}*\n\n` +
    list
      .map(
        (m) =>
          `*${m.time} · ${m.who}* ${PILL[m.status]}\n` +
          `${m.topic}\n_${m.where}_\n${LINK_LABEL[m.status]}: ${m.link}`,
      )
      .join("\n\n");

  const others: Button[] = (["today", "tmrw", "yday"] as const)
    .filter((k) => k !== day)
    .map((k) => ({ id: `pm-${k}`, label: DAY_WORD[k] }));

  return { text: body, buttons: [...others, BACK] };
}
