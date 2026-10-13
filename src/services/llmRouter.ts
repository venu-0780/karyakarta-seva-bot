// -----------------------------------------------------------------------------
// LLM smart router (OpenAI).
//
// A classifier ONLY. Given a free-text message the deterministic regex matcher
// (intents.ts) could not resolve, it returns one of the known flow actions, a
// short list of candidate actions to clarify between, or "unknown". It NEVER
// generates content and NEVER answers the user's question — all outcomes still
// come from the trusted repositories via the existing flows.
//
// Safety properties:
//   - Output is constrained to the INTENT_ACTIONS enum via a strict JSON schema,
//     so the model physically cannot emit anything outside the known flows.
//   - No PII: the caller never passes phone numbers / membership data; only the
//     message text plus coarse context (conversation state + language pref).
//   - Fully inert when OPENAI_API_KEY is unset (see config.llm.enabled).
//   - Hard timeout via AbortController; retries disabled. Errors propagate so
//     the caller can fail OPEN to the normal "didn't understand" reply.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { getOpenAI } from "./openai.js";
import { INTENT_ACTIONS, type IntentAction } from "./intents.js";
import type { LangPref } from "./i18n.js";

/** What the router resolved a message to. */
export type RouteResult =
  | { kind: "action"; action: IntentAction; query?: string }
  | { kind: "clarify"; candidates: IntentAction[] }
  | { kind: "unknown" };

export interface RouteContext {
  /** Current conversation state (e.g. "idle", "id", `poll:<id>`). No PII. */
  state: string;
  langPref: LangPref;
  /** Recent prior user messages (oldest first) for follow-up resolution. No PII. */
  history?: string[];
}

const VALID = new Set<string>(INTENT_ACTIONS);

const SYSTEM_PROMPT = [
  "You are the intent router for a WhatsApp helpdesk bot (a civic/party karyakarta",
  "helpdesk). Messages are in Telugu, English, or a mix (often transliterated",
  "Telugu in Latin letters), and may contain typos.",
  "",
  "Classify the user's message into exactly ONE of these actions. Do NOT answer the",
  "question, summarize anything, or produce any political/party content — only pick",
  "the action that routes them to the right flow.",
  "",
  "Actions:",
  "- tp        : today's daily talking points",
  "- tp-y      : yesterday's talking points",
  "- ps        : today's 'Praja Sankalpam' evening paper",
  "- ps-y      : yesterday's Praja Sankalpam",
  "- pm        : press meet schedule (menu of days)",
  "- pm-today  : today's press meets",
  "- pm-tmrw   : tomorrow's press meets",
  "- pm-yday   : yesterday's press meets",
  "- jagan     : the leader's ('Jagan sir') press meets, latest",
  "- j-date    : leader's press meets browsed BY DATE",
  "- j-topic   : leader's press meets browsed BY TOPIC",
  "- poll      : opinion polls (vote / see results)",
  "- id        : membership / ID card status lookup",
  "- media     : posters AND reels (generic media menu)",
  "- media-img : posters / images / photos only",
  "- media-reel: reels / short videos only",
  "",
  "Rules:",
  "- If the message clearly maps to one action, set action to that value and leave",
  "  candidates empty.",
  "- If it plausibly maps to 2 or 3 actions, set action to \"clarify\" and list those",
  "  2-3 actions in candidates (most likely first).",
  "- If it is a greeting, chit-chat, nonsense, or unrelated, set action to",
  "  \"unknown\".",
  "- Never invent an action that is not in the list.",
  "- query: if the user names a SPECIFIC subject/topic (e.g. farmers, pensions,",
  "  floods) or a specific poster/scheme (e.g. rice, electricity), put that short",
  "  keyword in `query` so the bot can jump straight to it. Otherwise set query to",
  "  null. Keep it to the salient noun; do not translate it.",
  "- Use recent_messages only to interpret follow-ups (e.g. \"the earlier one\",",
  "  \"show that\", \"yes\"); never route to something the user did not ask for.",
  "",
  "Examples (message -> JSON):",
  '  "ivala jagan anna press meet" -> {"action":"jagan","candidates":[],"query":null}',
  '  "jagan farmers meeting chudali" -> {"action":"j-topic","candidates":[],"query":"farmers"}',
  '  "pension gurinchi leader em cheppadu" -> {"action":"j-topic","candidates":[],"query":"pensions"}',
  '  "rice poster kaavali" -> {"action":"media-img","candidates":[],"query":"rice"}',
  '  "free current reel pampu" -> {"action":"media-reel","candidates":[],"query":"electricity"}',
  '  "repati press meet schedule" -> {"action":"pm-tmrw","candidates":[],"query":null}',
  '  "ninnati sankalpam paper" -> {"action":"ps-y","candidates":[],"query":null}',
  '  "naa membership card status" -> {"action":"id","candidates":[],"query":null}',
  '  "ivala em cheppali janalaki" -> {"action":"tp","candidates":[],"query":null}',
  '  "update kaavali" -> {"action":"clarify","candidates":["tp","ps","pm"],"query":null}',
  '  "thanks anna" -> {"action":"unknown","candidates":[],"query":null}',
].join("\n");

// Strict JSON schema: `action` is the enum of real actions plus the two control
// values; `candidates` is only populated when action === "clarify".
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [...INTENT_ACTIONS, "clarify", "unknown"],
    },
    candidates: {
      type: "array",
      items: { type: "string", enum: [...INTENT_ACTIONS] },
    },
    // Optional refinement keyword (nullable to satisfy strict structured output).
    query: { type: ["string", "null"] },
  },
  required: ["action", "candidates", "query"],
} as const;

function toActions(values: unknown): IntentAction[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: IntentAction[] = [];
  for (const v of values) {
    if (typeof v === "string" && VALID.has(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v as IntentAction);
    }
  }
  return out;
}

/**
 * Pure decision logic: turn the model's raw JSON content into a RouteResult.
 * Separated from the network call so it can be unit-tested, and so a malformed
 * / out-of-enum response always degrades to a safe `unknown`. Exported for tests.
 */
export function parseRoute(raw: string | null | undefined): RouteResult {
  if (!raw) return { kind: "unknown" };
  let parsed: { action?: unknown; candidates?: unknown; query?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "unknown" };
  }
  const action = typeof parsed.action === "string" ? parsed.action : "unknown";
  const query =
    typeof parsed.query === "string" && parsed.query.trim() ? parsed.query.trim() : undefined;
  if (VALID.has(action)) return { kind: "action", action: action as IntentAction, query };
  if (action === "clarify") {
    const candidates = toActions(parsed.candidates);
    return candidates.length ? { kind: "clarify", candidates } : { kind: "unknown" };
  }
  return { kind: "unknown" };
}

/**
 * Classify a free-text message into a route. Throws on API/network/timeout
 * errors (the caller catches and falls back); only returns `unknown` when the
 * model itself declines to route.
 */
export async function classify(message: string, ctx: RouteContext): Promise<RouteResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), config.llm.timeoutMs);
  const historyBlock = ctx.history?.length
    ? `recent_messages (oldest first): ${ctx.history.join(" | ")}\n`
    : "";
  try {
    const res = await getOpenAI().chat.completions.create(
      {
        model: config.llm.model,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `${historyBlock}conversation_state: ${ctx.state}\nlanguage_pref: ${ctx.langPref}\nmessage: ${message}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "route", strict: true, schema: SCHEMA },
        },
      },
      { signal: ac.signal },
    );

    return parseRoute(res.choices[0]?.message?.content);
  } finally {
    clearTimeout(timer);
  }
}
