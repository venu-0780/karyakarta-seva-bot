import { config } from "../config.js";
import { STAGES } from "../data/repository.js";
import { readLangPref, t } from "../services/i18n.js";
import type { FlowContext, Reply } from "../types.js";
import { BACK } from "./menu.js";

export function isYes(raw: string): boolean {
  return /^(y|yes|yeah|yep|ok|okay|sure|ha|avunu|అవును)$/i.test(raw.trim());
}

export function isNo(raw: string): boolean {
  return /^(n|no|nope|cancel|stop|కాదు|వద్దు)$/i.test(raw.trim());
}

/** Flow 6 — confirm before asking for a number. */
export async function idOffer(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("id-confirm");
  return {
    text:
      readLangPref(ctx.session.data) === "en"
        ? "🪪 *ID card status* · step 1 of 2\n\nDo you want to check your ID card status?"
        : readLangPref(ctx.session.data) === "te"
          ? "🪪 *ఐడి కార్డు స్థితి* · 2 లో 1వ అడుగు\n\nమీ ఐడి కార్డు స్థితి చూడాలా?"
          : "🪪 *ID card status* · step 1 of 2\n\nDo you want to check your ID card status?\n_మీ ఐడి కార్డు స్థితి చూడాలా?_",
    buttons: [
      { id: "id-yes", label: "Yes, check ID" },
      { id: "menu", label: "No, main menu" },
    ],
  };
}

// Flow 6 — prompt for the registered mobile number
export async function idAsk(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("id");
  return {
    text:
      (readLangPref(ctx.session.data) === "te"
        ? "🪪 *ఐడి కార్డు స్థితి* · 2 లో 2వ అడుగు\n\nమీరు నమోదు చేసిన *10 అంకెల మొబైల్ నంబర్* పంపండి.\n_ఉదాహరణ: 9876543210_"
        : "🪪 *ID card status* · step 2 of 2\n\nSend the *10-digit mobile number* you registered with.\n_Example: 9876543210_") +
      (readLangPref(ctx.session.data) === "both" ? `\n\n_${t(ctx.lang, "sendMobile")}_` : ""),
    buttons: [BACK],
  };
}

// Flow 6 — look up a number sent while in the `id` state (or detected anywhere)
export async function idCheck(ctx: FlowContext, raw: string): Promise<Reply> {
  const num = raw.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(num)) {
    return {
      text:
        "⚠️ " +
        (readLangPref(ctx.session.data) === "both"
          ? `${t("te", "badMobile")}\n${t("en", "badMobile")}`
          : t(ctx.lang, "badMobile")),
      buttons: [BACK],
    };
  }

  // Privacy: rate-limit lookups per sender (abuse / scraping protection).
  const allowed = await ctx.services.rateLimit.hit(`id:${ctx.userId}`, config.idLookupsPerHour, 60 * 60 * 1000);
  if (!allowed) {
    return {
      text: `⚠️ Too many lookups. Please try again later (limit ${config.idLookupsPerHour}/hour).`,
      buttons: [BACK],
    };
  }

  await ctx.setState("idle");
  const masked = num.slice(0, 2) + "XXXXX" + num.slice(7);
  const r = await ctx.services.repos.membership.lookup(num);
  if (!r) {
    return {
      text:
        `❌ No membership found for *${masked}*.\n` +
        "Check the number you used when you registered, or contact your mandal coordinator.",
      buttons: [{ id: "id", label: "Try another number" }, BACK],
    };
  }

  const timeline = STAGES.map((s, i) => {
    const mark = i < r.stage ? "✅" : i === r.stage ? "🔸" : "⬜";
    return `${mark} ${s}${i === r.stage ? "  ← current" : ""}`;
  }).join("\n");

  return {
    text:
      `🪪 *ID card status* for ${masked}\n\n` +
      `Name: *${r.name}*\nMember ID: *${r.mid}*\nConstituency: *${r.ac}*\n\n` +
      `${timeline}\n\n` +
      `${r.stage === 4 ? "📍 *Collect at:* " : "ℹ️ "}${r.where}`,
    buttons: [{ id: "id", label: "Check another number" }, BACK],
  };
}
