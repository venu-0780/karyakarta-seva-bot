// -----------------------------------------------------------------------------
// Grounded answer generator.
//
// Turns a user's question into a short natural-language answer built STRICTLY
// from facts the caller already fetched out of the trusted repositories. This
// is the one place the LLM produces prose, so it is tightly fenced:
//   - It may only use the provided FACTS. It must not add names, numbers, dates,
//     promises, or any political claim that isn't in the facts.
//   - If the facts don't contain the answer, it says so briefly rather than
//     guessing — the normal flow reply (document / list / links) still follows.
//   - The source material (PDF, video links, schedule) is always attached by the
//     caller, so the answer is a convenience layer over verifiable content.
//
// Fails OPEN: on timeout/error/empty it returns undefined and the caller simply
// shows the flow reply without a summary.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { getOpenAI } from "./openai.js";
import type { LangPref } from "./i18n.js";

function languageName(pref: LangPref): string {
  if (pref === "en") return "English";
  if (pref === "te") return "Telugu";
  return "Telugu first, then the same in English";
}

const SYSTEM = [
  "You are a concise assistant for a civic/community WhatsApp helpdesk.",
  "Answer the user's question using ONLY the FACTS provided below the question.",
  "Hard rules:",
  "- Use only the given facts. Never invent or infer names, numbers, dates,",
  "  venues, promises, or any political claim that is not explicitly in the facts.",
  "- If the facts do not contain the answer, say briefly that you don't have that",
  "  detail and suggest tapping one of the options shown. Do not guess.",
  "- Keep it to 1-3 short sentences. Plain text, no headings, minimal emoji.",
  "- Do not include links or file names; the message already attaches them.",
].join("\n");

/**
 * Generate a grounded answer, or undefined when the model can't/shouldn't answer
 * or the call fails. `facts` must be plain text already extracted from the repos.
 */
export async function groundedAnswer(
  question: string,
  facts: string,
  pref: LangPref,
): Promise<string | undefined> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), config.llm.timeoutMs);
  try {
    const res = await getOpenAI().chat.completions.create(
      {
        model: config.llm.model,
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Reply in ${languageName(pref)}.\n\nQUESTION: ${question}\n\nFACTS:\n${facts}`,
          },
        ],
      },
      { signal: ac.signal },
    );
    const text = res.choices[0]?.message?.content?.trim();
    return text ? text : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
