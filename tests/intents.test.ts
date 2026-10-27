import assert from "node:assert/strict";
import { test } from "node:test";

import { detectIntent } from "../src/services/intents.js";
import { wantsHuman } from "../src/flows/handoff.js";

test("detectIntent maps clear phrasings to the right action", () => {
  const cases: [string, string | undefined][] = [
    ["today's talking points", "tp"],
    ["yesterday talking points", "tp-y"],
    ["praja sankalpam", "ps"],
    ["tomorrow press meet", "pm-tmrw"],
    ["press meet schedule", "pm"],
    ["opinion polls", "poll"],
    ["check my id status", "id"],
    ["nearest office", "near"],
    ["show posters", "media-img"],
    ["reels", "media-reel"],
    ["jagan sir press meet", "jagan"],
    ["jagan press meet by topic", "j-topic"],
    ["random gibberish zzz", undefined],
    ["", undefined],
  ];
  for (const [msg, expected] of cases) {
    assert.equal(detectIntent(msg), expected, `message: ${JSON.stringify(msg)}`);
  }
});

test("detectIntent reads Telugu-script day words and loose English spellings", () => {
  assert.equal(detectIntent("రేపు ప్రెస్ మీట్"), "pm-tmrw");
  assert.equal(detectIntent("నిన్న టాకింగ్ పాయింట్స్"), "tp-y");
  assert.equal(detectIntent("pres meet timings"), "pm"); // typo tolerated, no day
});

test("wantsHuman only fires on an explicit human/complaint request", () => {
  const yes = [
    "I want to talk to a coordinator",
    "connect me to an agent",
    "I have a complaint",
    "need a real person",
    "కోఆర్డినేటర్‌తో మాట్లాడాలి",
    "naaku oka complaint undi",
  ];
  const no = ["today's talking points", "press meet", "show posters", "poll results", "hi"];
  for (const m of yes) assert.equal(wantsHuman(m), true, `should match: ${m}`);
  for (const m of no) assert.equal(wantsHuman(m), false, `should not match: ${m}`);
});
