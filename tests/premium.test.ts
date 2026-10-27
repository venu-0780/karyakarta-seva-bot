import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { menu } from "../src/flows/menu.js";
import { nearestOffice } from "../src/flows/nearest.js";
import { completeForm } from "../src/flows/forms.js";
import { docResponse } from "../src/flows/talkingPoints.js";
import { memoryDeliveryCounts, parseStatusUpdates, recordDeliveries } from "../src/services/delivery.js";
import { whatsAppCtaPayload, whatsAppLocationRequestPayload } from "../src/render/whatsapp.js";
import { makeContext } from "./helpers.js";

test("whatsAppCtaPayload requires an https link and an https header", () => {
  const payload = whatsAppCtaPayload({
    text: "Watch",
    linkButton: {
      label: "Watch full video",
      url: "https://www.youtube.com/watch?v=abc",
      header: { type: "image", url: "https://example.com/leader.jpg" },
    },
  }) as any;
  assert.equal(payload.type, "cta_url");
  assert.equal(payload.header.image.link, "https://example.com/leader.jpg");
  assert.equal(payload.action.parameters.display_text, "Watch full video");
  assert.equal(
    whatsAppCtaPayload({ linkButton: { label: "Open", url: "https://example.com" } }),
    undefined,
  );
});

test("location request payload is a send_location action", () => {
  const payload = whatsAppLocationRequestPayload("Share where you are") as any;
  assert.equal(payload.type, "location_request_message");
  assert.equal(payload.action.name, "send_location");
  assert.match(payload.body.text, /Share where you are/);
});

test("nearest office picks Kadapa for a Kadapa pin", () => {
  const { office, km } = nearestOffice(14.47, 78.82);
  assert.equal(office.name, "YSRCP Kadapa District Office");
  assert.ok(km < 5);
});

test("docResponse leads with an audio bubble when the edition has one", () => {
  const reply = docResponse(
    "en",
    {
      file: "brief.pdf",
      pages: 1,
      size: "1 KB",
      lang: "English",
      link: "https://example.com/brief",
      head: "Headline",
      audioUrl: "https://example.com/brief.mp3",
    },
    "Brief",
    [],
  );
  assert.ok(Array.isArray(reply));
  assert.equal(reply[0]?.audio?.url, "https://example.com/brief.mp3");
});

test("menu still fits a WhatsApp list after the nearest-office row", async () => {
  for (const lang of ["en", "te"] as const) {
    const reply = await menu(makeContext({ lang }));
    const one = Array.isArray(reply) ? reply[reply.length - 1] : reply;
    const rows = one?.list?.sections.flatMap((section) => section.rows) ?? [];
    assert.equal(rows.length, 10);
    assert.ok(rows.some((row) => row.id === "near"));
    const coordinator = rows.find((row) => row.id === "handoff");
    assert.ok(coordinator, "coordinator help is a menu row");
    assert.ok((coordinator?.title.length ?? 99) <= 24, coordinator?.title);
  }
});

test("parseStatusUpdates reads sent, delivered, read, and failed", () => {
  const raw = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { id: "wamid.1", status: "delivered", recipient_id: "15550001111" },
                { id: "wamid.2", status: "failed", errors: [{ title: "Rate limited" }] },
                { id: "wamid.3", status: "not-a-status" },
              ],
            },
          },
        ],
      },
    ],
  });
  const updates = parseStatusUpdates(raw);
  assert.equal(updates.length, 2);
  assert.equal(updates[1]?.error, "Rate limited");
});

test("delivery counters ignore a repeated status", async () => {
  const update = { id: `wamid.test.${Date.now()}`, status: "read" as const, recipient: "1" };
  await recordDeliveries([update]);
  await recordDeliveries([update]);
  assert.equal(memoryDeliveryCounts().read, 1);
});

test("feedback completion stores a ticket and confirms", async () => {
  const ctx = makeContext();
  const reply = await completeForm(ctx, "feedback", {
    category: "complaint",
    details: "The road is still broken",
    callback: "whatsapp",
  });
  const text = Array.isArray(reply) ? reply[0]?.text : reply?.text;
  assert.match(text ?? "", /Thank you/);
  const tickets = await ctx.services.escalation.recent();
  assert.equal(tickets.length, 1);
  assert.match(tickets[0]?.query ?? "", /road is still broken/);
  const saved = await ctx.services.submissions.recent();
  assert.equal(saved[0]?.kind, "feedback");
});

test("form copy follows the language the user set", async () => {
  const { idFormData, pollFormData, feedbackFormData, eventFormData, membershipFormData, surveyFormData } =
    await import("../src/flows/formText.js");
  const telugu = /[\u0C00-\u0C7F]/;
  const packs = [idFormData, pollFormData, feedbackFormData, eventFormData, membershipFormData, surveyFormData];
  for (const pack of packs) {
    const en = JSON.stringify(pack("en"));
    const te = JSON.stringify(pack("te"));
    assert.equal(telugu.test(en), false);
    assert.equal(telugu.test(te), true);
    assert.doesNotMatch(te, / \/ /);
  }
  assert.match(String(feedbackFormData("both").intro), /\n/);
});

test("published flow JSON files are multi-screen where designed and have a terminal screen", async () => {
  for (const name of ["feedback.json", "event-register.json", "membership.json", "survey.json"]) {
    const json = JSON.parse(await readFile(new URL(`../flows-json/${name}`, import.meta.url), "utf8"));
    assert.equal(json.version, "7.3");
    assert.ok(json.screens.length >= 2, name);
    assert.ok(json.screens.some((screen: { terminal?: boolean }) => screen.terminal), name);
  }
});
