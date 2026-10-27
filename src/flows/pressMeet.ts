import { BRAND_IMAGES, TODAY, TMRW, YDAY } from "../data/sample.js";
import { eventInvite } from "./events.js";
import { backButton, L, LB, PH, readLangPref, type LangPref, type Phrase } from "../services/i18n.js";
import type { Button, FlowContext, Reply } from "../types.js";

const DAY_WORD: Record<"today" | "tmrw" | "yday", Phrase> = {
  today: PH.today,
  tmrw: PH.tomorrow,
  yday: PH.yesterday,
};
const PILL: Record<"live" | "up" | "rec", Phrase> = {
  live: PH.live,
  up: PH.upcoming,
  rec: PH.recording,
};
const LINK_LABEL: Record<"live" | "up" | "rec", Phrase> = {
  live: PH.watchLive,
  up: PH.liveLink,
  rec: PH.watchRec,
};

const PROMPT: Phrase = {
  te: "📢 *ప్రెస్ మీట్ షెడ్యూల్*\nఏ రోజు కావాలి?",
  en: "📢 *Press meet schedule*\nWhich day do you want?",
};

// Flow 3 — Press meet schedule (day picker)
export async function pressMeet(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  return {
    text: L(pref, PROMPT),
    headerImage: BRAND_IMAGES.news,
    buttons: [
      { id: "pm-today", label: `${LB(pref, PH.today)} · ${TODAY.slice(0, 6)}` },
      { id: "pm-tmrw", label: `${LB(pref, PH.tomorrow)} · ${TMRW.slice(0, 6)}` },
      { id: "pm-yday", label: `${LB(pref, PH.yesterday)} · ${YDAY.slice(0, 6)}` },
    ],
  };
}

// Flow 3 — a specific day's schedule
export async function pressMeetDay(ctx: FlowContext, day: "today" | "tmrw" | "yday"): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const { label, list } = await ctx.services.repos.content.pressMeets(day);
  const header = `📅 *${LB(pref, DAY_WORD[day])} · ${label}*`;
  const body =
    list.length === 0
      ? `${header}\n\n${L(pref, { te: "ఈ రోజు ప్రెస్ మీట్‌లు లేవు.", en: "No press meets scheduled." })}`
      : `${header}\n\n` +
        list
          .map(
            (m) =>
              `*${m.time} · ${m.who}* ${LB(pref, PILL[m.status])}\n` +
              `${m.topic}\n_${m.where}_\n${LB(pref, LINK_LABEL[m.status])}: ${m.link}`,
          )
          .join("\n\n");

  const others: Button[] = (["today", "tmrw", "yday"] as const)
    .filter((k) => k !== day)
    .map((k) => ({ id: `pm-${k}`, label: LB(pref, DAY_WORD[k]) }));

  const schedule = { text: body, buttons: [...others, backButton(pref)] };
  const invite = eventInvite(ctx);
  return invite ? [schedule, invite] : schedule;
}
