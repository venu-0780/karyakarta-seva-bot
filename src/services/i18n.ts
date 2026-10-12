import type { Lang } from "../types.js";

/** User-chosen reply language. `both` keeps Telugu and English together. */
export type LangPref = Lang | "both";

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
 * The prototype is bilingual (Telugu + English) with both shown inline, so most
 * copy is kept together rather than split by locale. This helper exists for the
 * few places we want language-specific phrasing and as the seam for a fuller
 * i18n system later.
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
