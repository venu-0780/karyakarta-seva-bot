import { BRAND_IMAGES } from "../data/sample.js";
import type { MediaItem } from "../data/repository.js";
import { backButton, L, LB, PH, readLangPref } from "../services/i18n.js";
import type { CarouselCard, FlowContext, ListRow, Reply } from "../types.js";

// Flow 7 — category picker
export async function media(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  return {
    text: L(pref, {
      te: "🖼️ *పోస్టర్లు, రీల్స్ & ఫోటోలు*\nమీకు ఏం కావాలి?",
      en: "🖼️ *Posters, reels and images*\nWhat would you like?",
    }),
    headerImage: BRAND_IMAGES.posters,
    buttons: [
      { id: "media-img", label: LB(pref, PH.images) },
      { id: "media-reel", label: LB(pref, PH.reels) },
      backButton(pref),
    ],
  };
}

// Flow 7 — gallery. Preferred: an interactive media carousel (horizontally
// scrollable cards, premium look). Falls back to a WhatsApp list when a
// carousel isn't possible (fewer than 2 items, or non-https urls) — the renderer
// itself also falls back to sequential media if the carousel send fails.
export async function mediaGrid(ctx: FlowContext, kind: "img" | "reel"): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const items = kind === "img" ? await ctx.services.repos.media.images() : await ctx.services.repos.media.reels();
  const heading = L(pref, {
    te: `*${kind === "img" ? "తాజా పోస్టర్లు" : "తాజా రీల్స్"}* — ఒకదాన్ని తెరిచి మీ ఊరి గ్రూపుల్లో షేర్ చేయండి 🙏`,
    en: `*${kind === "img" ? "Latest posters" : "Latest reels"}* — open one and share it in your village groups 🙏`,
  });

  // Carousel path: cards with an https media header + a "view" url button.
  const usable = items.filter((it) => it.url?.startsWith("https://")).slice(0, 10);
  if (usable.length >= 2) {
    const viewLabel = LB(pref, { te: "చూడండి", en: "View" });
    const cards: CarouselCard[] = usable.map((it) => {
      const card: CarouselCard = {
        body: `${it.title}${it.duration ? ` · ${it.duration}` : ""}`.slice(0, 160),
        buttonLabel: viewLabel,
        url: it.url!,
      };
      if (it.kind === "video") card.video = it.url!;
      else card.image = it.url!;
      return card;
    });
    return [
      { carousel: { body: heading, cards } },
      {
        text: LB(pref, { te: "మరిన్ని:", en: "More:" }),
        buttons: [
          { id: kind === "img" ? "media-reel" : "media-img", label: LB(pref, kind === "img" ? PH.showReels : PH.showImages) },
          backButton(pref),
        ],
      },
    ];
  }

  // Fallback: a WhatsApp list; each row sends the chosen file via `sendMedia`.
  const rows: ListRow[] = items.slice(0, 10).map((it) => ({
    id: `send-${kind}-${it.id}`,
    title: it.title.slice(0, 24),
    description: (it.duration ? `${it.duration} · ` : "") + it.subtitle.slice(0, 60),
  }));
  return {
    text: heading,
    list: {
      buttonLabel: LB(pref, kind === "img" ? PH.chooseImage : PH.chooseReel),
      sections: [{ title: LB(pref, { te: "మీడియా", en: "Media" }), rows }],
    },
  };
}

// Flow 7 — send the actual file
export async function sendMedia(ctx: FlowContext, kind: "img" | "reel", id: string): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const items = kind === "img" ? await ctx.services.repos.media.images() : await ctx.services.repos.media.reels();
  const it = items.find((m) => m.id === id);
  if (!it) {
    return {
      text: L(pref, { te: "ఆ ఫైల్ ఇప్పుడు అందుబాటులో లేదు.", en: "That file is no longer available." }),
      buttons: [backButton(pref)],
    };
  }
  const caption = L(pref, {
    te: `${it.subtitle}. మీ ఊరి గ్రూపుల్లో షేర్ చేయండి. 🙏`,
    en: `${it.subtitle}. Share it in your village groups. 🙏`,
  });
  const switchBtn = {
    id: kind === "img" ? "media-reel" : "media-img",
    label: LB(pref, kind === "img" ? PH.showReels : PH.showImages),
  };
  return [
    { media: [{ kind: it.kind, url: it.url, caption }] },
    { text: LB(pref, { te: "మరిన్ని మీడియా:", en: "More media:" }), buttons: [switchBtn, backButton(pref)] },
  ];
}

export type { MediaItem };
