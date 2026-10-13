import assert from "node:assert/strict";
import { test } from "node:test";

import { createSampleRepositories } from "../src/data/sample.js";
import type { MembershipRecord } from "../src/data/repository.js";
import {
  READY_STAGE,
  idReadyAlertText,
  liveMeetAlertText,
  liveMeets,
  membersReadyToCollect,
} from "../src/services/alerts.js";

test("liveMeets finds press meets currently marked LIVE", async () => {
  const { content } = createSampleRepositories();
  const live = await liveMeets(content);
  assert.ok(live.length >= 1, "sample data has a live meet");
  assert.ok(live.every((l) => l.meet.status === "live"));
  assert.match(liveMeetAlertText(live[0]!), /LIVE now/);
});

test("membersReadyToCollect selects only final-stage cards", () => {
  const base = { name: "X", mid: "M", ac: "AC", where: "office" };
  const records: MembershipRecord[] = [
    { ...base, stage: READY_STAGE },
    { ...base, stage: READY_STAGE - 1 },
    { ...base, stage: 0 },
  ];
  const ready = membersReadyToCollect(records);
  assert.equal(ready.length, 1);
  assert.equal(ready[0]!.stage, READY_STAGE);
  assert.match(idReadyAlertText(ready[0]!), /ready to collect/i);
});
