// -----------------------------------------------------------------------------
// Renderer: BotResponse (our content model) -> Chat SDK message sends.
// This is the ONLY file that encodes WhatsApp-specific limits and the Chat SDK
// card/interactive DSL. Adding Telegram later = write src/render/telegram.ts.
//
// Mapping to the INSTALLED @chat-adapter/whatsapp (v4) capabilities:
//   - <=3 buttons                -> Card + Actions([Button])  => WhatsApp reply buttons
//   - a lone LinkButton          -> Card + Actions([LinkButton]) => WhatsApp cta_url
//   - buttons + a link           -> reply buttons; the link rides along as a body line
//   - list of 1-3 rows           -> reply buttons (one tap)
//   - list of 4-10 rows          -> native WhatsApp list message
//   - list send failure          -> numbered text; a typed number still selects the row
//   - documents / media          -> attachments by public HTTPS url (link passthrough)
// -----------------------------------------------------------------------------
import { Actions, Button, Card, LinkButton } from "chat";

import type { BotResponse, Reply } from "../types.js";

const MAX_BODY = 4096;
const MAX_BUTTONS = 3;
const MAX_BUTTON_TITLE = 20;

/**
 * Minimal view of a Chat SDK thread we rely on. Kept local so this module does
 * not hard-depend on the SDK's exported types (which can shift between versions).
 */
export interface PostAttachment {
  type: "image" | "video" | "file" | "audio";
  url?: string;
  name?: string;
  mimeType?: string;
}

export interface PostPayload {
  markdown?: string;
  attachments?: PostAttachment[];
  /** A Chat SDK CardElement (built via Card()/Actions()/Button()). */
  card?: unknown;
}

export interface InteractiveSender {
  sendInteractiveMessage(threadId: string, to: string, interactive: unknown): Promise<unknown>;
  decodeThreadId(threadId: string): { userWaId: string };
}

export interface PostableThread {
  id?: string;
  adapter?: Partial<InteractiveSender>;
  post(payload: PostPayload | string): Promise<unknown>;
  startTyping?(): Promise<unknown>;
}

/** Split a long body into <=4096-char chunks on paragraph/line boundaries. */
function splitBody(text: string): string[] {
  if (text.length <= MAX_BODY) return [text];
  const chunks: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if ((buf + "\n" + line).length > MAX_BODY) {
      if (buf) chunks.push(buf);
      buf = line;
    } else {
      buf = buf ? buf + "\n" + line : line;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

/**
 * Build a Chat SDK interactive card from a BotResponse's buttons / link button.
 * The response text becomes the card `subtitle`, which the WhatsApp adapter uses
 * as the interactive body. Returns undefined when there is nothing interactive.
 */
function buildCard(r: BotResponse): unknown | undefined {
  const children: unknown[] = [];
  if (r.buttons?.length) {
    for (const b of r.buttons.slice(0, MAX_BUTTONS)) {
      children.push(Button({ id: b.id, label: b.label.slice(0, MAX_BUTTON_TITLE) }));
    }
  }
  if (r.linkButton) {
    children.push(
      LinkButton({ url: r.linkButton.url, label: r.linkButton.label.slice(0, MAX_BUTTON_TITLE) }),
    );
  }
  if (children.length === 0) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Card({ subtitle: r.text ?? "", children: [Actions(children as any)] });
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

/** Shown under tappable messages so the way back is always visible. */
const MENU_FOOTER = "Type menu anytime";

function isHttps(url?: string): url is string {
  return !!url && url.startsWith("https://");
}

function withChrome(
  payload: Record<string, unknown>,
  chrome: { header?: string; headerImage?: string; footer?: string },
): Record<string, unknown> {
  // WhatsApp reply-button messages accept an image header; lists accept text only,
  // so callers that pass headerImage must be on the button path.
  const header = isHttps(chrome.headerImage)
    ? { header: { type: "image", image: { link: chrome.headerImage } } }
    : chrome.header
      ? { header: { type: "text", text: clip(chrome.header, 60) } }
      : {};
  return {
    ...payload,
    ...header,
    footer: { text: clip(chrome.footer || MENU_FOOTER, 60) },
  };
}

/** WhatsApp list payload for 4-10 rows. Returns undefined when a list is not appropriate. */
export function whatsAppListPayload(r: BotResponse): Record<string, unknown> | undefined {
  const list = r.list;
  if (!list) return undefined;
  const sections = list.sections
    .map((section) => ({
      title: clip(section.title, 24),
      rows: section.rows.map((row) => {
        const item: { id: string; title: string; description?: string } = {
          id: row.id.slice(0, 200),
          title: clip(row.title, 24) || "Option",
        };
        if (row.description) item.description = clip(row.description, 72);
        return item;
      }),
    }))
    .filter((section) => section.rows.length > 0);
  const rowCount = sections.reduce((count, section) => count + section.rows.length, 0);
  if (rowCount < 4 || rowCount > 10) return undefined;
  return withChrome(
    {
      type: "list",
      body: { text: clip(r.text || "Please choose an option", 1024) },
      action: {
        button: clip(list.buttonLabel, 20) || "Choose",
        sections,
      },
    },
    { header: list.header, footer: list.footer },
  );
}

/** Reply-button payload for 1-3 choices. A link button stays on the card path. */
export function whatsAppButtonPayload(r: BotResponse): Record<string, unknown> | undefined {
  const buttons = r.buttons ?? [];
  if (buttons.length === 0 || buttons.length > MAX_BUTTONS || r.linkButton) return undefined;
  const seen = new Set<string>();
  const replies = [];
  for (const button of buttons) {
    const title = clip(button.label.trim(), MAX_BUTTON_TITLE);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    replies.push({ type: "reply", reply: { id: button.id.trim().slice(0, 256), title } });
  }
  if (replies.length === 0) return undefined;
  return withChrome(
    {
      type: "button",
      body: { text: clip(r.text || "Please choose an option", 1024) },
      action: { buttons: replies },
    },
    { headerImage: r.headerImage },
  );
}

async function postInteractive(thread: PostableThread, interactive: Record<string, unknown> | undefined): Promise<boolean> {
  const send = thread.adapter?.sendInteractiveMessage;
  const decode = thread.adapter?.decodeThreadId;
  if (!interactive || !send || !decode || !thread.id) return false;
  let userWaId = "";
  try {
    userWaId = decode.call(thread.adapter, thread.id).userWaId;
  } catch {
    return false;
  }
  if (!userWaId) return false;
  try {
    await send.call(thread.adapter, thread.id, userWaId, interactive);
    return true;
  } catch {
    return false;
  }
}

/** Render a list as a numbered text block when a native list cannot be sent. */
function renderListText(r: BotResponse): string {
  const lines: string[] = [];
  if (r.text) lines.push(r.text);
  const rows = (r.list?.sections ?? []).flatMap((s) => s.rows);
  if (lines.length && rows.length) lines.push("");
  rows.forEach((row, i) => {
    lines.push(`*${i + 1}.* ${row.title}${row.description ? ` — ${row.description}` : ""}`);
  });
  lines.push("");
  lines.push("_Reply with the number of your choice._");
  return lines.join("\n");
}

/**
 * Send one media/document as a WhatsApp attachment via public HTTPS url. Falls
 * back to posting the caption (and link) as text when there is no usable url or
 * the send fails, so the bot stays responsive even on placeholder/sample data.
 */
async function postAttachment(
  thread: PostableThread,
  a: { type: PostAttachment["type"]; url?: string; name?: string; mimeType?: string; caption?: string },
): Promise<void> {
  if (a.url && a.url.startsWith("https://")) {
    try {
      await thread.post({
        markdown: a.caption ?? "",
        attachments: [{ type: a.type, url: a.url, name: a.name, mimeType: a.mimeType }],
      });
      return;
    } catch {
      // fall through to the text fallback below
    }
  }
  const parts: string[] = [];
  if (a.caption) parts.push(a.caption);
  if (a.url) parts.push(a.url);
  if (parts.length) await thread.post({ markdown: parts.join("\n") });
}

/** Post a standalone preview image (used when a native image header isn't possible). */
async function postHeaderImage(thread: PostableThread, url?: string): Promise<void> {
  if (!isHttps(url)) return;
  await postAttachment(thread, {
    type: "image",
    url,
    mimeType: url.toLowerCase().split("?")[0]?.endsWith(".png") ? "image/png" : "image/jpeg",
  });
}

/** Send one BotResponse over a Chat SDK thread. */
export async function renderOne(thread: PostableThread, r: BotResponse): Promise<void> {
  // 1) Documents — one file per post; caption rides on the first.
  if (r.documents?.length) {
    for (const [i, d] of r.documents.entries()) {
      // Only a real PDF can be sent as a document. Page links stay in the text.
      if (!d.url?.toLowerCase().split("?")[0]?.endsWith(".pdf")) continue;
      await postAttachment(thread, {
        type: "file",
        url: d.url,
        name: d.filename,
        mimeType: "application/pdf",
        caption: i === 0 ? d.caption : undefined,
      });
    }
  }

  // 2) Media — WhatsApp allows one media item per message.
  if (r.media?.length) {
    for (const m of r.media) {
      await postAttachment(thread, {
        type: m.kind === "image" ? "image" : "video",
        url: m.url,
        mimeType: m.url?.toLowerCase().split("?")[0]?.endsWith(".png") ? "image/png" : m.kind === "image" ? "image/jpeg" : "video/mp4",
        caption: m.caption,
      });
    }
  }

  // 3) Interactive / list / text.
  if (r.list) {
    const rows = r.list.sections.flatMap((section) => section.rows);
    if (rows.length > 0 && rows.length <= MAX_BUTTONS) {
      // Few enough rows to become reply buttons -> image rides as a native header.
      const asButtons: BotResponse = {
        text: r.text,
        headerImage: r.headerImage,
        buttons: rows.map((row) => ({ id: row.id, label: row.title })),
      };
      if (!(await postInteractive(thread, whatsAppButtonPayload(asButtons)))) {
        await postHeaderImage(thread, r.headerImage);
        await thread.post({ card: buildCard(asButtons) });
      }
    } else {
      // A WhatsApp list header must be text (no image). We deliberately do NOT
      // send a separate image bubble here: it lands as an awkward, often
      // out-of-order attachment below the list. Flows that want a preview image
      // with a list should emit it as a leading media message (see menu hero).
      if (!(await postInteractive(thread, whatsAppListPayload(r)))) {
        await thread.post({ markdown: renderListText(r) });
      }
    }
  } else if (r.text || r.buttons?.length || r.linkButton) {
    const nativeButtons = await postInteractive(thread, whatsAppButtonPayload(r));
    // Native reply buttons carry the image header themselves; the card fallback can't.
    if (!nativeButtons) await postHeaderImage(thread, r.headerImage);
    const card = nativeButtons ? undefined : buildCard(r);
    if (card) {
      await thread.post({ card });
    } else if (!nativeButtons && r.text) {
      for (const chunk of splitBody(r.text)) await thread.post({ markdown: chunk });
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// WhatsApp delivers link-based media only after it has fetched the file, so a
// following text/interactive message can overtake it. A short pause after a
// media message keeps a hero image above the content that belongs under it.
const MEDIA_ORDER_DELAY_MS = 1200;

/** Send a Reply (one response or an ordered sequence). */
export async function render(thread: PostableThread, reply: Reply): Promise<void> {
  const list = Array.isArray(reply) ? reply : [reply];
  for (const [i, r] of list.entries()) {
    await renderOne(thread, r);
    if (r.media?.length && i < list.length - 1) await sleep(MEDIA_ORDER_DELAY_MS);
  }
}
