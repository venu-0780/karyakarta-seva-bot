import { config, thanksSticker } from "../config.js";
import { PARTY_CONTACT } from "../data/sample.js";
import { STAGES } from "../data/repository.js";
import { backButton, L, LB, PH, readLangPref, t } from "../services/i18n.js";
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
  const chatPrompt = {
    text: L(pref, {
      te: "🪪 *ఐడి కార్డు స్థితి* · 2లో 2వ అడుగు\n\nమీరు నమోదు చేసిన *10 అంకెల మొబైల్ నంబర్* పంపండి.\n_ఉదాహరణ: 9876543210_",
      en: "🪪 *ID card status* · step 2 of 2\n\nSend the *10-digit mobile number* you registered with.\n_Example: 9876543210_",
    }),
    buttons: [backButton(pref)],
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
      },
    };
  }
  return chatPrompt;
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
      `${nameLbl}: *${r.name}*\n${midLbl}: *${r.mid}*\n${acLbl}: *${r.ac}*\n\n` +
      `${timeline}\n\n` +
      `${r.stage === 4 ? collectLbl : "ℹ️ "}${r.where}`,
    buttons: [{ id: "id", label: LB(pref, PH.checkAnother) }, backButton(pref)],
    // When the card is ready, drop a map pin to the collection center.
    ...(r.stage === 4 && r.geo ? { location: r.geo } : {}),
  };
}
