import { idAsk, idCheck, idOffer, isNo, isYes } from "./flows/idCard.js";
import { jagan, jaganByDate, jaganByTopic, jaganMeet, jaganTopic } from "./flows/jaganMeets.js";
import { media, mediaGrid, sendMedia } from "./flows/media.js";
import { help, menu, setLanguage } from "./flows/menu.js";
import { pollResult, polls, pollShow, vote } from "./flows/polls.js";
import { prajaSankalpam } from "./flows/prajaSankalpam.js";
import { pressMeet, pressMeetDay } from "./flows/pressMeet.js";
import { talkingPoints } from "./flows/talkingPoints.js";
import { detectIntent } from "./services/intents.js";
import { languageChoice, readLangPref, t } from "./services/i18n.js";
import type { FlowContext, Reply } from "./types.js";

const GREETINGS = new Set(["hi", "hello", "menu", "start", "namaskaram", "నమస్కారం", "0"]);
const NUM_TO_ACTION: Record<string, string> = {
  "1": "tp", "2": "ps", "3": "pm", "4": "jagan", "5": "poll", "6": "id", "7": "media",
};

/** Dispatch a button/list action id to its flow (mirrors the prototype's `run`). */
export async function runAction(ctx: FlowContext, act: string): Promise<Reply> {
  if (act === "menu") return menu(ctx);
  if (act === "help") return help(ctx);
  if (act === "tp") return talkingPoints(ctx, "today");
  if (act === "tp-y") return talkingPoints(ctx, "yday");
  if (act === "ps") return prajaSankalpam(ctx, "today");
  if (act === "ps-y") return prajaSankalpam(ctx, "yday");

  if (act === "jagan") return jagan(ctx);
  if (act === "j-date") return jaganByDate(ctx);
  if (act === "j-topic") return jaganByTopic(ctx);
  if (act.startsWith("jt-")) return jaganTopic(ctx, act.slice(3));
  if (act.startsWith("jm-")) return jaganMeet(ctx, act.slice(3));

  if (act === "pm") return pressMeet(ctx);
  if (act.startsWith("pm-")) return pressMeetDay(ctx, act.slice(3) as "today" | "tmrw" | "yday");

  if (act === "poll") return polls(ctx);
  if (act.startsWith("poll-")) return pollShow(ctx, act.slice(5));
  if (act.startsWith("vote-")) {
    const [, id, i] = act.split("-");
    return vote(ctx, id!, Number(i));
  }

  if (act === "id" || act === "id-yes") return idAsk(ctx);

  if (act === "media") return media(ctx);
  if (act === "media-img") return mediaGrid(ctx, "img");
  if (act === "media-reel") return mediaGrid(ctx, "reel");
  if (act.startsWith("send-")) {
    const [, kind, id] = act.split("-");
    return sendMedia(ctx, kind as "img" | "reel", id!);
  }

  return menu(ctx);
}

/** Handle a free-text message (mirrors the prototype's `onText`). */
export async function runText(ctx: FlowContext, raw: string): Promise<Reply> {
  const s = raw.trim();
  if (!s) return [];
  const l = s.toLowerCase();

  if (GREETINGS.has(l)) return menu(ctx, { banner: true });

  const chosen = languageChoice(s);
  if (chosen) return setLanguage(ctx, chosen);
  if (/^(help|\?|సహాయం)$/i.test(s)) return help(ctx);

  // Resolve answers to the ID confirmation before looking for a new intent.
  if (ctx.session.state === "id-confirm") {
    if (isNo(s)) return menu(ctx);
    if (isYes(s)) return idAsk(ctx);
    if (/^\+?[\d\s-]{10,14}$/.test(s)) return idCheck(ctx, s);
  }

  // Natural-language navigation works from anywhere, including inside another
  // flow: "tomorrow press meet", "show posters", "opinion polls", etc.
  const intent = detectIntent(s);
  if (intent) {
    if (intent === "id") {
      return ctx.session.state === "id" ? idAsk(ctx) : idOffer(ctx);
    }
    return runAction(ctx, intent);
  }

  if (ctx.session.state === "id-confirm") return idOffer(ctx);

  // Waiting for the registered mobile number.
  if (ctx.session.state === "id") {
    if (isNo(s)) return menu(ctx);
    return idCheck(ctx, s);
  }
  if (ctx.session.state.startsWith("poll:") && /^\d+$/.test(s)) {
    const id = ctx.session.state.slice(5);
    const p = await ctx.services.repos.polls.get(id);
    const n = Number(s) - 1;
    if (p && n >= 0 && n < p.opts.length) return vote(ctx, id, n);
  }

  // A number picking a row from the last shown list (WhatsApp has no native list
  // in this adapter, so lists are numbered text — see render/whatsapp.ts + bot.ts).
  const pendingList = ctx.session.data.pendingList as Record<string, string> | undefined;
  if (pendingList && /^\d+$/.test(s) && pendingList[s]) {
    return runAction(ctx, pendingList[s]!);
  }

  // Numeric menu shortcuts
  if (NUM_TO_ACTION[s]) return runAction(ctx, NUM_TO_ACTION[s]!);

  // A phone-number-looking message anywhere -> ID lookup
  if (/^\+?[\d\s-]{10,14}$/.test(s)) return idCheck(ctx, s);

  const pref = readLangPref(ctx.session.data);
  return {
    text:
      "⚠️ " +
      (pref === "both" ? `${t("te", "notUnderstood")}\n${t("en", "notUnderstood")}` : t(ctx.lang, "notUnderstood")),
    buttons: [
      { id: "help", label: "Help" },
      { id: "menu", label: "Main menu" },
    ],
  };
}

export { pollResult };
