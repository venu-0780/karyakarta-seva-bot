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
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    botUsername: opt("WHATSAPP_BOT_USERNAME", "praja-seva-helpdesk"),
    // Graph API version for features the adapter doesn't expose (media carousel, flows).
    graphVersion: opt("WHATSAPP_GRAPH_VERSION", "v23.0"),
    // "published" (default) or "draft" — draft lets you test an unpublished flow.
    flowMode: opt("WHATSAPP_FLOW_MODE", "published"),
  },
  // WhatsApp Business Account id — only needed by scripts/create-flow.ts.
  wabaId: process.env.WHATSAPP_WABA_ID,
  // Published Flow ids. When unset, the bot keeps using the button/list UI, so
  // Flows are completely inert until you publish a flow and paste its id here.
  flows: {
    idStatus: process.env.ID_STATUS_FLOW_ID,
    poll: process.env.POLL_FLOW_ID,
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
  },
} as const;

export { req };
