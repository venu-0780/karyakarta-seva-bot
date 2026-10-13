import { escalationOffer, escalationStart, escalationSubmit, wantsHuman } from "./flows/handoff.js";
import { idAsk, idCheck, idOffer, isNo, isYes } from "./flows/idCard.js";
import { jagan, jaganByDate, jaganByTopic, jaganMeet, jaganTopic } from "./flows/jaganMeets.js";
import { media, mediaGrid, sendMedia } from "./flows/media.js";
import { chooseLanguage, help, menu, setLanguage } from "./flows/menu.js";
import { pollResult, polls, pollShow, vote } from "./flows/polls.js";
import { prajaSankalpam } from "./flows/prajaSankalpam.js";
import { pressMeet, pressMeetDay } from "./flows/pressMeet.js";
import { talkingPoints } from "./flows/talkingPoints.js";
import { config } from "./config.js";
import { TODAY, YDAY } from "./data/sample.js";
import { detectIntent, type IntentAction } from "./services/intents.js";
import { classify } from "./services/llmRouter.js";
import { groundedAnswer } from "./services/llmAnswer.js";
import { L, LB, PH, backButton, languageChoice, readLangPref, t, type Phrase } from "./services/i18n.js";
import type { BotResponse, Button, FlowContext, Reply } from "./types.js";

const GREETINGS = new Set([
  "hi", "hello", "hey", "menu", "start", "namaskaram", "namaste", "0",
  "నమస్కారం", "నమస్తే", "హాయ్", "హలో", "మెనూ", "మెను", "ప్రారంభం",
]);
const NUM_TO_ACTION: Record<string, string> = {
  "1": "tp", "2": "ps", "3": "pm", "4": "jagan", "5": "poll", "6": "id", "7": "media",
};

/** Coarse feature label for analytics (e.g. "tp-y" -> "tp", "vote-p2-1" -> "vote"). */
function featureOf(act: string): string {
  return act.split("-")[0] || "menu";
}

/** Dispatch a button/list action id to its flow (mirrors the prototype's `run`). */
export async function runAction(ctx: FlowContext, act: string): Promise<Reply> {
  await ctx.services.analytics.track(`use:${featureOf(act)}`, ctx.userId);
  if (act === "lang") return chooseLanguage(ctx);
  if (act === "lang-te") return setLanguage(ctx, "te");
  if (act === "lang-en") return setLanguage(ctx, "en");
  if (act === "lang-both") return setLanguage(ctx, "both");
  if (act === "menu") return menu(ctx);
  if (act === "help") return help(ctx);
  if (act === "handoff") return escalationStart(ctx);
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

// Short, single-language button labels for the LLM clarify prompt. Keyed by the
// exact action so a tap routes straight back through `runAction` above.
const ACTION_LABELS: Partial<Record<IntentAction, Phrase>> = {
  tp: { te: "టాకింగ్ పాయింట్స్", en: "Talking points" },
  "tp-y": { te: "నిన్నటి పాయింట్లు", en: "Yesterday's points" },
  ps: { te: "ప్రజా సంకల్పం", en: "Praja Sankalpam" },
  "ps-y": { te: "నిన్నటి పేపర్", en: "Yesterday's paper" },
  pm: { te: "ప్రెస్ మీట్లు", en: "Press meets" },
  "pm-today": { te: "నేటి ప్రెస్ మీట్లు", en: "Today's meets" },
  "pm-tmrw": { te: "రేపటి ప్రెస్ మీట్లు", en: "Tomorrow's meets" },
  "pm-yday": { te: "నిన్నటి ప్రెస్ మీట్లు", en: "Yesterday's meets" },
  jagan: { te: "నేత ప్రెస్ మీట్లు", en: "Leader press meets" },
  "j-date": { te: "తేదీ వారీగా", en: "Leader: by date" },
  "j-topic": { te: "అంశం వారీగా", en: "Leader: by topic" },
  poll: { te: "అభిప్రాయ పోల్స్", en: "Opinion polls" },
  id: { te: "ఐడి స్థితి", en: "ID status" },
  media: { te: "పోస్టర్లు / రీల్స్", en: "Posters / reels" },
  "media-img": { te: "పోస్టర్లు", en: "Posters" },
  "media-reel": { te: "రీల్స్", en: "Reels" },
};

function actionLabel(pref: ReturnType<typeof readLangPref>, act: IntentAction): string {
  return LB(pref, ACTION_LABELS[act] ?? PH.mainMenu);
}

// ─── Deep-linking: turn an LLM `query` keyword into an exact outcome ──────────
// Conservative token-overlap matching. If nothing matches confidently we return
// undefined so the caller falls back to the normal picker (premium = correct,
// never a wrong jump).

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u0c00-\u0c7f\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

/** Best candidate by shared significant tokens; needs >=1 overlap to win. */
function bestMatch(query: string, candidates: { key: string; value: string }[]): string | undefined {
  const q = tokenize(query);
  if (q.size === 0) return undefined;
  let best: string | undefined;
  let bestScore = 0;
  for (const c of candidates) {
    const k = tokenize(c.key);
    let overlap = 0;
    for (const w of q) if (k.has(w)) overlap++;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = c.value;
    }
  }
  return bestScore >= 1 ? best : undefined;
}

/** "jagan farmers" -> that topic's meet list (not the topic picker). */
async function deepLinkJagan(ctx: FlowContext, query: string): Promise<Reply | undefined> {
  const meets = await ctx.services.repos.content.jaganMeets();
  const topics = [...new Set(meets.map((m) => m.topic))];
  const topic = bestMatch(query, topics.map((t) => ({ key: t, value: t })));
  return topic ? jaganTopic(ctx, topic) : undefined;
}

/** "rice poster" -> send that poster/reel directly (not the gallery). */
async function deepLinkMedia(
  ctx: FlowContext,
  action: IntentAction,
  query: string,
): Promise<Reply | undefined> {
  const kind: "img" | "reel" = action === "media-reel" ? "reel" : "img";
  const items = kind === "img" ? await ctx.services.repos.media.images() : await ctx.services.repos.media.reels();
  const id = bestMatch(
    query,
    items.map((it) => ({ key: `${it.title} ${it.subtitle}`, value: it.id })),
  );
  return id ? sendMedia(ctx, kind, id) : undefined;
}

/** Dispatch an LLM action, using its `query` to deep-link when we can. */
async function routeWithQuery(ctx: FlowContext, action: IntentAction, query?: string): Promise<Reply> {
  if (query) {
    if (action === "jagan" || action === "j-topic" || action === "j-date") {
      const deep = await deepLinkJagan(ctx, query);
      if (deep) return deep;
    } else if (action === "media" || action === "media-img" || action === "media-reel") {
      const deep = await deepLinkMedia(ctx, action, query);
      if (deep) return deep;
    }
  }
  return runAction(ctx, action);
}

// ─── Grounded answers: answer a question from repo data, then show the flow ──

// A loose "is this a question / asking for content?" check across English and
// Telugu (script + transliteration). False positives are harmless: a non-content
// action simply yields no facts and we skip the answer.
const QUESTION_RE =
  /[?？]|\b(what|whats|what's|why|how|which|when|where|who|any|is there|are there|tell me|explain|summar\w*)\b|ఏమి|ఏంటి|ఏంటో|ఏం|ఎందుకు|ఎలా|ఎప్పుడు|ఎక్కడ|ఎవరు|ఉందా|ఉన్నాయా|చెప్పు|వివర|\b(enti|ento|ela|em|emi|eppudu|ekkada|evaru|unda|unnaya|cheppu|vivaram)\b/i;

function looksLikeQuestion(s: string): boolean {
  return QUESTION_RE.test(s);
}

/** Plain-text facts for summarizable content actions, or undefined otherwise. */
async function factsFor(ctx: FlowContext, action: IntentAction, query?: string): Promise<string | undefined> {
  const content = ctx.services.repos.content;
  if (action === "tp" || action === "tp-y") {
    const which = action === "tp-y" ? "yday" : "today";
    const d = await content.talkingPoints(which);
    return `Talking points for ${which === "yday" ? YDAY : TODAY}. Key themes: ${d.head}. Source: ${d.pages}-page PDF in ${d.lang}.`;
  }
  if (action === "ps" || action === "ps-y") {
    const which = action === "ps-y" ? "yday" : "today";
    const d = await content.prajaSankalpam(which);
    return `Praja Sankalpam evening paper for ${which === "yday" ? YDAY : TODAY}. ${d.head}. Source: ${d.pages}-page PDF in ${d.lang}.`;
  }
  if (action === "pm" || action === "pm-today" || action === "pm-tmrw" || action === "pm-yday") {
    const day = action === "pm-tmrw" ? "tmrw" : action === "pm-yday" ? "yday" : "today";
    const d = await content.pressMeets(day);
    if (!d.list.length) return `No press meets are scheduled for ${d.label}.`;
    const lines = d.list.map(
      (m) =>
        `- ${m.time}, ${m.who}: "${m.topic}" at ${m.where} (${m.status === "live" ? "live now" : m.status === "up" ? "upcoming" : "recorded"})`,
    );
    return `Press meets for ${d.label}:\n${lines.join("\n")}`;
  }
  if (action === "jagan" || action === "j-date" || action === "j-topic") {
    let meets = await content.jaganMeets();
    if (query) {
      const topics = [...new Set(meets.map((m) => m.topic))];
      const topic = bestMatch(query, topics.map((tp) => ({ key: tp, value: tp })));
      if (topic) meets = meets.filter((m) => m.topic === topic);
    }
    if (!meets.length) return undefined;
    const lines = meets.slice(0, 6).map((m) => `- ${m.date} [${m.topic}] ${m.title} (${m.dur})`);
    return `Leader's recent press meets:\n${lines.join("\n")}`;
  }
  return undefined;
}

const toReplies = (r: Reply): BotResponse[] => (Array.isArray(r) ? r : [r]);

/**
 * When the user ASKED a question (not just navigated) and the resolved action
 * has summarizable content, prepend a short grounded answer to the flow reply.
 * The answer is built only from repo facts; the flow reply still carries the
 * source doc/links. Fails open to the plain flow reply.
 */
async function withGroundedAnswer(
  ctx: FlowContext,
  message: string,
  action: IntentAction,
  base: Reply,
  query?: string,
): Promise<Reply> {
  if (!config.llm.answersEnabled || !looksLikeQuestion(message)) return base;
  const facts = await factsFor(ctx, action, query);
  if (!facts) return base;
  // Reuse the per-user LLM budget (this is a second call on top of routing).
  const allowed = await ctx.services.rateLimit.hit(`llm:${ctx.userId}`, config.llm.callsPerHour, 60 * 60 * 1000);
  if (!allowed) return base;
  const answer = await groundedAnswer(message, facts, readLangPref(ctx.session.data));
  if (!answer) return base;
  await ctx.services.analytics.track("llm:answer", ctx.userId);
  return [{ text: answer }, ...toReplies(base)];
}

/**
 * Last-resort natural-language routing via the LLM, used only after the
 * deterministic matcher found nothing. Fails OPEN: a rate-limit hit, API error,
 * timeout, or `unknown` result all return undefined so the caller shows the
 * normal "didn't understand" reply. Returns a Reply only on a confident route
 * or a clarify prompt.
 */
async function tryLlmRoute(
  ctx: FlowContext,
  message: string,
  history: string[],
): Promise<Reply | undefined> {
  // Cost / abuse guard: cap classification calls per user per hour.
  const allowed = await ctx.services.rateLimit.hit(
    `llm:${ctx.userId}`,
    config.llm.callsPerHour,
    60 * 60 * 1000,
  );
  if (!allowed) return undefined;

  let route;
  try {
    route = await classify(message, {
      state: ctx.session.state,
      langPref: readLangPref(ctx.session.data),
      history,
    });
  } catch {
    await ctx.services.analytics.track("llm:error", ctx.userId);
    return undefined;
  }

  if (route.kind === "action") {
    await ctx.services.analytics.track("llm:resolved", ctx.userId);
    const base = await routeWithQuery(ctx, route.action, route.query);
    return withGroundedAnswer(ctx, message, route.action, base, route.query);
  }

  if (route.kind === "clarify") {
    await ctx.services.analytics.track("llm:clarify", ctx.userId);
    const pref = readLangPref(ctx.session.data);
    const buttons: Button[] = route.candidates
      .slice(0, 3)
      .map((a) => ({ id: a, label: actionLabel(pref, a) }));
    // WhatsApp allows max 3 reply buttons; keep an escape hatch when there's room.
    if (buttons.length < 3) buttons.push(backButton(pref));
    return { text: L(pref, PH.clarifyPrompt), buttons };
  }

  await ctx.services.analytics.track("llm:fallback", ctx.userId);
  return undefined;
}

/** Handle a free-text message (mirrors the prototype's `onText`). */
export async function runText(ctx: FlowContext, raw: string): Promise<Reply> {
  const s = raw.trim();
  if (!s) return [];
  const l = s.toLowerCase();

  // Rolling short-term memory: the last few non-PII user messages, so the LLM
  // router can resolve follow-ups ("the earlier one", "yes send it"). Phone
  // numbers are never stored. `priorHistory` is the context BEFORE this message.
  const isPhoneLike = /^\+?[\d\s-]{10,14}$/.test(s);
  const priorHistory = ((ctx.session.data.history as string[] | undefined) ?? []).slice(-3);
  if (!isPhoneLike) {
    ctx.session.data = { ...ctx.session.data, history: [...priorHistory, s].slice(-3) };
  }

  // An explicit language word is always honored (also how the picker is answered by text).
  const chosen = languageChoice(s);
  if (chosen) return setLanguage(ctx, chosen);

  // First run: until a language is chosen, show the picker before anything else
  // and persist the choice for the rest of the conversation.
  if (ctx.session.data.langPref === undefined) {
    await ctx.services.analytics.track("use:lang-prompt", ctx.userId);
    return chooseLanguage(ctx);
  }

  if (GREETINGS.has(l)) {
    await ctx.services.analytics.track("use:menu", ctx.userId);
    return menu(ctx, { banner: true });
  }

  if (/^(help|\?|సహాయం|సాయం|సహాయము)$/i.test(s)) return help(ctx);

  // Human handoff: once the member tapped "Talk to coordinator" we're waiting
  // for their question — capture this message as the escalation. (Greetings /
  // help / language words above already provide an escape hatch.)
  if (ctx.session.state === "handoff") return escalationSubmit(ctx, s);

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
      await ctx.services.analytics.track("use:id", ctx.userId);
      return ctx.session.state === "id" ? idAsk(ctx) : idOffer(ctx);
    }
    // If the user ASKED about the content (not just navigated), add a grounded
    // summary on top of the normal flow reply.
    return withGroundedAnswer(ctx, s, intent, await runAction(ctx, intent));
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

  // Explicit ask for a person / to raise a complaint -> start the handoff. Runs
  // only after every content intent, number, and list selection above, so it
  // never pre-empts a normal query.
  if (wantsHuman(s)) return escalationStart(ctx);

  // LLM smart router: last resort before giving up. Only runs when enabled
  // (OPENAI_API_KEY set); never for phone-number-like text (already routed to
  // the ID lookup above, but guarded here too so PII never reaches OpenAI).
  if (config.llm.enabled && !isPhoneLike) {
    const routed = await tryLlmRoute(ctx, s, priorHistory);
    if (routed) return routed;
  }

  await ctx.services.analytics.track("use:unmatched", ctx.userId);
  const pref = readLangPref(ctx.session.data);
  const notUnderstood =
    pref === "both" ? `${t("te", "notUnderstood")}\n${t("en", "notUnderstood")}` : t(ctx.lang, "notUnderstood");
  // Dead-ends feel premium when there's a human on the other side: offer the
  // coordinator alongside the usual help / menu.
  return escalationOffer(ctx, notUnderstood);
}

export { pollResult };
