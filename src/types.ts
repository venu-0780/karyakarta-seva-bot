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

/** What a flow returns. The renderer may split this into several WhatsApp messages. */
export interface BotResponse {
  text?: string; // markdown; <= 4096 chars (renderer splits if longer)
  buttons?: Button[]; // <= 3 -> reply buttons
  list?: ListMessage; // 4-10 options -> list message
  documents?: DocumentAttachment[];
  media?: MediaAttachment[];
  linkButton?: LinkButton;
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

export interface Services {
  repos: Repositories;
  rateLimit: RateLimiter;
}
