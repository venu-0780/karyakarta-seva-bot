import { config, thanksSticker } from "../config.js";
import { idFormData, senderMobile, senderPrefill } from "./formText.js";
import { PARTY_CONTACT } from "../data/sample.js";
import { STAGES } from "../data/repository.js";
import { backButton, L, LB, PH, readLangPref, t, type LangPref, type Phrase } from "../services/i18n.js";
import type { IdCardService } from "../services/cadre/idCardService.js";
import type { FlowContext, Reply } from "../types.js";

export function isYes(raw: string): boolean {
  return /^(y|yes|yeah|yep|ok|okay|sure|ha|avunu|అవును)$/i.test(raw.trim());
}

export function isNo(raw: string): boolean {
  return /^(n|no|nope|cancel|stop|కాదు|వద్దు)$/i.test(raw.trim());
}

// Localized labels for the 5 membership stages (index-aligned with STAGES).
const STAGE_LABELS = [
  { te: "దరఖాస్తు చేశారు", en: "Applied" },
  { te: "పరిశీలించారు", en: "Verified" },
  { te: "ముద్రించారు", en: "Printed" },
  { te: "పంపించారు", en: "Dispatched" },
  { te: "తీసుకోవడానికి సిద్ధం", en: "Ready to collect" },
] as const;

/** "K. Ravi Kumar" -> "K. R*** K****". */
export function maskName(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => (word.length <= 2 ? word : `${word[0]}${"*".repeat(word.length - 1)}`))
    .join(" ");
}

/** "YSR-GNT-204871" -> "YSR-GNT-2***71". */
export function maskMemberId(mid: string): string {
  const cut = mid.lastIndexOf("-");
  const tail = mid.slice(cut + 1);
  if (tail.length < 4) return mid;
  return `${mid.slice(0, cut + 1)}${tail[0]}${"*".repeat(tail.length - 3)}${tail.slice(-2)}`;
}

/** Flow 6 — confirm before asking for a number. */
export async function idOffer(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("id-confirm");
  const pref = readLangPref(ctx.session.data);
  return {
    text: L(pref, {
      te: "🪪 *ఐడి కార్డు స్థితి* · 2లో 1వ అడుగు\n\nమీ ఐడి కార్డు స్థితి చూడాలా?",
      en: "🪪 *ID card status* · step 1 of 2\n\nDo you want to check your ID card status?",
    }),
    buttons: [
      { id: "id-yes", label: LB(pref, PH.yesCheckId) },
      { id: "menu", label: LB(pref, PH.noMenu) },
    ],
  };
}

// Flow 6 — prompt for the registered mobile number
export async function idAsk(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("id");
  const pref = readLangPref(ctx.session.data);
  // Chat prompt is always attached. The renderer sends the native Flow when
  // WhatsApp accepts it, and this prompt when it does not.
  const own = senderMobile(ctx.userId);
  const chatPrompt = {
    text: L(pref, {
      te: own
        ? "🪪 *ఐడి కార్డు స్థితి*\n\nఈ WhatsApp నంబర్‌తో నమోదు చేశారా? *నా నంబర్* నొక్కండి. లేకపోతే మీరు నమోదు చేసిన *10 అంకెల మొబైల్ నంబర్* పంపండి."
        : "🪪 *ఐడి కార్డు స్థితి*\n\nమీరు నమోదు చేసిన *10 అంకెల మొబైల్ నంబర్* పంపండి.\n_ఉదాహరణ: 9876543210_",
      en: own
        ? "🪪 *ID card status*\n\nRegistered with this WhatsApp number? Tap *My number*. Otherwise send the *10-digit mobile number* you registered with."
        : "🪪 *ID card status*\n\nSend the *10-digit mobile number* you registered with.\n_Example: 9876543210_",
    }),
    buttons: [
      ...(own ? [{ id: "id-me", label: LB(pref, PH.myNumber) }] : []),
      backButton(pref),
    ],
  };
  // Native form when a Flow is configured. If WhatsApp rejects it (draft
  // account, unpublished), the renderer sends chatPrompt instead.
  if (config.flows.idStatus) {
    return {
      ...chatPrompt,
      flow: {
        flowId: config.flows.idStatus,
        token: "idstatus",
        screen: "ID_STATUS",
        cta: LB(pref, PH.checkId),
        body: L(pref, {
          te: "🪪 *ఐడి కార్డు స్థితి*\n\nకింద ఉన్న బటన్ నొక్కి ఫారమ్ తెరవండి.",
          en: "🪪 *ID card status*\n\nTap the button below to open the form.",
        }),
        data: idFormData(pref, senderPrefill(ctx)),
        footer: LB(pref, PH.formBack),
      },
    };
  }
  return chatPrompt;
}

// Copy for each cadre ID-card code. Unknown codes fall back to "unknown".
const CADRE_STATUS: Record<string, Phrase> = {
  issued: { te: "✅ ఐడి కార్డు జారీ అయింది.", en: "✅ ID card issued." },
  verification_required: {
    te: "🟡 ఇంకా ధృవీకరణ కాలేదు. కేడర్ పోర్టల్‌లో లేదా మీ కోఆర్డినేటర్‌తో నిర్ధారించుకోండి.",
    en: "🟡 Not verified yet. Confirm in the cadre portal or with your coordinator.",
  },
  rejected_image_quality: {
    te: "❌ ఫోటో నాణ్యత కారణంగా ఐడి కార్డు తిరస్కరించారు. కొత్త ఫోటో పంపండి.",
    en: "❌ ID card rejected because of photo quality. Send a new photo.",
  },
  requires_review: {
    te: "🔎 ఐడి కార్డు సమీక్షలో ఉంది. దయచేసి హెల్ప్‌డెస్క్‌ను సంప్రదించండి.",
    en: "🔎 Under review. Please contact the helpdesk.",
  },
  internal_issue: {
    te: "🔎 ఐడి కార్డు సమీక్షలో ఉంది. దయచేసి హెల్ప్‌డెస్క్‌ను సంప్రదించండి.",
    en: "🔎 Under review. Please contact the helpdesk.",
  },
  unknown: {
    te: "ℹ️ స్థితి అందుబాటులో లేదు. దయచేసి మీ కోఆర్డినేటర్‌ను సంప్రదించండి.",
    en: "ℹ️ Status not available. Please contact your coordinator.",
  },
};
const CADRE_NEEDS_HELP = new Set(["verification_required", "requires_review", "internal_issue", "unknown"]);
const CADRE_UNAVAILABLE: Record<"quota" | "error", Phrase> = {
  quota: {
    te: "⚠️ ఇప్పుడు చాలా తనిఖీలు జరిగాయి. కొద్దిసేపు తర్వాత మళ్లీ ప్రయత్నించండి.",
    en: "⚠️ Too many checks right now. Please try again in a few minutes.",
  },
  error: {
    te: "⚠️ ఇప్పుడు స్థితిని తనిఖీ చేయలేకపోయాం. కొద్దిసేపు తర్వాత మళ్లీ ప్రయత్నించండి.",
    en: "⚠️ Could not check the status right now. Please try again in a few minutes.",
  },
};
const CADRE_SHOW_LIMIT = 5;

/** Reply for a number checked against the live cadre API (replaces the sample timeline). */
async function cadreStatusReply(
  ctx: FlowContext,
  service: IdCardService,
  pref: LangPref,
  num: string,
  masked: string,
): Promise<Reply> {
  const lookup = await service.lookup(num);
  const again = { id: "id", label: LB(pref, PH.tryAnother) };
  const back = backButton(pref);

  if (lookup.kind === "unavailable") {
    return { text: L(pref, CADRE_UNAVAILABLE[lookup.reason]), buttons: [again, back], contacts: [PARTY_CONTACT] };
  }
  if (lookup.kind === "not_found") {
    return {
      text: L(pref, {
        te:
          `❌ *${masked}* నంబర్‌తో ఐడి కార్డు రికార్డు కనిపించలేదు.\n` +
          "నమోదు చేసిన నంబర్ సరిచూసుకోండి, లేదా మీ మండల కోఆర్డినేటర్‌ను సంప్రదించండి.",
        en:
          `❌ No ID card record found for *${masked}*.\n` +
          "Check the number you registered with, or contact your mandal coordinator.",
      }),
      buttons: [again, back],
      contacts: [PARTY_CONTACT],
    };
  }

  const own = num === senderMobile(ctx.userId);
  const nameLbl = LB(pref, { te: "పేరు", en: "Name" });
  const shown = lookup.records.slice(0, CADRE_SHOW_LIMIT);
  const blocks = shown.map((record) => {
    const name = own ? record.name : maskName(record.name);
    const status = Object.prototype.hasOwnProperty.call(CADRE_STATUS, record.code)
      ? CADRE_STATUS[record.code]!
      : CADRE_STATUS.unknown!;
    return `${nameLbl}: *${name}*\n${LB(pref, status)}`;
  });
  const hidden = lookup.records.length - shown.length;
  const more =
    hidden > 0
      ? `\n\n${L(pref, {
          te: `…మరో ${hidden} రికార్డు(లు) ఉన్నాయి. కోఆర్డినేటర్‌ను సంప్రదించండి.`,
          en: `…and ${hidden} more record(s). Contact your coordinator.`,
        })}`
      : "";
  const asOf = lookup.asOf ?? "?";
  const footer = L(pref, {
    te: `${asOf} నాటి కేడర్ డేటా ఆధారంగా. ఇది ప్రత్యక్ష పోర్టల్ తనిఖీ కాదు.`,
    en: `Based on cadre data as of ${asOf}. This is not a live portal check.`,
  });
  const note = own
    ? ""
    : `\n\n_${L(pref, {
        te: "ఇది వేరే నంబర్ కాబట్టి పేరు దాచాం.",
        en: "Name is partly hidden because this is not your WhatsApp number.",
      })}_`;

  const issued = lookup.records.some((record) => record.code === "issued");
  const needsHelp = lookup.records.some(
    (record) => CADRE_NEEDS_HELP.has(record.code) || !Object.prototype.hasOwnProperty.call(CADRE_STATUS, record.code),
  );
  const sticker = issued ? thanksSticker() : undefined;
  return {
    ...(issued ? { reactionEmoji: "✅" } : {}),
    ...(sticker ? { sticker } : {}),
    text:
      `🪪 *${LB(pref, { te: "ఐడి కార్డు స్థితి", en: "ID card status" })}* · ${masked}\n\n` +
      `${blocks.join("\n\n")}${more}\n\n` +
      `_${footer}_${note}`,
    buttons: [again, back],
    ...(needsHelp ? { contacts: [PARTY_CONTACT] } : {}),
  };
}

// Flow 6 — look up a number sent while in the `id` state (or detected anywhere)
export async function idCheck(ctx: FlowContext, raw: string): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const num = raw.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(num)) {
    return {
      text:
        "⚠️ " +
        (pref === "both" ? `${t("te", "badMobile")}\n${t("en", "badMobile")}` : t(ctx.lang, "badMobile")),
      buttons: [backButton(pref)],
    };
  }

  // Privacy: rate-limit lookups per sender (abuse / scraping protection).
  const allowed = await ctx.services.rateLimit.hit(`id:${ctx.userId}`, config.idLookupsPerHour, 60 * 60 * 1000);
  if (!allowed) {
    return {
      text: L(pref, {
        te: `⚠️ చాలా ఎక్కువ సార్లు చూశారు. కాసేపు తర్వాత మళ్లీ ప్రయత్నించండి (గంటకు ${config.idLookupsPerHour} పరిమితి).`,
        en: `⚠️ Too many lookups. Please try again later (limit ${config.idLookupsPerHour}/hour).`,
      }),
      buttons: [backButton(pref)],
    };
  }

  await ctx.setState("idle");
  const masked = num.slice(0, 2) + "XXXXX" + num.slice(7);
  if (ctx.services.idCard) return cadreStatusReply(ctx, ctx.services.idCard, pref, num, masked);
  const r = await ctx.services.repos.membership.lookup(num);
  if (!r) {
    return {
      text: L(pref, {
        te:
          `❌ *${masked}* కోసం సభ్యత్వం కనిపించలేదు.\n` +
          "నమోదు చేసిన నంబర్ సరిచూసుకోండి, లేదా మీ మండల కోఆర్డినేటర్‌ను సంప్రదించండి.",
        en:
          `❌ No membership found for *${masked}*.\n` +
          "Check the number you used when you registered, or contact your mandal coordinator.",
      }),
      buttons: [
        { id: "id", label: LB(pref, PH.tryAnother) },
        ...(config.flows.membership ? [{ id: "join", label: LB(pref, { te: "దరఖాస్తు", en: "Apply" }) }] : []),
        backButton(pref),
      ],
      contacts: [PARTY_CONTACT],
    };
  }

  const currentTag = LB(pref, { te: "  ← ప్రస్తుతం", en: "  ← current" });
  const timeline = STAGES.map((_, i) => {
    const mark = i < r.stage ? "✅" : i === r.stage ? "🔸" : "⬜";
    return `${mark} ${LB(pref, STAGE_LABELS[i]!)}${i === r.stage ? currentTag : ""}`;
  }).join("\n");

  // Anyone can type any number. Full name and member ID go only to the person
  // whose WhatsApp number it is; others see the stage with those masked.
  const own = num === senderMobile(ctx.userId);
  const shownName = own ? r.name : maskName(r.name);
  const shownMid = own ? r.mid : maskMemberId(r.mid);
  const maskedNote = own
    ? ""
    : `\n\n_${L(pref, {
        te: "ఇది వేరే నంబర్ కాబట్టి పేరు, ఐడి దాచాం.",
        en: "Name and ID are partly hidden because this is not your WhatsApp number.",
      })}_`;

  const nameLbl = LB(pref, { te: "పేరు", en: "Name" });
  const midLbl = LB(pref, { te: "సభ్య ఐడి", en: "Member ID" });
  const acLbl = LB(pref, { te: "నియోజకవర్గం", en: "Constituency" });
  const collectLbl = LB(pref, { te: "📍 *తీసుకునే చోటు:* ", en: "📍 *Collect at:* " });
  const title = LB(pref, { te: "ఐడి కార్డు స్థితి", en: "ID card status" });

  const sticker = thanksSticker();
  return {
    reactionEmoji: "✅",
    ...(sticker ? { sticker } : {}),
    text:
      `🪪 *${title}* · ${masked}\n\n` +
      `${nameLbl}: *${shownName}*\n${midLbl}: *${shownMid}*\n${acLbl}: *${r.ac}*\n\n` +
      `${timeline}\n\n` +
      `${r.stage === 4 ? collectLbl : "ℹ️ "}${r.where}` +
      maskedNote,
    buttons: [{ id: "id", label: LB(pref, PH.checkAnother) }, backButton(pref)],
    // When the card is ready, drop a map pin to the collection center.
    ...(r.stage === 4 && r.geo ? { location: r.geo } : {}),
  };
}
