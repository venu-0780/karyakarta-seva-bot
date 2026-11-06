import assert from "node:assert/strict";
import { test } from "node:test";

import { runAction, runText } from "../src/router.js";
import type { BotResponse, Reply } from "../src/types.js";
import { makeContext } from "./helpers.js";
import { sampleDate } from "../src/data/sample.js";

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
  // Headers use "Sat, 7 Nov"; sampleDate is zero-padded "07 Nov 2026".
  const [dd, mon] = sampleDate("tmrw").split(" ");
  assert.match(allText(reply), new RegExp(`Tomorrow · .*, ${Number(dd)} ${mon}`));
});

test("a phone number triggers the ID lookup, masked when it is someone else's", async () => {
  const ctx = makeContext();
  const reply = await runText(ctx, "9876543210");
  assert.match(allText(reply), /K\. R\*\*\* K\*\*\*\*/);
  assert.match(allText(reply), /Dispatched/);
  assert.doesNotMatch(allText(reply), /Ravi Kumar/);
});

test("the sender's own number shows the full name and member ID", async () => {
  const ctx = makeContext();
  ctx.userId = "919876543210";
  const reply = await runAction(ctx, "id-me");
  assert.match(allText(reply), /K\. Ravi Kumar/);
  assert.match(allText(reply), /YSR-GNT-204871/);
});

test("the ID menu item asks for the number straight away and offers My number", async () => {
  const ctx = makeContext();
  ctx.userId = "919876543210";
  const reply = await runAction(ctx, "id");
  assert.equal(ctx.session.state, "id");
  assert.ok(allButtonIds(reply).includes("id-me"));
});

test("a short navigation phrase leaves the handoff; a long message is filed", async () => {
  const ctx = makeContext();
  await runText(ctx, "I want to talk to a coordinator");
  const nav = await runText(ctx, "press meet");
  assert.notEqual(ctx.session.state, "handoff");
  assert.ok(allButtonIds(nav).includes("pm-today"));

  await runText(ctx, "I want to talk to a coordinator");
  const filed = await runText(ctx, "the press meet venue in Guntur had no water or seating for anyone");
  assert.equal(ctx.session.state, "idle");
  assert.match(allText(filed), /Ticket: \*#[A-Z0-9]+\*/);
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
