import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRoute } from "../src/services/llmRouter.js";

test("parseRoute resolves a clean action", () => {
  const r = parseRoute('{"action":"tp","candidates":[],"query":null}');
  assert.deepEqual(r, { kind: "action", action: "tp", query: undefined });
});

test("parseRoute trims a refinement query", () => {
  const r = parseRoute('{"action":"j-topic","candidates":[],"query":"  farmers  "}');
  assert.deepEqual(r, { kind: "action", action: "j-topic", query: "farmers" });
});

test("parseRoute returns clarify with only valid, de-duped candidates", () => {
  const r = parseRoute('{"action":"clarify","candidates":["tp","ps","tp","bogus"],"query":null}');
  assert.deepEqual(r, { kind: "clarify", candidates: ["tp", "ps"] });
});

test("parseRoute degrades to unknown for every unsafe/empty case", () => {
  assert.deepEqual(parseRoute('{"action":"clarify","candidates":["nope"],"query":null}'), { kind: "unknown" });
  assert.deepEqual(parseRoute('{"action":"unknown","candidates":[],"query":null}'), { kind: "unknown" });
  assert.deepEqual(parseRoute('{"action":"not_a_real_action"}'), { kind: "unknown" });
  assert.deepEqual(parseRoute("not json at all"), { kind: "unknown" });
  assert.deepEqual(parseRoute(""), { kind: "unknown" });
  assert.deepEqual(parseRoute(null), { kind: "unknown" });
});

test("parseRoute never emits an action outside the known enum", () => {
  // Even if the model also returns candidates, a valid action wins as an action.
  const r = parseRoute('{"action":"media-reel","candidates":["tp"],"query":""}');
  assert.equal(r.kind, "action");
  assert.equal((r as { action: string }).action, "media-reel");
});
