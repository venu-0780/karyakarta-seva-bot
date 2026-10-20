import { BRAND_IMAGES, PARTY_CONTACT, PARTY_OFFICE } from "../data/sample.js";
import { backButton, L, LB, PH, readLangPref, type LangPref, type Phrase } from "../services/i18n.js";
import type { FlowContext, ListRow, Reply } from "../types.js";

function greeting(pref: LangPref, data: Record<string, unknown>): string {
  const name = typeof data.displayName === "string" ? data.displayName : "";
  const phrase: Phrase = name
    ? {
        te: `🙏 నమస్కారం **${name}**! *ప్రజా సేవ కేంద్రం*కు స్వాగతం.`,
        en: `🙏 Welcome, **${name}**, to the *Praja Seva Helpdesk*.`,
      }
    : {
        te: "🙏 నమస్కారం! *ప్రజా సేవ కేంద్రం*కు స్వాగతం.",
        en: "🙏 Welcome to the *Praja Seva Helpdesk*.",
      };
  return L(pref, phrase);
}

const PROMPT: Phrase = {
  te: "*ఎంచుకోండి* నొక్కండి, లేదా 1 నుండి 7 వరకు నంబర్ పంపండి.",
  en: "Tap *Choose*, or reply with a number from 1 to 7.",
};

/** The "Main menu" button reused at the bottom of most flows (mirrors prototype `back`). */
export { backButton };

/**
 * First-run language picker. Shown once, before anything else, until the user
 * chooses — the choice is then persisted in the session and reused for the whole
 * conversation. Kept neutral/bilingual so a reader of either language can pick.
 */
export async function chooseLanguage(ctx: FlowContext): Promise<Reply> {
  await ctx.setState(ctx.session.state);
  return {
    text:
      "🌐 *భాషను ఎంచుకోండి / Choose your language*\n\n" +
      "ఈ సంభాషణ మీరు ఎంచుకున్న భాషలో కొనసాగుతుంది.\n" +
      "This chat will continue in the language you pick.",
    buttons: [
      { id: "lang-te", label: "తెలుగు" },
      { id: "lang-en", label: "English" },
      { id: "lang-both", label: "రెండూ / Both" },
    ],
  };
}

type MenuRow = { id: string; title: Phrase; desc: Phrase };

const SECTION_UPDATES: Phrase = { te: "రోజువారీ అప్‌డేట్లు", en: "Daily updates" };
const SECTION_HELP: Phrase = { te: "సహాయం & సేవలు", en: "Help & services" };

const UPDATE_ROWS: MenuRow[] = [
  { id: "tp", title: { te: "టాకింగ్ పాయింట్స్", en: "Talking points" }, desc: { te: "ఈ రోజు సమాచారం", en: "Today's briefing" } },
  { id: "ps", title: { te: "ప్రజా సంకల్పం", en: "Praja Sankalpam" }, desc: { te: "సాయంత్రం పేపర్", en: "Evening paper" } },
  { id: "pm", title: { te: "ప్రెస్ మీట్ షెడ్యూల్", en: "Press meet schedule" }, desc: { te: "ఈ రోజు, రేపు, నిన్న", en: "Today, tomorrow, yesterday" } },
  { id: "jagan", title: { te: "నేత ప్రెస్ మీట్లు", en: "Leader press meets" }, desc: { te: "తేదీ లేదా అంశం వారీగా", en: "Browse by date or topic" } },
];

const HELP_ROWS: MenuRow[] = [
  { id: "poll", title: { te: "అభిప్రాయ పోల్స్", en: "Opinion polls" }, desc: { te: "ఓటు వేయండి / ఫలితాలు", en: "Vote or see results" } },
  { id: "id", title: { te: "ఐడి కార్డు స్థితి", en: "ID card status" }, desc: { te: "మొబైల్ నంబర్‌తో చూడండి", en: "Check with your mobile number" } },
  { id: "media", title: { te: "పోస్టర్లు & రీల్స్", en: "Posters and reels" }, desc: { te: "ఫోటోలు, చిన్న వీడియోలు", en: "Images and short videos" } },
  { id: "lang", title: { te: "భాష మార్చు", en: "Change language" }, desc: { te: "తెలుగు / English / రెండూ", en: "Telugu / English / Both" } },
  { id: "help", title: { te: "సహాయం", en: "Help" }, desc: { te: "ఏం టైప్ చేయవచ్చో ఉదాహరణలు", en: "Examples of what you can type" } },
];

function toRows(pref: LangPref, rows: MenuRow[]): ListRow[] {
  return rows.map((r) => ({ id: r.id, title: LB(pref, r.title), description: LB(pref, r.desc) }));
}

/**
 * The main menu. Pass `{ banner: true }` to lead with a welcome hero image whose
 * caption carries the greeting, followed by the menu list (used on first
 * greeting). Repeat "menu" taps skip the image to avoid banner spam.
 */
export async function menu(ctx: FlowContext, opts?: { banner?: boolean }): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  const list: Reply = {
    text: opts?.banner ? L(pref, PROMPT) : `${greeting(pref, ctx.session.data)}\n${L(pref, PROMPT)}`,
    list: {
      buttonLabel: LB(pref, PH.choose),
      header: "Praja Seva Helpdesk",
      footer: LB(pref, PH.menuFooter),
      sections: [
        { title: LB(pref, SECTION_UPDATES), rows: toRows(pref, UPDATE_ROWS) },
        { title: LB(pref, SECTION_HELP), rows: toRows(pref, HELP_ROWS) },
      ],
    },
  };
  // Hero image (greeting on the caption) first, then the menu list just below.
  if (opts?.banner) {
    return [
      { media: [{ kind: "image", url: BRAND_IMAGES.welcome, caption: greeting(pref, ctx.session.data) }] },
      list,
    ];
  }
  return list;
}

const HELP_COPY: Phrase = {
  te:
    "*సహాయం*\n\n" +
    "మీకు కావలసింది టైప్ చేయండి, లేదా కింద *మెనూ* నుండి ఎంచుకోండి:\n\n" +
    "• _నేటి టాకింగ్ పాయింట్స్_\n" +
    "• _రేపటి ప్రెస్ మీట్_\n" +
    "• _నా ఐడి స్థితి_\n" +
    "• _పోస్టర్లు చూపించు_\n\n" +
    "భాష మార్చాలంటే *English* లేదా *రెండూ* అని పంపండి.",
  en:
    "*Help*\n\n" +
    "Type what you need, or pick it from the *menu* below:\n\n" +
    "• _today's talking points_\n" +
    "• _tomorrow's press meet_\n" +
    "• _my ID status_\n" +
    "• _show posters_\n\n" +
    "Change language by typing *Telugu* or *both*.",
};

export async function help(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  const saveHint = L(pref, {
    te: "📇 మా హెల్ప్‌లైన్ నంబర్‌ను సేవ్ చేసుకోండి. మా కేంద్ర కార్యాలయ లొకేషన్ కింద ఉంది.",
    en: "📇 Save our helpline below. Our central office location is attached too.",
  });
  return [
    {
      text: L(pref, HELP_COPY),
      buttons: [{ id: "lang", label: "🌐 భాష / Language" }, { id: "id", label: LB(pref, PH.checkId) }, backButton(pref)],
    },
    { text: saveHint, contacts: [PARTY_CONTACT], location: PARTY_OFFICE },
  ];
}

export async function setLanguage(ctx: FlowContext, pref: LangPref): Promise<Reply> {
  ctx.session.data = { ...ctx.session.data, langPref: pref };
  ctx.lang = pref === "en" ? "en" : "te";
  await ctx.setState(ctx.session.state, ctx.session.data);
  // Persist beyond the 24h session so the choice survives for returning users.
  await ctx.services.prefs.set(ctx.userId, pref);
  const note =
    pref === "te"
      ? "✅ భాష తెలుగులో సెట్ అయింది."
      : pref === "en"
        ? "✅ Language set to English."
        : "✅ తెలుగు మరియు English రెండూ చూపిస్తాం.";
  // Lead with the welcome hero on selection so the first screen feels premium.
  const next = await menu(ctx, { banner: true });
  return [{ text: note }, ...(Array.isArray(next) ? next : [next])];
}
