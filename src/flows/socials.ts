// Social card demo. One message does the add: paste a link or a short line
// (`ig @ravi`). A bare @handle is the only follow-up, and it is three buttons.
// Handles live on the chat session only. There is no profile store.
import { backButton, L, LB, PH, readLangPref, type LangPref, type Phrase } from "../services/i18n.js";
import type { FlowContext, Reply } from "../types.js";

type PlatformId = "fb" | "ig" | "x" | "yt" | "other";

interface SocialEntry {
  platform: PlatformId;
  name: string;
  handle: string;
}

const MAX_ENTRIES = 8;

const PLATFORMS: { id: PlatformId; mark: string; title: Phrase }[] = [
  { id: "fb", mark: "📘", title: { te: "Facebook", en: "Facebook" } },
  { id: "ig", mark: "📸", title: { te: "Instagram", en: "Instagram" } },
  { id: "x", mark: "𝕏", title: { te: "X", en: "X" } },
  { id: "yt", mark: "▶️", title: { te: "YouTube", en: "YouTube" } },
  { id: "other", mark: "🔗", title: { te: "వేరే పేజీ", en: "Another page" } },
];

const PREFIX: Record<string, PlatformId> = {
  fb: "fb",
  facebook: "fb",
  ig: "ig",
  insta: "ig",
  instagram: "ig",
  x: "x",
  twitter: "x",
  yt: "yt",
  youtube: "yt",
};

const PREVIEW: Phrase = {
  te: "_ఈ చాట్‌లో ప్రివ్యూ మాత్రమే._",
  en: "_Preview in this chat only._",
};

function platformOf(id: string): (typeof PLATFORMS)[number] | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

function readCard(data: Record<string, unknown>): SocialEntry[] {
  const raw = data.socialCard;
  if (!Array.isArray(raw)) return [];
  const entries: SocialEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<SocialEntry>;
    if (!platformOf(String(row.platform)) || typeof row.handle !== "string" || !row.handle) continue;
    entries.push({
      platform: row.platform as PlatformId,
      name: typeof row.name === "string" && row.name ? row.name : platformOf(String(row.platform))!.title.en,
      handle: row.handle,
    });
  }
  return entries.slice(0, MAX_ENTRIES);
}

function pendingHandle(data: Record<string, unknown>): string | undefined {
  const raw = data.socialDraft;
  if (!raw || typeof raw !== "object") return undefined;
  const handle = (raw as { handle?: unknown }).handle;
  return typeof handle === "string" && handle ? handle : undefined;
}

function showHandle(entry: SocialEntry): string {
  if (entry.platform === "ig" || entry.platform === "x" || entry.platform === "yt") {
    return entry.handle.startsWith("@") ? entry.handle : `@${entry.handle}`;
  }
  return entry.handle;
}

/** Turn a pasted link or @id into the handle we show on the card. */
export function cleanHandle(raw: string): string | undefined {
  let text = raw.trim();
  if (!text || text.length > 200) return undefined;
  text = text.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\?.*$/, "");
  const parts = text.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0]?.includes(".")) {
    const skip = /^(share|p|reel|reels|status|stories|watch|channel)$/i;
    const id = parts.slice(1).find((part) => !skip.test(part));
    if (id) text = id;
  }
  text = text.replace(/^@+/, "").replace(/\/+$/, "").trim();
  if (!text || text.length > 64 || /[\s\n\r]/.test(text)) return undefined;
  return text;
}

function hostOf(raw: string): string | undefined {
  const text = raw.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const host = text.split(/[/?#]/)[0]?.toLowerCase();
  if (!host || !host.includes(".")) return undefined;
  return host;
}

function platformFromHost(host: string): { platform: PlatformId; name?: string } {
  if (host === "instagram.com" || host === "instagr.am" || host.endsWith(".instagram.com")) return { platform: "ig" };
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host === "fb.me" || host === "fb.watch") {
    return { platform: "fb" };
  }
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com")) return { platform: "x" };
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") return { platform: "yt" };
  const label = host.split(".")[0] ?? host;
  return { platform: "other", name: label.slice(0, 24) };
}

type Parsed =
  | { kind: "add"; platform: PlatformId; name?: string; handle: string }
  | { kind: "which"; handle: string };

/** A link or `ig @ravi` becomes a page. A bare @handle still needs one tap. */
export function parseSocialLine(raw: string): Parsed | undefined {
  const text = raw.trim();
  if (!text || text.length > 200) return undefined;

  const prefixed = text.match(/^(fb|facebook|ig|insta|instagram|x|twitter|yt|youtube)\s+(\S+)$/i);
  if (prefixed) {
    const handle = cleanHandle(prefixed[2] ?? "");
    const platform = PREFIX[(prefixed[1] ?? "").toLowerCase()];
    if (!handle || !platform) return undefined;
    return { kind: "add", platform, handle };
  }

  const other = text.match(/^other\s+(\S+)\s+(\S+)$/i);
  if (other) {
    const handle = cleanHandle(other[2] ?? "");
    const name = (other[1] ?? "").slice(0, 24);
    if (!handle || name.length < 2) return undefined;
    return { kind: "add", platform: "other", name, handle };
  }

  const host = hostOf(text);
  if (host && (text.includes("/") || /^https?:\/\//i.test(text))) {
    const handle = cleanHandle(text);
    if (!handle) return undefined;
    const found = platformFromHost(host);
    return { kind: "add", platform: found.platform, name: found.name, handle };
  }

  if (/^@\S+$/.test(text)) {
    const handle = cleanHandle(text);
    if (!handle) return undefined;
    return { kind: "which", handle };
  }
  return undefined;
}

function howTo(pref: LangPref): string {
  const lead = L(pref, {
    te: "లింక్ పంపండి, లేదా ఇలా రాయండి:",
    en: "Send a link or a short line:",
  });
  return `${lead}\n_ig @ravi · fb page · x @ravi · yt @ravi_`;
}

function cardText(pref: LangPref, entries: SocialEntry[]): string {
  const title = L(pref, { te: "🪪 *మీ సోషల్ కార్డు*", en: "🪪 *Your social card*" });
  const pages = entries.length
    ? entries
        .map((entry) => {
          const meta = platformOf(entry.platform)!;
          const name = entry.platform === "other" ? entry.name : LB(pref, meta.title);
          return `${meta.mark} *${name}*\n${showHandle(entry)}`;
        })
        .join("\n\n")
    : L(pref, { te: "ఇంకా పేజీలు లేవు.", en: "No pages yet." });
  return `${title}\n\n${pages}\n\n${howTo(pref)}\n\n${L(pref, PREVIEW)}`;
}

function cardReply(ctx: FlowContext, note?: string): Reply {
  const pref = readLangPref(ctx.session.data);
  const entries = readCard(ctx.session.data);
  const text = cardText(pref, entries);
  return {
    text: note ? `${note}\n\n${text}` : text,
    buttons: [
      ...(entries.length ? [{ id: "social-rm", label: LB(pref, { te: "తీసేయండి", en: "Remove" }) }] : []),
      backButton(pref),
    ],
  };
}

function whichReply(ctx: FlowContext, handle: string): Reply {
  const pref = readLangPref(ctx.session.data);
  return {
    text: L(pref, {
      te: `*@${handle}* ఏ పేజీ?`,
      en: `Which page is *@${handle}*?`,
    }),
    buttons: [
      { id: "social-ig", label: "Instagram" },
      { id: "social-x", label: "X" },
      { id: "social-yt", label: "YouTube" },
    ],
  };
}

export async function socialCard(ctx: FlowContext): Promise<Reply> {
  const { socialDraft: _drop, ...rest } = ctx.session.data;
  ctx.session.data = rest;
  await ctx.setState("social", ctx.session.data);
  return cardReply(ctx);
}

async function commit(ctx: FlowContext, platform: PlatformId, handle: string, name?: string): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const meta = platformOf(platform)!;
  const label = platform === "other" ? name || meta.title.en : meta.title.en;
  const next = readCard(ctx.session.data).filter((entry) =>
    platform === "other" ? entry.name.toLowerCase() !== label.toLowerCase() : entry.platform !== platform,
  );
  if (next.length < MAX_ENTRIES) next.push({ platform, name: label, handle });
  const { socialDraft: _drop, ...rest } = ctx.session.data;
  ctx.session.data = { ...rest, socialCard: next.slice(0, MAX_ENTRIES) };
  await ctx.setState("social", ctx.session.data);
  const shown = platform === "ig" || platform === "x" || platform === "yt" ? `@${handle}` : handle;
  return cardReply(ctx, L(pref, { te: `✅ *${label}* · ${shown}`, en: `✅ *${label}* · ${shown}` }));
}

/** Place a bare @handle once the user taps Instagram, X, or YouTube. */
export async function socialPlace(ctx: FlowContext, platform: PlatformId): Promise<Reply> {
  const handle = pendingHandle(ctx.session.data);
  if (!handle || platform === "other") return socialCard(ctx);
  return commit(ctx, platform, handle);
}

/**
 * Accept a paste while the card is open. Returns undefined when the message
 * is ordinary chat, so "press meet" and a phone number still route as usual.
 */
export async function socialTryText(ctx: FlowContext, raw: string): Promise<Reply | undefined> {
  if (ctx.session.state !== "social" && ctx.session.state !== "social-which") return undefined;
  if (ctx.session.state === "social-which") {
    const picked = PREFIX[raw.trim().toLowerCase()];
    if (picked && pendingHandle(ctx.session.data)) return socialPlace(ctx, picked);
  }
  const parsed = parseSocialLine(raw);
  if (!parsed) return undefined;
  if (parsed.kind === "which") {
    ctx.session.data = { ...ctx.session.data, socialDraft: { handle: parsed.handle } };
    await ctx.setState("social-which", ctx.session.data);
    return whichReply(ctx, parsed.handle);
  }
  return commit(ctx, parsed.platform, parsed.handle, parsed.name);
}

export async function socialRemoveList(ctx: FlowContext): Promise<Reply> {
  const entries = readCard(ctx.session.data);
  if (!entries.length) return socialCard(ctx);
  await ctx.setState("social", ctx.session.data);
  const pref = readLangPref(ctx.session.data);
  return {
    text: L(pref, { te: "ఏ పేజీని తీసేయాలి?", en: "Which page should we remove?" }),
    list: {
      buttonLabel: LB(pref, PH.choose),
      header: LB(pref, { te: "పేజీ తీసేయి", en: "Remove a page" }),
      sections: [
        {
          title: LB(pref, { te: "మీ పేజీలు", en: "Your pages" }),
          rows: entries.map((entry, i) => ({
            id: `social-rm-${i}`,
            title: (entry.platform === "other" ? entry.name : LB(pref, platformOf(entry.platform)!.title)).slice(0, 24),
            description: showHandle(entry).slice(0, 72),
          })),
        },
      ],
    },
  };
}

export async function socialRemove(ctx: FlowContext, index: number): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const entries = readCard(ctx.session.data);
  const gone = entries[index];
  if (!gone) return socialCard(ctx);
  ctx.session.data = { ...ctx.session.data, socialCard: entries.filter((_, i) => i !== index) };
  await ctx.setState("social", ctx.session.data);
  const name = gone.platform === "other" ? gone.name : LB(pref, platformOf(gone.platform)!.title);
  return cardReply(ctx, L(pref, { te: `✅ *${name}* తీసేశాం.`, en: `✅ Removed *${name}*.` }));
}
