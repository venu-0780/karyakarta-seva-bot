import assert from "node:assert/strict";
import { test } from "node:test";

import {
  graphBodyAccepted,
  render,
  whatsAppButtonPayload,
  whatsAppListPayload,
  type PostableThread,
  type PostPayload,
} from "../src/render/whatsapp.js";
import type { BotResponse, ListMessage } from "../src/types.js";

/** A thread with no adapter -> every send falls back to thread.post, captured. */
function fakeThread(): { thread: PostableThread; posts: (PostPayload | string)[] } {
  const posts: (PostPayload | string)[] = [];
  const thread: PostableThread = {
    async post(payload) {
      posts.push(payload);
    },
  };
  return { thread, posts };
}

const list4: ListMessage = {
  buttonLabel: "Choose",
  sections: [
    {
      title: "Options",
      rows: [
        { id: "a", title: "Alpha", description: "first" },
        { id: "b", title: "Beta" },
        { id: "c", title: "Gamma" },
        { id: "d", title: "Delta" },
      ],
    },
  ],
};

test("whatsAppButtonPayload builds <=3 reply buttons and dedups titles", () => {
  const r: BotResponse = {
    text: "pick",
    buttons: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Alpha" }, // duplicate title -> dropped
    ],
  };
  const payload = whatsAppButtonPayload(r) as any;
  assert.equal(payload.type, "button");
  assert.equal(payload.action.buttons.length, 2);
  assert.equal(payload.body.text, "pick");
});

test("whatsAppButtonPayload clips long titles and declines when a link rides along", () => {
  const clipped = whatsAppButtonPayload({
    buttons: [{ id: "x", label: "This label is definitely longer than twenty chars" }],
  }) as any;
  assert.equal(clipped.action.buttons[0].reply.title.length, 20);

  assert.equal(
    whatsAppButtonPayload({ buttons: [{ id: "x", label: "ok" }], linkButton: { label: "L", url: "https://x" } }),
    undefined,
  );
  assert.equal(
    whatsAppButtonPayload({ buttons: [1, 2, 3, 4].map((n) => ({ id: `b${n}`, label: `B${n}` })) }),
    undefined,
    "more than 3 buttons -> no reply-button payload",
  );
});

test("whatsAppButtonPayload attaches an https image header", () => {
  const payload = whatsAppButtonPayload({
    text: "hi",
    buttons: [{ id: "a", label: "A" }],
    headerImage: "https://example.com/x.jpg",
  }) as any;
  assert.equal(payload.header.type, "image");
  assert.equal(payload.header.image.link, "https://example.com/x.jpg");
});

test("whatsAppListPayload needs 4-10 rows", () => {
  assert.ok(whatsAppListPayload({ list: list4 }), "4 rows -> list");
  const two: ListMessage = { buttonLabel: "Go", sections: [{ title: "S", rows: list4.sections[0]!.rows.slice(0, 2) }] };
  assert.equal(whatsAppListPayload({ list: two }), undefined, "2 rows -> not a list");
  const many: ListMessage = {
    buttonLabel: "Go",
    sections: [{ title: "S", rows: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` })) }],
  };
  assert.equal(whatsAppListPayload({ list: many }), undefined, "11 rows -> not a list");
});

test("render splits long text into <=4096-char posts", async () => {
  const { thread, posts } = fakeThread();
  const long = "line\n".repeat(2000); // ~10k chars
  await render(thread, { text: long });
  assert.ok(posts.length > 1, "splits into multiple posts");
  for (const p of posts) {
    const md = typeof p === "string" ? p : p.markdown ?? "";
    assert.ok(md.length <= 4096);
  }
});

test("graphBodyAccepted rejects an error body even when HTTP is 200", () => {
  assert.equal(graphBodyAccepted(200, { message: { queue_id: "q", message_status: "queued" } }), true);
  assert.equal(graphBodyAccepted(200, { error: { message: "Unsupported" } }), false);
  assert.equal(graphBodyAccepted(200, { message: { message_status: "failed" } }), false);
  assert.equal(graphBodyAccepted(400, {}), false);
});

test("a flow that cannot be sent still delivers the chat fallback", async () => {
  const { thread, posts } = fakeThread();
  await render(thread, {
    flow: { flowId: "missing-flow", token: "poll:p1", screen: "POLL", cta: "Vote", body: "Which issue?" },
    text: "Tap one option. You can vote once.",
    buttons: [{ id: "vote-p1-0", label: "Yes" }],
  });
  assert.ok(posts.length >= 1);
  assert.match(JSON.stringify(posts), /Tap one option/);
});

test("render falls back to numbered text when a native list can't be sent", async () => {
  const { thread, posts } = fakeThread();
  await render(thread, { text: "Pick one", list: list4 });
  assert.equal(posts.length, 1);
  const md = typeof posts[0] === "string" ? posts[0] : (posts[0] as PostPayload).markdown ?? "";
  assert.match(md, /\*1\.\* Alpha/);
  assert.match(md, /number of your choice/i);
});
