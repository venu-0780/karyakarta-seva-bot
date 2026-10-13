import assert from "node:assert/strict";
import { test } from "node:test";

import type { Poll } from "../src/data/repository.js";
import { decodeChartData, encodeChartData, pollChartModel, pollChartUrl } from "../src/services/pollChart.js";

const poll: Poll = { id: "p9", q: "Best scheme?", opts: ["Rice", "Housing"], votes: [3, 1] };

test("pollChartModel computes totals, percentages, and the user's pick", () => {
  const m = pollChartModel(poll, 0);
  assert.equal(m.total, 4);
  assert.equal(m.options[0]!.pct, 75);
  assert.equal(m.options[0]!.mine, true);
  assert.equal(m.options[1]!.pct, 25);
  assert.equal(m.options[1]!.mine, false);
});

test("pollChartModel handles zero votes without dividing by zero", () => {
  const m = pollChartModel({ id: "z", q: "Q", opts: ["A", "B"], votes: [0, 0] }, null);
  assert.equal(m.total, 0);
  assert.equal(m.options[0]!.pct, 0);
  assert.ok(m.options.every((o) => !o.mine));
});

test("encode/decode round-trips the snapshot", () => {
  const decoded = decodeChartData(encodeChartData(poll, 1));
  assert.ok(decoded);
  assert.equal(decoded!.q, "Best scheme?");
  assert.equal(decoded!.options[1]!.mine, true);
  assert.equal(decoded!.total, 4);
});

test("decodeChartData rejects missing/garbage payloads", () => {
  assert.equal(decodeChartData(""), undefined);
  assert.equal(decodeChartData(null), undefined);
  assert.equal(decodeChartData("@@@not-base64@@@"), undefined);
});

test("pollChartUrl builds an absolute, decodable image URL", () => {
  const url = pollChartUrl("https://bot.example.com/", poll, 0);
  assert.match(url, /^https:\/\/bot\.example\.com\/api\/chart\/poll\/p9\?d=/);
  const d = new URL(url).searchParams.get("d");
  assert.ok(decodeChartData(d));
});
