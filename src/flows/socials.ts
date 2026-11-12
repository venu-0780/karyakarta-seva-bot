// Social card demo. Handles live only on the current chat session so the
// preview can update as the user adds pages. There is no profile store.
import { backButton, L, LB, PH, readLangPref, type LangPref, type Phrase } from "../services/i18n.js";
import type { FlowContext, Reply } from "../types.js";

type PlatformId = "fb" | "ig" | "x" | "yt" | "other";

interface SocialEntry {
  platform: PlatformId;
  name: string;
  handle: string;
}

interface SocialDraft {
  platform: PlatformId;
  name?: string;
}

const MAX_ENTRIES = 8;

const PLATFORMS: { id: PlatformId; mark: string; title: Phrase; example: Phrase }[] = [
  {
    id: "fb",
    mark: "📘",
    title: { te: "Facebook", en: "Facebook" },
    example: { te: "facebook.com/ravi లేదా ravi.ysrcp", en: "facebook.com/ravi or ravi.ysrcp" },
  },
  {
    id: "ig",
    mark: "📸",
    title: { te: "Instagram", en: "Instagram" },
    example: { te: "instagram.com/ravi లేదా @ravi", en: "instagram.com/ravi or @ravi" },
  },
  {
    id: "x",
    mark: "𝕏",
    title: { te: "X", en: "X" },
    example: { te: "x.com/ravi లేదా @ravi", en: "x.com/ravi or @ravi" },
  },
  {
    id: "yt",
    mark: "▶️",
    title: { te: "YouTube", en: "YouTube" },
    example: { te: "youtube.com/@ravi లేదా @ravi", en: "youtube.com/@ravi or @ravi" },
  },
  {
    id: "other",
    mark: "🔗",
    title: { te: "వేరే పేజీ", en: "Another page" },
    example: { te: "పేజీ లింక్ లేదా ఐడి", en: "the page link or id" },
  },
];

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

function readDraft(data: Record<string, unknown>): SocialDraft | undefined {
  const raw = data.socialDraft;
  if (!raw || typeof raw !== "object") return undefined;
  const draft = raw as Partial<SocialDraft>;
  if (!platformOf(String(draft.platform))) return undefined;
  return {
    platform: draft.platform as PlatformId,
    name: typeof draft.name === "string" ? draft.name : undefined,
  };
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

function cardText(pref: LangPref, entries: SocialEntry[]): string {
  const title = L(pref, { te: "🪪 *మీ సోషల్ కార్డు*", en: "🪪 *Your social card*" });
  if (!entries.length) {
    const empty = L(pref, {
      te: "ఇంకా పేజీలు లేవు. Facebook, Instagram, X, YouTube లేదా వేరే పేజీని జోడించండి.",
      en: "No pages yet. Add Facebook, Instagram, X, YouTube, or any other page.",
    });
    return `${title}\n\n${empty}\n\n${L(pref, PREVIEW)}`;
  }
  const lines = entries.map((entry) => {
    const meta = platformOf(entry.platform)!;
    const name = entry.platform === "other" ? entry.name : LB(pref, meta.title);
    return `${meta.mark} *${name}*\n${showHandle(entry)}`;
  });
  return `${title}\n\n${lines.join("\n\n")}\n\n${L(pref, PREVIEW)}`;
}

function cardReply(ctx: FlowContext, note?: string): Reply {
  const pref = readLangPref(ctx.session.data);
  const entries = readCard(ctx.session.data);
  const buttons = [
    ...(entries.length < MAX_ENTRIES
      ? [{ id: "social-add", label: LB(pref, { te: "జోడించు", en: "Add a page" }) }]
      : []),
    ...(entries.length ? [{ id: "social-rm", label: LB(pref, { te: "తీసేయండి", en: "Remove" }) }] : []),
    backButton(pref),
  ];
  const card = { text: cardText(pref, entries), buttons };
  if (!note) return card;
  return [{ text: note }, card];
}

export async function socialCard(ctx: FlowContext): Promise<Reply> {
  const { socialDraft: _drop, ...rest } = ctx.session.data;
  ctx.session.data = rest;
  await ctx.setState("social", ctx.session.data);
  return cardReply(ctx);
}

export async function socialPick(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("social-pick", ctx.session.data);
  const pref = readLangPref(ctx.session.data);
  return {
    text: L(pref, {
      te: "ఏ పేజీని జోడించాలి?",
      en: "Which page do you want to add?",
    }),
    list: {
      buttonLabel: LB(pref, PH.choose),
      header: LB(pref, { te: "పేజీ జోడించు", en: "Add a page" }),
      sections: [
        {
          title: LB(pref, { te: "పేజీలు", en: "Pages" }),
          rows: PLATFORMS.map((p) => ({ id: `social-${p.id}`, title: LB(pref, p.title) })),
        },
      ],
    },
  };
}

export async function socialChoose(ctx: FlowContext, platform: PlatformId): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  if (platform === "other") {
    ctx.session.data = { ...ctx.session.data, socialDraft: { platform } satisfies SocialDraft };
    await ctx.setState("social-other", ctx.session.data);
    return {
      text: L(pref, {
        te: "ఆ పేజీ పేరు ఏమిటి?\n_ఉదాహరణ: ShareChat, Telegram_",
        en: "What is that page called?\n_Example: ShareChat, Telegram_",
      }),
      buttons: [{ id: "social", label: LB(pref, { te: "కార్డుకు", en: "Back to card" }) }, backButton(pref)],
    };
  }
  return askHandle(ctx, { platform });
}

export async function socialOtherName(ctx: FlowContext, raw: string): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const name = raw.trim().replace(/\s+/g, " ").slice(0, 24);
  if (name.length < 2) {
    return {
      text: L(pref, {
        te: "పేరు కనీసం 2 అక్షరాలు ఉండాలి. మళ్లీ పంపండి.",
        en: "The name needs at least 2 characters. Send it again.",
      }),
      buttons: [{ id: "social", label: LB(pref, { te: "కార్డుకు", en: "Back to card" }) }],
    };
  }
  return askHandle(ctx, { platform: "other", name });
}

async function askHandle(ctx: FlowContext, draft: SocialDraft): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  ctx.session.data = { ...ctx.session.data, socialDraft: draft };
  await ctx.setState("social-id", ctx.session.data);
  const meta = platformOf(draft.platform)!;
  const name = draft.platform === "other" ? draft.name ?? LB(pref, meta.title) : LB(pref, meta.title);
  return {
    text: L(pref, {
      te: `${meta.mark} *${name}*\n\nలింక్ లేదా ఐడి పంపండి.\n_${meta.example.te}_`,
      en: `${meta.mark} *${name}*\n\nSend the link or the id.\n_${meta.example.en}_`,
    }),
    buttons: [{ id: "social", label: LB(pref, { te: "కార్డుకు", en: "Back to card" }) }, backButton(pref)],
  };
}

export async function socialSaveHandle(ctx: FlowContext, raw: string): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const draft = readDraft(ctx.session.data);
  if (!draft) return socialPick(ctx);
  const handle = cleanHandle(raw);
  if (!handle) {
    const meta = platformOf(draft.platform)!;
    return {
      text: L(pref, {
        te: `అది ఐడిలా లేదు. లింక్ లేదా ఐడి పంపండి.\n_${meta.example.te}_`,
        en: `That doesn't look like an id. Send the link or the id.\n_${meta.example.en}_`,
      }),
      buttons: [{ id: "social", label: LB(pref, { te: "కార్డుకు", en: "Back to card" }) }],
    };
  }
  const meta = platformOf(draft.platform)!;
  const name = draft.platform === "other" ? draft.name || meta.title.en : meta.title.en;
  const next = readCard(ctx.session.data).filter((entry) =>
    draft.platform === "other" ? entry.name.toLowerCase() !== name.toLowerCase() : entry.platform !== draft.platform,
  );
  next.push({ platform: draft.platform, name, handle });
  const { socialDraft: _drop, ...rest } = ctx.session.data;
  ctx.session.data = { ...rest, socialCard: next };
  await ctx.setState("social", ctx.session.data);
  const shown = draft.platform === "ig" || draft.platform === "x" || draft.platform === "yt" ? `@${handle}` : handle;
  return cardReply(
    ctx,
    L(pref, {
      te: `✅ *${name}* జోడించాం: ${shown}`,
      en: `✅ Added *${name}*: ${shown}`,
    }),
  );
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
    buttons: [{ id: "social", label: LB(pref, { te: "కార్డుకు", en: "Back to card" }) }],
  };
}

export async function socialRemove(ctx: FlowContext, index: number): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const entries = readCard(ctx.session.data);
  const gone = entries[index];
  if (!gone) return socialCard(ctx);
  const next = entries.filter((_, i) => i !== index);
  ctx.session.data = { ...ctx.session.data, socialCard: next };
  await ctx.setState("social", ctx.session.data);
  const name = gone.platform === "other" ? gone.name : LB(pref, platformOf(gone.platform)!.title);
  return cardReply(ctx, L(pref, { te: `✅ *${name}* తీసేశాం.`, en: `✅ Removed *${name}*.` }));
}
