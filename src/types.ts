// -----------------------------------------------------------------------------
// Platform-agnostic content model.
// Flows return a BotResponse; a per-platform renderer (src/render/*) turns it
// into real messages. Flows must NEVER import a platform SDK.
// -----------------------------------------------------------------------------

export type Lang = "te" | "en";

/** A tappable reply button. WhatsApp allows max 3 per message; title <= 20 chars. */
export interface Button {
  /** Action id routed back through the router (mirrors the prototype's action strings). */
  id: string;
  label: string;
}

export interface ListRow {
  /** Action id returned when the user picks this row. */
  id: string;
  title: string; // <= 24 chars on WhatsApp
  description?: string; // <= 72 chars on WhatsApp
}

export interface ListSection {
  title: string; // <= 24 chars
  rows: ListRow[];
}

/** WhatsApp list message: one button reveals up to 10 rows across up to 10 sections. */
export interface ListMessage {
  buttonLabel: string; // <= 20 chars
  /** Optional text header, shown above the body. <= 60 chars on WhatsApp. */
  header?: string;
  /** Optional footer. Defaults to a "type menu" hint. <= 60 chars on WhatsApp. */
  footer?: string;
  sections: ListSection[];
}

export interface DocumentAttachment {
  filename: string;
  /** Public https URL, or leave undefined and resolve via MediaRepo at render time. */
  url?: string;
  caption?: string;
}

export interface MediaAttachment {
  kind: "image" | "video";
  url?: string;
  caption?: string;
}

/** A single CTA URL button (promoted to a native WhatsApp CTA URL message when alone). */
export interface LinkButton {
  label: string; // <= 20 chars
  url: string; // must start with http(s)://
}

/**
 * One card in an interactive media carousel. Each card shows an image OR video
 * header (all cards in a carousel MUST share the same type) plus a single URL
 * button. Tapping the button opens the url. See CarouselMessage.
 */
export interface CarouselCard {
  /** Public HTTPS image url. Use this XOR `video`. */
  image?: string;
  /** Public HTTPS video url. Use this XOR `image`. */
  video?: string;
  /** Optional card caption. <= 160 chars, <= 2 line breaks on WhatsApp. */
  body?: string;
  buttonLabel: string; // <= 20 chars
  url: string; // https cta url opened on tap
}

/**
 * Interactive media carousel (2-10 horizontally scrollable cards). Not exposed
 * by the adapter, so the renderer sends it via a thin direct Graph API call and
 * falls back to sequential media messages if that is not possible.
 */
export interface CarouselMessage {
  body: string; // required main body, <= 1024 chars
  cards: CarouselCard[]; // 2-10 cards
}

/** A WhatsApp contact card the user can tap to save (helpline / coordinator). */
export interface ContactCard {
  name: string; // full/display name
  phones: string[]; // E.164 numbers, e.g. "+919876543210"
  org?: string;
}

/** A location pin (party office / ID collection center). */
export interface LocationPin {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/**
 * A WhatsApp Flow invitation — opens a native in-chat form. Sent via a direct
 * Graph API call referencing a published `flowId`. `token` correlates the
 * completion webhook back to an action; `data` seeds the first screen.
 */
export interface FlowMessage {
  flowId: string;
  token: string; // correlation token echoed back on completion
  screen: string; // initial screen id in the Flow JSON
  cta: string; // button label, <= 20 chars
  body: string; // message body shown above the button, <= 1024
  header?: string;
  footer?: string;
  data?: Record<string, unknown>; // flow_action_payload data for the first screen
}

/** What a flow returns. The renderer may split this into several WhatsApp messages. */
export interface BotResponse {
  text?: string; // markdown; <= 4096 chars (renderer splits if longer)
  buttons?: Button[]; // <= 3 -> reply buttons
  list?: ListMessage; // 4-10 options -> list message
  documents?: DocumentAttachment[];
  media?: MediaAttachment[];
  linkButton?: LinkButton;
  carousel?: CarouselMessage; // 2-10 media cards -> interactive media carousel
  contacts?: ContactCard[]; // tappable contact cards (helpline / coordinator)
  location?: LocationPin; // a map pin (sent after any text/buttons)
  flow?: FlowMessage; // opens a native WhatsApp Flow form
  // Public HTTPS preview image. On reply-button messages it renders as a native
  // image header (one bubble). On lists (WhatsApp allows only a text header) it
  // is sent as a leading image message just above the list.
  headerImage?: string;
}

export type Reply = BotResponse | BotResponse[];

/** Conversation session, Redis-backed. `state` is ported from the prototype. */
export interface Session {
  state: string; // 'idle' | 'id-confirm' | 'id' | `poll:${pollId}`
  data: Record<string, unknown>;
}

/** Everything a flow needs. Fully decoupled from the transport. */
export interface FlowContext {
  /** Canonical user id (WhatsApp thread id / Telegram chat id / ...). */
  userId: string;
  /** Raw text the user typed, if any. */
  text?: string;
  /** Action id from a tapped button / selected list row, if any. */
  actionId?: string;
  session: Session;
  /** Persist a new conversation state. */
  setState: (state: string, data?: Record<string, unknown>) => Promise<void>;
  services: Services;
  lang: Lang;
}

export type FlowHandler = (ctx: FlowContext) => Promise<Reply>;

// --- Service container (repositories + helpers), injected into every flow ---
import type { Repositories } from "./data/repository.js";
import type { RateLimiter } from "./services/rateLimit.js";
import type { Analytics } from "./services/analytics.js";
import type { LanguageStore } from "./services/prefs.js";

export interface Services {
  repos: Repositories;
  rateLimit: RateLimiter;
  analytics: Analytics;
  /** Long-lived per-user preferences (language). Outlives the session. */
  prefs: LanguageStore;
}
