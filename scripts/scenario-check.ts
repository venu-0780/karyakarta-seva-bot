// -----------------------------------------------------------------------------
// Local scenario walk. Runs every user-facing path through the router and the
// renderer with in-memory stores. No WhatsApp send, no Redis, no OpenAI.
//
// Run: npx tsx scripts/scenario-check.ts
// -----------------------------------------------------------------------------
import type { BotResponse, Reply } from "../src/types.js";
import type { PostableThread, PostPayload } from "../src/render/whatsapp.js";

process.env.FEEDBACK_FLOW_ID = "flow-feedback";
process.env.EVENT_FLOW_ID = "flow-event";
process.env.MEMBERSHIP_FLOW_ID = "flow-membership";
process.env.SURVEY_FLOW_ID = "flow-survey";
process.env.CHART_IMAGES = "1";
delete process.env.REDIS_URL;
delete process.env.OPENAI_API_KEY;
delete process.env.WHATSAPP_ACCESS_TOKEN;

const { runAction, runText } = await import("../src/router.js");
const { completeForm } = await import("../src/flows/forms.js");
const { nearestFromPin } = await import("../src/flows/nearest.js");
const { render, whatsAppButtonPayload, whatsAppListPayload, whatsAppCtaPayload } = await import(
  "../src/render/whatsapp.js"
);
const { makeContext } = await import("../tests/helpers.js");
const { config } = await import("../src/config.js");

const failures: string[] = [];
let passed = 0;

function arr(reply: Reply): BotResponse[] {
  return Array.isArray(reply) ? reply : [reply];
}
function textOf(reply: Reply): string {
  return arr(reply)
    .map((item) => item.text ?? "")
    .join("\n");
}
function idsOf(reply: Reply): string[] {
  return arr(reply).flatMap((item) => [
    ...(item.buttons ?? []).map((button) => button.id),
    ...(item.list?.sections.flatMap((section) => section.rows.map((row) => row.id)) ?? []),
  ]);
}
function rowsOf(reply: Reply): number {
  return arr(reply).reduce(
    (count, item) => count + (item.list?.sections.flatMap((section) => section.rows).length ?? 0),
    0,
  );
}

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function paint(reply: Reply): Promise<void> {
  const posts: (PostPayload | string)[] = [];
  const thread: PostableThread = {
    id: "scenario",
    async post(payload) {
      posts.push(payload);
    },
  };
  await render(thread, reply, { inboundMessageId: "wamid.scenario" });
  if (posts.length === 0 && arr(reply).every((item) => !item.text && !item.list && !item.buttons && !item.flow)) {
    throw new Error("renderer produced nothing");
  }
}

async function scenario(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
}

console.log(`Graph API default: ${config.whatsapp.graphVersion}`);
check("graph version is v26.0", config.whatsapp.graphVersion === "v26.0");

await scenario("first visit asks for a language", async () => {
  const ctx = makeContext({ data: {} });
  ctx.session.data = {};
  const reply = await runText(ctx, "hi");
  check("language picker", idsOf(reply).includes("lang-en") && idsOf(reply).includes("lang-te"));
  await paint(reply);
});

await scenario("english selection confirms and opens the menu", async () => {
  const ctx = makeContext({ data: {} });
  ctx.session.data = {};
  const reply = await runAction(ctx, "lang-en");
  check("language reaction", arr(reply).some((item) => item.reactionEmoji === "👍"));
  check("menu has 10 rows including nearest office", rowsOf(reply) === 10 && idsOf(reply).includes("near"));
  await paint(reply);
});

const user = () => makeContext({ lang: "en" });

await scenario("greeting banner", async () => {
  const reply = await runText(user(), "hi");
  check("welcome image", arr(reply).some((item) => item.media?.some((media) => media.kind === "image")));
  await paint(reply);
});

await scenario("help shows the helpline and the office pin", async () => {
  const reply = await runText(user(), "help");
  check("helpline card", arr(reply).some((item) => (item.contacts?.length ?? 0) > 0));
  check("office pin", arr(reply).some((item) => item.location?.name?.includes("Central Office")));
  check("help mentions nearest office", /nearest office/i.test(textOf(reply)));
  await paint(reply);
});

await scenario("numeric shortcuts 1 to 7", async () => {
  const labels = ["talking", "sankalpam", "press", "leader", "poll", "id card", "poster"];
  for (let n = 1; n <= 7; n += 1) {
    const reply = await runText(user(), String(n));
    check(`shortcut ${n}`, new RegExp(labels[n - 1]!, "i").test(textOf(reply)));
    await paint(reply);
  }
});

await scenario("talking points and yesterday", async () => {
  const today = await runAction(user(), "tp");
  check("today's points", /talking points/i.test(textOf(today)));
  const yday = await runAction(user(), "tp-y");
  check("yesterday's points", /yesterday/i.test(textOf(yday)) || /08 Oct/.test(textOf(yday)));
  await paint(today);
  await paint(yday);
});

await scenario("praja sankalpam", async () => {
  const reply = await runText(user(), "praja sankalpam");
  check("evening paper", /praja sankalpam/i.test(textOf(reply)));
  await paint(reply);
});

await scenario("press meets for three days and registration form", async () => {
  for (const day of ["pm-today", "pm-tmrw", "pm-yday"] as const) {
    const reply = await runAction(user(), day);
    check(`${day} schedule`, /press|LIVE|Upcoming|Recording|No press/i.test(textOf(reply)));
    check(`${day} registration form`, arr(reply).some((item) => item.flow?.token === "event"));
    await paint(reply);
  }
});

await scenario("leader press meets", async () => {
  const hub = await runAction(user(), "jagan");
  check("leader hub", idsOf(hub).includes("j-date") && idsOf(hub).includes("jm-j0"));
  const byDate = await runAction(user(), "j-date");
  check("by date list", idsOf(byDate).includes("jm-j0"));
  const meet = await runAction(user(), "jm-j0");
  const card = arr(meet).find((item) => item.linkButton);
  check("watch link has an image header", card?.linkButton?.header?.type === "image");
  check("cta payload builds", Boolean(card && whatsAppCtaPayload(card)));
  const byTopic = await runAction(user(), "j-topic");
  check("topics listed", (arr(byTopic)[0]?.list?.sections[0]?.rows.length ?? 0) > 0);
  await paint(hub);
  await paint(meet);
});

await scenario("poll vote, chart, one-vote rule, and survey offer", async () => {
  const list = await runAction(user(), "poll");
  check("poll list", idsOf(list).includes("poll-p1"));
  const open = await runAction(user(), "poll-p1");
  check("vote buttons", idsOf(open).includes("vote-p1-0"));
  const voted = await runAction(user(), "vote-p1-0");
  check("thank-you reaction", arr(voted).some((item) => item.reactionEmoji === "✅"));
  check("chart image", arr(voted).some((item) => item.media?.some((media) => media.url?.includes("/api/chart/poll/"))));
  check("survey offer", idsOf(voted).includes("survey"));
  const again = await runAction(user(), "vote-p1-1");
  check("second vote blocked", /already voted/i.test(textOf(again)));
  await paint(voted);
});

await scenario("id card found, ready to collect, missing, and invalid", async () => {
  const offer = await runText(user(), "check my id status");
  check("id confirm step", idsOf(offer).includes("id-yes"));
  const found = await runText(user(), "9876543210");
  check("found member", /Ravi Kumar/.test(textOf(found)) && arr(found).some((item) => item.reactionEmoji === "✅"));
  const ready = await runText(user(), "9000000001");
  check("collection pin", arr(ready).some((item) => item.location?.name?.includes("Kadapa")));
  const missing = await runText(user(), "9999999999");
  check("missing offers apply", /no membership/i.test(textOf(missing)) && idsOf(missing).includes("join"));
  const bad = await runText(user(), "1234567890");
  check("bad number rejected", /not a valid mobile/i.test(textOf(bad)));
  await paint(found);
  await paint(ready);
});

await scenario("posters carousel and one reel", async () => {
  const grid = await runAction(user(), "media-img");
  check("poster carousel", (arr(grid)[0]?.carousel?.cards.length ?? 0) >= 2);
  const reel = await runAction(user(), "media-reel");
  check("reel carousel", (arr(reel)[0]?.carousel?.cards.length ?? 0) >= 2);
  await paint(grid);
});

await scenario("nearest office ask and a shared pin", async () => {
  const ctx = user();
  const ask = await runText(ctx, "nearest office");
  check("asks for a location", arr(ask).some((item) => Boolean(item.locationRequest)));
  check("waiting state", ctx.session.state === "near");
  const typed = await runText(ctx, "somewhere");
  check("re-prompts until a pin arrives", arr(typed).some((item) => Boolean(item.locationRequest)));
  const pin = await nearestFromPin(ctx, 14.47, 78.82);
  check("kadapa is closest", /Kadapa/.test(textOf(pin)) && arr(pin).some((item) => item.location));
  check("pin clears the waiting state", ctx.session.state === "idle");
  await paint(ask);
  await paint(pin);
});

await scenario("coordinator handoff uses the feedback form and still accepts typed text", async () => {
  const start = await runText(user(), "I want to talk to a coordinator");
  check("feedback form offered", arr(start).some((item) => item.flow?.token === "feedback"));
  const ctx = user();
  ctx.session.state = "handoff";
  const filed = await runText(ctx, "Pension has not arrived");
  check("ticket filed", (await ctx.services.escalation.recent()).length === 1);
  check("helpline attached", arr(filed).some((item) => (item.contacts?.length ?? 0) > 0));
  await paint(start);
});

await scenario("unmatched text offers a person", async () => {
  const reply = await runText(user(), "qwzzx nonsense");
  check("handoff button", idsOf(reply).includes("handoff"));
  await paint(reply);
});

await scenario("form completions", async () => {
  const feedback = await completeForm(user(), "feedback", {
    category: "complaint",
    details: "Street light is out",
    callback: "whatsapp",
  });
  check("feedback confirms", /thank you/i.test(textOf(feedback ?? [])));
  const event = await completeForm(user(), "event", { name: "Lakshmi", slot: "tomorrow", attendees: "4" });
  check("event confirms", /registered/i.test(textOf(event ?? [])));
  const member = await completeForm(user(), "membership", { name: "Ravi", constituency: "Guntur West" });
  check("membership confirms", /application received/i.test(textOf(member ?? [])));
  const survey = await completeForm(user(), "survey", { rating: "5", comment: "Clear" });
  check("survey confirms", /rating is recorded/i.test(textOf(survey ?? [])));
  const unknown = await completeForm(user(), "nope", {});
  check("unknown token ignored", unknown === undefined);
  for (const reply of [feedback, event, member, survey]) {
    if (reply) await paint(reply);
  }
});

await scenario("survey and apply entry points", async () => {
  const survey = await runAction(user(), "survey");
  check("survey form", arr(survey).some((item) => item.flow?.screen === "RATE"));
  const apply = await runAction(user(), "join");
  check("membership form", arr(apply).some((item) => item.flow?.screen === "WHO"));
  await paint(survey);
  await paint(apply);
});

await scenario("telugu menu and both-language help", async () => {
  const telugu = await runText(makeContext({ lang: "te" }), "menu");
  check("telugu menu", /మెనూ|ఎంచుకోండి/.test(textOf(telugu)));
  const both = await runText(makeContext({ lang: "both" }), "help");
  check("bilingual help", /సహాయం/.test(textOf(both)) && /Help/.test(textOf(both)));
  await paint(telugu);
});

await scenario("renderer payloads stay inside WhatsApp limits", async () => {
  const menu = await runText(user(), "menu");
  const list = arr(menu).find((item) => item.list);
  const listPayload = list ? whatsAppListPayload(list) : undefined;
  check("menu renders as a native list", Boolean(listPayload));
  const buttons = whatsAppButtonPayload({
    text: "Pick",
    buttons: [
      { id: "a", label: "Yes" },
      { id: "b", label: "No" },
    ],
  });
  check("two choices render as reply buttons", (buttons as { type?: string } | undefined)?.type === "button");
});

console.log("");
console.log(`${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.log(` - ${failure}`);
  process.exit(1);
}
