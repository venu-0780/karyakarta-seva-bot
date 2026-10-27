import type { Button, Lang } from "../types.js";

/** User-chosen reply language. `both` keeps Telugu and English together. */
export type LangPref = Lang | "both";

/** A single piece of copy in both languages. */
export interface Phrase {
  te: string;
  en: string;
}

export function readLangPref(data: Record<string, unknown>): LangPref {
  return data.langPref === "en" || data.langPref === "te" || data.langPref === "both"
    ? data.langPref
    : "both";
}

/** Map a short user phrase to a language preference. */
export function languageChoice(raw: string): LangPref | undefined {
  const text = raw.trim().toLowerCase();
  if (/^(en|english|ఇంగ్లీషు|ఇంగ్లీష్)$/.test(text)) return "en";
  if (/^(te|telugu|తెలుగు)$/.test(text)) return "te";
  if (/^(both|రెండూ|bilingual)$/.test(text)) return "both";
  return undefined;
}

/**
 * Render body copy for the user's preference. For `both` we lead with Telugu
 * (the first language of the rural audience) and put English underneath, so a
 * Telugu reader never has to scan past English to find their line.
 */
export function L(pref: LangPref, p: Phrase): string {
  if (pref === "te") return p.te;
  if (pref === "en") return p.en;
  return `${p.te}\n${p.en}`;
}

/**
 * Render a short label (button title, list row, header) in a SINGLE language —
 * WhatsApp caps button titles at 20 chars, so `both` is not an option. Telugu
 * unless the user explicitly chose English.
 */
export function LB(pref: LangPref, p: Phrase): string {
  return pref === "en" ? p.en : p.te;
}

// --- Shared, reusable copy --------------------------------------------------
// Kept in one place so wording and tone stay consistent across all 7 flows.
export const PH = {
  mainMenu: { te: "మెనూకు వెళ్లు", en: "Back to menu" },
  help: { te: "సహాయం", en: "Help" },
  menuFooter: { te: "ఎప్పుడైనా 'మెనూ' అని టైప్ చేయండి", en: "Type menu anytime" },
  // A form bubble can only have the Open button, so the way back sits under it.
  formBack: { te: "మెనూకు వెళ్లాలంటే మెనూ అని టైప్ చేయండి", en: "Back to menu: type menu" },
  choose: { te: "ఎంచుకోండి", en: "Choose" },

  // Shown by the LLM router when a message could mean one of a few flows.
  clarifyPrompt: {
    te: "మీరు వీటిలో దేని గురించి అడుగుతున్నారు? కింద ఎంచుకోండి:",
    en: "Which of these did you mean? Tap one below:",
  },

  // Human handoff / escalation.
  talkToCoordinator: { te: "కోఆర్డినేటర్‌తో మాట్లాడండి", en: "Talk to coordinator" },

  today: { te: "ఈ రోజు", en: "Today" },
  yesterday: { te: "నిన్న", en: "Yesterday" },
  tomorrow: { te: "రేపు", en: "Tomorrow" },

  // Talking points / Praja Sankalpam
  todaysPoints: { te: "ఈ రోజు పాయింట్లు", en: "Today's points" },
  ydaysPoints: { te: "నిన్నటి పాయింట్లు", en: "Yesterday's points" },
  todaysPaper: { te: "ఈ రోజు పేపర్", en: "Today's paper" },
  ydaysPaper: { te: "నిన్నటి పేపర్", en: "Yesterday's paper" },
  readOnline: { te: "ఆన్‌లైన్‌లో చదవండి", en: "Read online" },
  pagesFmt: { te: "పేజీలు", en: "pages" },

  // Press meets
  watchLive: { te: "ప్రత్యక్ష ప్రసారం", en: "Watch live" },
  liveLink: { te: "ప్రత్యక్ష లింక్", en: "Live link" },
  watchRec: { te: "రికార్డింగ్ చూడండి", en: "Watch recording" },
  live: { te: "🔴 ప్రత్యక్షం", en: "🔴 LIVE" },
  upcoming: { te: "🔜 రాబోయేది", en: "🔜 Upcoming" },
  recording: { te: "⏺ రికార్డింగ్", en: "⏺ Recording" },

  // Leader press meets
  latestMeet: { te: "తాజా ప్రెస్ మీట్", en: "Latest press meet" },
  byDate: { te: "తేదీ వారీగా", en: "By date" },
  byTopic: { te: "అంశం వారీగా", en: "By topic" },
  otherTopics: { te: "ఇతర అంశాలు", en: "Other topics" },
  watchVideo: { te: "పూర్తి వీడియో", en: "Watch full video" },

  // Polls
  vote: { te: "ఓటు వేయండి", en: "Vote" },
  otherPolls: { te: "ఇతర పోల్స్", en: "Other polls" },
  choosePoll: { te: "పోల్ ఎంచుకోండి", en: "Choose poll" },

  // ID card
  checkId: { te: "ఐడి చూడండి", en: "Check ID status" },
  yesCheckId: { te: "అవును, చూడండి", en: "Yes, check ID" },
  noMenu: { te: "వద్దు, మెనూ", en: "No, main menu" },
  tryAnother: { te: "వేరే నంబర్", en: "Try another number" },
  checkAnother: { te: "మరో నంబర్ చూడండి", en: "Check another number" },

  // Media
  images: { te: "ఫోటోలు / పోస్టర్లు", en: "Images / posters" },
  reels: { te: "రీల్స్ / వీడియోలు", en: "Reels / videos" },
  showReels: { te: "రీల్స్ చూపించు", en: "Show reels" },
  showImages: { te: "ఫోటోలు చూపించు", en: "Show images" },
  chooseImage: { te: "ఫోటో ఎంచుకోండి", en: "Choose image" },
  chooseReel: { te: "రీల్ ఎంచుకోండి", en: "Choose reel" },
} as const;

/** Shared "Back to menu" button. Replaces the old fixed BACK constant. */
export function backButton(pref: LangPref): Button {
  return { id: "menu", label: LB(pref, PH.mainMenu) };
}

/** Shared "Help" button, localized. */
export function helpButton(pref: LangPref): Button {
  return { id: "help", label: LB(pref, PH.help) };
}

/**
 * Legacy single-key helper kept for the few call sites that still pass a bare
 * `Lang`. New code should prefer `L` / `LB` with a `Phrase`.
 */
export function t(lang: Lang, key: keyof typeof STRINGS): string {
  const entry = STRINGS[key];
  return entry[lang] ?? entry.en;
}

const STRINGS = {
  sendMobile: {
    te: "మీ నమోదిత మొబైల్ నంబర్ పంపండి.",
    en: "Please send your registered 10-digit mobile number.",
  },
  notUnderstood: {
    te: "క్షమించండి, అర్థం కాలేదు. సహాయం కోసం *help* అని పంపండి, లేదా *menu* అని టైప్ చేయండి.",
    en: "I didn't understand that. Type *help* for examples, or *menu* to see every option.",
  },
  badMobile: {
    te: "ఇది సరైన మొబైల్ నంబర్ లా లేదు. 6, 7, 8 లేదా 9 తో మొదలయ్యే 10 అంకెలు పంపండి. ఉదాహరణ: 9876543210",
    en: "That is not a valid mobile number. Send 10 digits starting with 6, 7, 8 or 9. Example: 9876543210",
  },
} as const;
