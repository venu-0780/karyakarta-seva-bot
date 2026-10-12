import { Chat } from "chat";
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { createRedisState } from "@chat-adapter/state-redis";
import { createMemoryState } from "@chat-adapter/state-memory";

import { config } from "./config.js";
import { readLangPref } from "./services/i18n.js";
import { createSampleRepositories } from "./data/sample.js";
import { render, type PostableThread } from "./render/whatsapp.js";
import { runAction, runText } from "./router.js";
import { MemoryRateLimiter, RedisRateLimiter } from "./services/rateLimit.js";
import { MemorySessionStore, RedisSessionStore, type SessionStore } from "./services/session.js";
import type { FlowContext, Reply, Services } from "./types.js";

// --- Service container -------------------------------------------------------
// Redis-backed stores when REDIS_URL is set (required for multi-instance /
// serverless deploys like Vercel, where in-memory state is lost between
// invocations); in-memory otherwise so the bot still boots locally.
const useRedis = Boolean(config.redisUrl);
const services: Services = {
  repos: createSampleRepositories(),
  rateLimit: useRedis ? new RedisRateLimiter() : new MemoryRateLimiter(),
};
const sessions: SessionStore = useRedis ? new RedisSessionStore() : new MemorySessionStore();

// --- Chat SDK instance -------------------------------------------------------
// The WhatsApp adapter auto-detects WHATSAPP_* env vars. State (subscriptions,
// locks) uses Redis when REDIS_URL is set (multi-instance / scale), otherwise an
// in-memory store so the bot boots locally without extra infrastructure.
const state = config.redisUrl
  ? createRedisState({ url: config.redisUrl })
  : createMemoryState();

export const bot = new Chat({
  userName: config.whatsapp.botUsername,
  adapters: {
    whatsapp: createWhatsAppAdapter(),
  },
  state,
});

/** Build a FlowContext for a given user, loading + persisting session state. */
async function makeContext(
  userId: string,
  input: { text?: string; actionId?: string },
): Promise<FlowContext> {
  const session = await sessions.get(userId);
  return {
    userId,
    text: input.text,
    actionId: input.actionId,
    session,
    lang: readLangPref(session.data) === "en" ? "en" : config.defaultLang,
    services,
    async setState(state, data) {
      session.state = state;
      session.data = data ?? session.data;
      await sessions.set(userId, session);
    },
  };
}

/**
 * WhatsApp (in this adapter) has no native list message, so lists are rendered
 * as numbered text. Remember each shown list's row ids keyed by 1-based number,
 * so a numeric text reply can be routed back to the right action. Persist the
 * session afterwards (also covers flows that didn't call setState).
 */
async function rememberList(ctx: FlowContext, reply: Reply): Promise<void> {
  const responses = Array.isArray(reply) ? reply : [reply];
  const withList = responses.find((r) => r.list);
  if (withList?.list) {
    const rows = withList.list.sections.flatMap((s) => s.rows);
    const map: Record<string, string> = {};
    rows.forEach((row, i) => {
      map[String(i + 1)] = row.id;
    });
    ctx.session.data = { ...ctx.session.data, pendingList: map };
  } else {
    const { pendingList: _drop, ...rest } = ctx.session.data;
    ctx.session.data = rest;
  }
  await sessions.set(ctx.userId, ctx.session);
}

// --- Handlers ----------------------------------------------------------------
// Direct message (text). The prototype is a 1:1 DM bot.
bot.onDirectMessage(async (thread: any, message: any) => {
  const userId = String(thread.id ?? message.from);
  const text = String(message.text ?? "");
  // Read receipts and typing are optional. A failure here (for example Meta's
  // webhook "Test" sample) must not stop the actual reply.
  await thread.markAsRead?.().catch(() => {});
  await thread.startTyping?.().catch(() => {});
  const ctx = await makeContext(userId, { text });
  const reply = await runText(ctx, text);
  await rememberList(ctx, reply);
  await render(thread as PostableThread, reply);
});

// Button taps / list selections.
// Chat SDK v4 delivers a single ActionEvent: { actionId, thread, threadId, user, value }.
bot.onAction(async (event: any) => {
  const thread = event.thread;
  const userId = String(event.threadId ?? thread?.id ?? event.user?.id ?? "");
  const actionId = String(event.actionId ?? event.value ?? "");
  await thread?.startTyping?.().catch(() => {});
  const ctx = await makeContext(userId, { actionId });
  const reply = await runAction(ctx, actionId);
  await rememberList(ctx, reply);
  await render(thread as PostableThread, reply);
});
