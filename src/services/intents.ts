/**
 * Lightweight natural-language intent matching for the seven menu options.
 *
 * This deliberately stays deterministic: WhatsApp messages are matched locally
 * without sending user text or phone numbers to an external AI service.
 */
export type IntentAction =
  | "tp"
  | "tp-y"
  | "ps"
  | "ps-y"
  | "pm"
  | "pm-today"
  | "pm-tmrw"
  | "pm-yday"
  | "jagan"
  | "j-date"
  | "j-topic"
  | "poll"
  | "id"
  | "media"
  | "media-img"
  | "media-reel";

// ─── Regex patterns (one per flow / sub-check) ─────────────────────
// Compiled once at module load.  English alternatives use \b word
// boundaries; Telugu alternatives rely on whitespace already collapsed
// by normalize().

// Jagan-specific (two-part: name AND press context must both match)
const RE_JAGAN_NAME = /\b(?:jagan|jagan sir|jaganna|leader)\b|జగన్|జగనన్న/;
const RE_PRESS_CONTEXT = /\b(?:press|meets?|meetings?|speech|videos?|updates?)\b|ప్రెస్|సమావేశం|వీడియో/;
const RE_J_TOPIC = /\b(?:topic|subject|issue)\b|అంశం/;
const RE_J_DATE = /\b(?:date|day|when)\b|తేదీ|ఎప్పుడు/;

// Main flows
const RE_TALKING_PTS = /\b(?:talking|talkng)\s*(?:points?)?\b|\bdaily\s*(?:points?|briefing)\b|\bwhat\s+to\s+(?:say|talk)\b|టాకింగ్\s*పాయింట్స్|మాట్లాడే\s*అంశాలు|ముఖ్యాంశాలు/;
const RE_PRAJA_SANKALP = /\b(?:praja|prajā)\s*sankalp(?:am)?\b|\bevening\s*(?:paper|edition|news)\b|ప్రజా\s*సంకల్పం|సంకల్పం/;
const RE_PRESS_MEET = /\b(?:press|pres|media)\s*(?:meets?|meetings?|conference|schedule)\b|\bpress\s*(?:timings?|time|updates?)\b|ప్రెస్\s*మీట్|విలేకరుల\s*సమావేశం/;
const RE_POLLS = /\b(?:opinion\s*)?(?:polls?|pols?|survey|vote|voting)\b|\bpublic\s*opinion\b|అభిప్రాయ\s*సేకరణ|పోల్|ఓటు/;
const RE_ID_CARD = /\b(?:id|identity|member|membership)\s*(?:card|status|number|details?)?\b|\bcard\s*status\b|\bcheck\s+(?:my\s+)?(?:id|card)\b|ఐడి|ఐడీ|గుర్తింపు\s*కార్డు/;

// Media sub-types
const RE_IMAGES = /\b(?:posters?|postrs?|images?|photos?|pictures?|graphics?)\b|పోస్టర్లు|చిత్రాలు|ఫోటోలు/;
const RE_VIDEOS = /\b(?:reels?|reles?|short\s*videos?|videos?|clips?)\b|రీల్స్|వీడియోలు/;
const RE_MEDIA_GENERIC = /\b(?:media|shareable\s*content|social\s*content)\b|మీడియా/;

// ─── Helpers ────────────────────────────────────────────────────────

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "")
    // Keep combining marks: Telugu vowel signs are Unicode marks, not letters.
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function dayIn(text: string): "today" | "tmrw" | "yday" | undefined {
  if (/\b(?:yesterday|yday|previous day)\b|నిన్న/.test(text)) return "yday";
  if (/\b(?:tomorrow|tmrw|next day)\b|రేపు/.test(text)) return "tmrw";
  if (/\b(?:today|current|latest)\b|ఈరోజు|నేడు/.test(text)) return "today";
  return undefined;
}

// ─── Intent detection ───────────────────────────────────────────────

/** Return the flow action implied by free text, or undefined when uncertain. */
export function detectIntent(raw: string): IntentAction | undefined {
  const text = normalize(raw);
  if (!text) return undefined;

  // Jagan-specific press meets — checked first to avoid the generic press-meet match.
  if (RE_JAGAN_NAME.test(text) && RE_PRESS_CONTEXT.test(text)) {
    if (RE_J_TOPIC.test(text)) return "j-topic";
    if (RE_J_DATE.test(text)) return "j-date";
    return "jagan";
  }

  if (RE_TALKING_PTS.test(text)) return dayIn(text) === "yday" ? "tp-y" : "tp";
  if (RE_PRAJA_SANKALP.test(text)) return dayIn(text) === "yday" ? "ps-y" : "ps";

  if (RE_PRESS_MEET.test(text)) {
    const day = dayIn(text);
    if (day === "today") return "pm-today";
    if (day === "tmrw") return "pm-tmrw";
    if (day === "yday") return "pm-yday";
    return "pm";
  }

  if (RE_POLLS.test(text)) return "poll";
  if (RE_ID_CARD.test(text)) return "id";

  // Media: detect sub-type when possible.
  const wantsImages = RE_IMAGES.test(text);
  const wantsVideos = RE_VIDEOS.test(text);
  if (wantsImages && wantsVideos) return "media";
  if (wantsImages) return "media-img";
  if (wantsVideos) return "media-reel";
  if (RE_MEDIA_GENERIC.test(text)) return "media";

  return undefined;
}
