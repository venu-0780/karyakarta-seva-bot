import { BRAND_IMAGES } from "../data/sample.js";
import { readLangPref, type LangPref } from "../services/i18n.js";
import type { FlowContext, Reply } from "../types.js";

const MENU_COPY: Record<LangPref, string> = {
  both:
    "🙏 నమస్కారం! *ప్రజా సేవ కేంద్రం* కు స్వాగతం.\n" +
    "Tap *Choose*, or reply with a number from 1 to 7.",
  te:
    "🙏 నమస్కారం! *ప్రజా సేవ కేంద్రం* కు స్వాగతం.\n" +
    "*ఎంచుకోండి* నొక్కండి, లేదా 1 నుండి 7 వరకు నంబర్ పంపండి.",
  en:
    "Welcome to the *Praja Seva Helpdesk*.\n" +
    "Tap *Choose*, or reply with a number from 1 to 7.",
};

// Short prompt used as the list body when the full greeting rides on the hero
// image caption instead (banner mode), so the greeting isn't shown twice.
const MENU_PROMPT: Record<LangPref, string> = {
  both: "Tap *Choose*, or reply with a number from 1 to 7.",
  te: "*ఎంచుకోండి* నొక్కండి, లేదా 1 నుండి 7 వరకు నంబర్ పంపండి.",
  en: "Tap *Choose*, or reply with a number from 1 to 7.",
};

/** The "Main menu" button reused at the bottom of most flows (mirrors prototype `back`). */
export const BACK = { id: "menu", label: "Main menu" };

/**
 * The main menu. Pass `{ banner: true }` to lead with a welcome hero image whose
 * caption carries the greeting, followed by the menu list (used on first
 * greeting). Repeat "menu" taps skip the image to avoid banner spam.
 */
export async function menu(ctx: FlowContext, opts?: { banner?: boolean }): Promise<Reply> {
  await ctx.setState("idle");
  const lang = readLangPref(ctx.session.data);
  const list: Reply = {
    text: opts?.banner ? MENU_PROMPT[lang] : MENU_COPY[lang],
    list: {
      buttonLabel: "Choose",
      header: "Praja Seva Helpdesk",
      footer: "Type menu anytime",
      sections: [
        {
          title: "Daily updates",
          rows: [
            { id: "tp", title: "Talking points", description: "Today's briefing" },
            { id: "ps", title: "Praja Sankalpam", description: "Evening paper" },
            { id: "pm", title: "Press meet schedule", description: "Today, tomorrow, yesterday" },
            { id: "jagan", title: "Leader press meets", description: "Browse by date or topic" },
          ],
        },
        {
          title: "Help",
          rows: [
            { id: "poll", title: "Opinion polls", description: "Vote or see results" },
            { id: "id", title: "ID card status", description: "Check with your mobile number" },
            { id: "media", title: "Posters and reels", description: "Images and short videos" },
            { id: "help", title: "Help", description: "Examples of what you can type" },
          ],
        },
      ],
    },
  };
  // Hero image (greeting on the caption) first, then the menu list just below.
  if (opts?.banner) {
    return [
      { media: [{ kind: "image", url: BRAND_IMAGES.welcome, caption: MENU_COPY[lang] }] },
      list,
    ];
  }
  return list;
}

const HELP_COPY: Record<LangPref, string> = {
  both:
    "*సహాయం · Help*\n\n" +
    "మీకు కావలసింది టైప్ చేయండి, లేదా మెనూ నుండి ఎంచుకోండి.\n" +
    "Type what you need, or pick it from the menu.\n\n" +
    "• _today's talking points_\n" +
    "• _రేపు ప్రెస్ మీట్_\n" +
    "• _check my ID status_\n" +
    "• _show posters_\n\n" +
    "భాష: *తెలుగు*, *English*, లేదా *both*.",
  te:
    "*సహాయం*\n\n" +
    "మీకు కావలసింది టైప్ చేయండి, లేదా మెనూ నుండి ఎంచుకోండి.\n\n" +
    "• నేటి టాకింగ్ పాయింట్స్\n" +
    "• రేపు ప్రెస్ మీట్\n" +
    "• ఐడి కార్డు స్థితి\n" +
    "• పోస్టర్లు\n\n" +
    "భాష మార్చాలంటే *ఇంగ్లీష్* లేదా *రెండూ* అని పంపండి.",
  en:
    "*Help*\n\n" +
    "Type what you need, or pick it from the menu.\n\n" +
    "• today's talking points\n" +
    "• tomorrow's press meet\n" +
    "• check my ID status\n" +
    "• show posters\n\n" +
    "Change language by typing *Telugu* or *both*.",
};

export async function help(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  return {
    text: HELP_COPY[readLangPref(ctx.session.data)],
    buttons: [
      { id: "id", label: "Check ID status" },
      BACK,
    ],
  };
}

export async function setLanguage(ctx: FlowContext, pref: LangPref): Promise<Reply> {
  ctx.session.data = { ...ctx.session.data, langPref: pref };
  ctx.lang = pref === "en" ? "en" : "te";
  await ctx.setState(ctx.session.state, ctx.session.data);
  const note =
    pref === "te" ? "భాష తెలుగులో సెట్ అయింది." : pref === "en" ? "Language set to English." : "తెలుగు మరియు English రెండూ చూపిస్తాం.";
  const next = await menu(ctx);
  return [{ text: note }, ...(Array.isArray(next) ? next : [next])];
}
