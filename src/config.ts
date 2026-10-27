import type { Lang } from "./types.js";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  whatsapp: {
    // The adapter auto-detects these from env, but we surface them for clarity / validation.
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    // Dialable business number (digits only) used to ignore echoed outbound
    // events from BSPs that deliver them to the inbound webhook.
    businessNumber: process.env.WHATSAPP_BUSINESS_NUMBER?.replace(/\D/g, ""),
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    botUsername: opt("WHATSAPP_BOT_USERNAME", "praja-seva-helpdesk"),
    // Meta-compatible API origin. Some BSP/CRM providers proxy the Graph API.
    apiUrl: opt("WHATSAPP_API_URL", "https://graph.facebook.com").replace(/\/+$/, ""),
    // Graph API version for features the adapter doesn't expose (media carousel, flows).
    graphVersion: opt("WHATSAPP_GRAPH_VERSION", "v26.0"),
    // "published" (default) or "draft" — draft lets you test an unpublished flow.
    flowMode: opt("WHATSAPP_FLOW_MODE", "published"),
  },
  // WhatsApp Business Account id — only needed by scripts/create-flow.ts.
  wabaId: process.env.WHATSAPP_WABA_ID,
  businessId: process.env.WHATSAPP_BUSINESS_ID,
  // Public HTTPS base URL of this deployment. Used to build absolute URLs for
  // assets WhatsApp must fetch itself (e.g. the generated poll-result chart
  // image at /api/chart/poll/*). Defaults to the known Vercel domain.
  publicBaseUrl: opt("PUBLIC_BASE_URL", "https://karyakarta-seva-bot.vercel.app"),
  // Human handoff / escalation. When COORDINATOR_WA_ID is set (and WhatsApp
  // creds are present), an unresolved query the user chooses to escalate is
  // forwarded to this coordinator's WhatsApp with the conversation context.
  coordinator: {
    waId: process.env.COORDINATOR_WA_ID,
  },
  // Shared secret that guards the proactive-alert HTTP routes (app/api/alerts/*).
  // Required to trigger an alert over HTTP; when unset, those routes refuse all
  // requests (so a deploy can never expose an open broadcast trigger).
  alertsSecret: process.env.ALERTS_SECRET,
  // Poll results are rendered as a real bar-chart image by default. Set
  // CHART_IMAGES=0 to fall back to the inline text/ASCII bars (e.g. if the
  // deployment can't serve the image route).
  charts: {
    enabled: opt("CHART_IMAGES", "1") !== "0",
  },
  // Published Flow ids. When unset, the bot keeps using the button/list UI, so
  // Flows are completely inert until you publish a flow and paste its id here.
  flows: {
    idStatus: process.env.ID_STATUS_FLOW_ID,
    poll: process.env.POLL_FLOW_ID,
    feedback: process.env.FEEDBACK_FLOW_ID,
    event: process.env.EVENT_FLOW_ID,
    membership: process.env.MEMBERSHIP_FLOW_ID,
    survey: process.env.SURVEY_FLOW_ID,
  },
  // Optional branded sticker (WebP, 512x512). Sent on thank-you messages only
  // when set to a public https URL. Leave blank to skip stickers entirely.
  stickers: {
    thanks: process.env.STICKER_THANKS_URL,
  },
  // LLM smart router (OpenAI). Fully inert until OPENAI_API_KEY is set — the bot
  // then falls back to the deterministic regex matcher exactly as before. The
  // LLM only ever classifies free text into one of the known flow actions; it
  // never generates content and never receives phone numbers / PII.
  llm: {
    apiKey: process.env.OPENAI_API_KEY,
    model: opt("OPENAI_MODEL", "gpt-4o-mini"),
    enabled: Boolean(process.env.OPENAI_API_KEY),
    timeoutMs: Number(opt("LLM_TIMEOUT_MS", "2500")),
    // Per-user cap so a stuck/abusive sender can't run up unbounded API cost.
    callsPerHour: Number(opt("LLM_CALLS_PER_HOUR", "30")),
    // Grounded answers: when a user ASKS about content (not just navigates), add
    // a short summary built only from retrieved repo data. Costs a 2nd LLM call;
    // on by default when the key is set, disable with GROUNDED_ANSWERS=0.
    answersEnabled: Boolean(process.env.OPENAI_API_KEY) && opt("GROUNDED_ANSWERS", "1") !== "0",
  },
  // Optional: when unset, the bot uses an in-memory state store (fine for local
  // dev / a single instance). Set it in production for multi-instance state.
  redisUrl: process.env.REDIS_URL,
  databaseUrl: process.env.DATABASE_URL,
  defaultLang: opt("DEFAULT_LANG", "te") as Lang,
  idLookupsPerHour: Number(opt("ID_LOOKUPS_PER_HOUR", "5")),
  // Language code of the approved broadcast templates (e.g. "en", "en_US", "te").
  broadcastLang: opt("TEMPLATE_LANG", "en"),
  templates: {
    talkingPoints: opt("TEMPLATE_TALKING_POINTS", "talking_points_daily"),
    prajaSankalpam: opt("TEMPLATE_PRAJA_SANKALPAM", "praja_sankalpam_daily"),
    // Proactive-alert templates (see scripts/alerts.ts). Must be pre-approved in
    // WhatsApp Manager before they can be sent outside the 24h service window.
    pressLive: opt("TEMPLATE_PRESS_LIVE", "press_meet_live"),
    idReady: opt("TEMPLATE_ID_READY", "id_card_ready"),
  },
} as const;

/** Public https thank-you sticker, or undefined when none is configured. */
export function thanksSticker(): { url: string } | undefined {
  const url = config.stickers.thanks;
  return url?.startsWith("https://") ? { url } : undefined;
}

export { req };
