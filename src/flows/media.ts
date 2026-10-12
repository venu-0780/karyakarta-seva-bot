import { BRAND_IMAGES } from "../data/sample.js";
import type { MediaItem } from "../data/repository.js";
import type { FlowContext, ListRow, Reply } from "../types.js";
import { BACK } from "./menu.js";

// Flow 7 — category picker
export async function media(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  return {
    text: "🖼️ *Posters, reels and images*\nWhat would you like?",
    headerImage: BRAND_IMAGES.posters,
    buttons: [
      { id: "media-img", label: "Images / posters" },
      { id: "media-reel", label: "Reels / videos" },
      BACK,
    ],
  };
}

// Flow 7 — grid replaced by a WhatsApp list (no native grid); each row sends a file.
export async function mediaGrid(ctx: FlowContext, kind: "img" | "reel"): Promise<Reply> {
  const items = kind === "img" ? await ctx.services.repos.media.images() : await ctx.services.repos.media.reels();
  const rows: ListRow[] = items.slice(0, 10).map((it) => ({
    id: `send-${kind}-${it.id}`,
    title: it.title.slice(0, 24),
    description: (it.duration ? `${it.duration} · ` : "") + it.subtitle.slice(0, 60),
  }));
  return {
    // No headerImage: this is a list, and a floating preview bubble below it
    // looks like a stray image. The chosen file is sent when a row is picked.
    text: `*${kind === "img" ? "Latest posters" : "Latest reels"}* · pick one to get the file`,
    list: { buttonLabel: kind === "img" ? "Choose image" : "Choose reel", sections: [{ title: "Media", rows }] },
  };
}

// Flow 7 — send the actual file
export async function sendMedia(ctx: FlowContext, kind: "img" | "reel", id: string): Promise<Reply> {
  const items = kind === "img" ? await ctx.services.repos.media.images() : await ctx.services.repos.media.reels();
  const it = items.find((m) => m.id === id);
  if (!it) return { text: "That file is no longer available.", buttons: [BACK] };
  const caption = `${it.subtitle}. Share it in your village groups. 🙏`;
  return [
    { media: [{ kind: it.kind, url: it.url, caption }] },
    { text: "More media:", buttons: [{ id: kind === "img" ? "media-reel" : "media-img", label: kind === "img" ? "Show reels" : "Show images" }, BACK] },
  ];
}

export type { MediaItem };
