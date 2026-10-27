import assert from "node:assert/strict";
import { test } from "node:test";

import { runAction, runText } from "../src/router.js";
import type { BotResponse, Reply } from "../src/types.js";
import { makeContext } from "./helpers.js";

const arr = (r: Reply): BotResponse[] => (Array.isArray(r) ? r : [r]);
const allText = (r: Reply): string =>
  arr(r)
    .map((x) => x.text ?? "")
    .join("\n");
const allButtonIds = (r: Reply): string[] => arr(r).flatMap((x) => (x.buttons ?? []).map((b) => b.id));

test("greeting shows the welcome banner + menu list", async () => {
  const ctx = makeContext();
  const reply = arr(await runText(ctx, "hi"));
  assert.ok(reply.some((r) => r.media?.length), "has a hero image");
  assert.ok(reply.some((r) => r.list), "has the menu list");
});

test("greeting uses the WhatsApp profile name when one was saved", async () => {
  const ctx = makeContext({ data: { displayName: "Ravi Kumar" } });
  const reply = arr(await runText(ctx, "hi"));
  const caption = reply.find((r) => r.media?.length)?.media?.[0]?.caption ?? "";
  assert.match(caption, /Welcome, \*Ravi Kumar\*, to the \*Praja Seva Helpdesk\*/);
});

test("numeric shortcut 3 opens the press-meet day picker", async () => {
  const ctx = makeContext();
  const reply = await runText(ctx, "3");
  assert.ok(allButtonIds(reply).includes("pm-today"));
});

test("natural language 'tomorrow press meet' deep-links to tomorrow", async () => {
  const ctx = makeContext();
  const reply = await runText(ctx, "tomorrow press meet");
  assert.match(allText(reply), /Sat, 10 Oct/);
});

test("a phone number triggers the ID lookup", async () => {
  const ctx = makeContext();
  const reply = await runText(ctx, "9876543210");
  assert.match(allText(reply), /K\. Ravi Kumar/);
});

test("unmatched text offers the coordinator handoff", async () => {
  const ctx = makeContext();
  const reply = await runText(ctx, "qwzzx nonsense");
  assert.ok(allButtonIds(reply).includes("handoff"), "offers handoff button");
});

test("explicit 'talk to a coordinator' starts the handoff and sets state", async () => {
  const ctx = makeContext();
  const reply = await runText(ctx, "I want to talk to a coordinator");
  assert.equal(ctx.session.state, "handoff");
  assert.match(allText(reply).toLowerCase(), /coordinator/);
});

test("a message in the handoff state files a ticket and resets to idle", async () => {
  const ctx = makeContext({ state: "handoff" });
  const q = "My pension has not come for 3 months";
  const reply = await runText(ctx, q);
  assert.equal(ctx.session.state, "idle");
  const tickets = await ctx.services.escalation.recent();
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0]!.query, q);
  assert.equal(tickets[0]!.userId, ctx.userId);
  // Member gets a confirmation + the helpline contact card.
  assert.ok(arr(reply).some((r) => r.contacts?.length), "attaches helpline contact");
});

test("voting returns a thank-you, a chart image, and exact numbers", async () => {
  const ctx = makeContext();
  const reply = arr(await runAction(ctx, "vote-p1-0"));
  assert.match(allText(reply), /Thank you/i);
  const chart = reply.find((r) => r.media?.some((m) => m.url?.includes("/api/chart/poll/p1")));
  assert.ok(chart, "includes the poll chart image");
  // Voting again is rejected (one vote per user).
  const second = arr(await runAction(ctx, "vote-p1-1"));
  assert.match(allText(second), /already voted/i);
});
