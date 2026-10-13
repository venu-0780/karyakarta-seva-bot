// -----------------------------------------------------------------------------
// Offline accuracy harness for the LLM smart router (src/services/llmRouter.ts).
//
// Runs a set of labeled real-world phrasings (Telugu, English, transliterated,
// typos, ambiguous) through BOTH the deterministic regex matcher and the LLM
// router, and prints how each does. Use it to measure the lift the LLM gives on
// messages the regexes miss, and to catch regressions after prompt/model edits.
//
// This is a manual dev tool — it is NOT on the request path and makes real
// OpenAI calls, so it requires OPENAI_API_KEY.
//
// Run: npm run eval-router
// -----------------------------------------------------------------------------
import { config } from "../src/config.js";
import { detectIntent } from "../src/services/intents.js";
import { classify, type RouteResult } from "../src/services/llmRouter.js";

/** `expect` is the ideal LLM outcome: an action, "clarify", or "unknown". */
interface Case {
  msg: string;
  expect: string;
  note?: string;
}

const CASES: Case[] = [
  // --- Clear intents the regexes already handle (LLM should agree) ----------
  { msg: "today's talking points", expect: "tp" },
  { msg: "నేటి టాకింగ్ పాయింట్స్", expect: "tp" },
  { msg: "show me posters", expect: "media-img" },
  { msg: "opinion polls", expect: "poll" },
  { msg: "check my id status", expect: "id" },

  // --- Transliterated / code-mixed Telugu the regexes tend to miss ----------
  { msg: "ivala jagan anna press meet unda", expect: "jagan" },
  { msg: "poster kaavali election campaign ki", expect: "media-img" },
  { msg: "naa membership card ela track cheyyali", expect: "id" },
  { msg: "repati press meetings schedule enti", expect: "pm-tmrw" },
  { msg: "sankalpam paper ninna di kaavali", expect: "ps-y" },
  { msg: "jagan sir ni topic wise meetings choopinchu", expect: "j-topic" },
  { msg: "reels pampu whatsapp lo pettadaniki", expect: "media-reel" },

  // --- Deep-link: a specific subject/poster -> jump straight there ----------
  { msg: "jagan farmers meeting chudali", expect: "j-topic", note: "query=farmers" },
  { msg: "pension gurinchi leader em cheppadu", expect: "j-topic", note: "query=pensions" },
  { msg: "rice poster kaavali", expect: "media-img", note: "query=rice" },
  { msg: "free current reel pampu", expect: "media-reel", note: "query=electricity" },

  // --- Typos / loose phrasing -----------------------------------------------
  { msg: "talkng points for 2day", expect: "tp" },
  { msg: "wat to say to ppl today", expect: "tp" },
  { msg: "pres meet timings", expect: "pm" },

  // --- Ambiguous: should ask to clarify -------------------------------------
  { msg: "update kaavali", expect: "clarify", note: "could be tp / ps / pm" },
  { msg: "jagan sir", expect: "clarify", note: "leader meets vs by-date/topic" },
  { msg: "anything new today", expect: "clarify" },

  // --- Off-topic: should decline (unknown) ----------------------------------
  { msg: "thank you so much", expect: "unknown" },
  { msg: "what's the weather", expect: "unknown" },
];

function describe(r: RouteResult): string {
  if (r.kind === "action") return r.query ? `${r.action}(${r.query})` : r.action;
  if (r.kind === "clarify") return `clarify[${r.candidates.join(",")}]`;
  return "unknown";
}

function pass(r: RouteResult, expect: string): boolean {
  if (expect === "clarify") return r.kind === "clarify";
  if (expect === "unknown") return r.kind === "unknown";
  return r.kind === "action" && r.action === expect;
}

async function main() {
  if (!config.llm.enabled) {
    console.error("OPENAI_API_KEY is not set — set it in .env to run the eval.");
    process.exit(1);
  }

  console.log(`\nLLM router eval · model=${config.llm.model}\n`);
  const pad = Math.max(...CASES.map((c) => c.msg.length));
  let llmHits = 0;
  let regexHits = 0;

  for (const c of CASES) {
    const regex = detectIntent(c.msg);
    const regexStr = regex ?? "—";
    const regexOk = c.expect !== "clarify" && c.expect !== "unknown" && regex === c.expect;
    if (regexOk) regexHits++;

    let route: RouteResult;
    try {
      route = await classify(c.msg, { state: "idle", langPref: "both" });
    } catch (err) {
      console.log(`✗ ${c.msg.padEnd(pad)}  LLM error: ${(err as Error).message}`);
      continue;
    }
    const ok = pass(route, c.expect);
    if (ok) llmHits++;

    const mark = ok ? "✓" : "✗";
    console.log(
      `${mark} ${c.msg.padEnd(pad)}  want=${c.expect.padEnd(10)} llm=${describe(route).padEnd(16)} regex=${regexStr}`,
    );
  }

  console.log(
    `\nLLM:   ${llmHits}/${CASES.length} correct` +
      `\nRegex: ${regexHits}/${CASES.length} correct (clarify/unknown cases not scored for regex)\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
