import { Chat } from "chat";
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import { createRedisState } from "@chat-adapter/state-redis";
import { createMemoryState } from "@chat-adapter/state-memory";

import { config } from "./config.js";
import { readLangPref } from "./services/i18n.js";
import { createSampleRepositories } from "./data/sample.js";
import { render, type PostableThread } from "./render/whatsapp.js";
import { graphThread } from "./render/graphThread.js";
import { notifyCoordinator } from "./render/coordinatorNotify.js";
import { idCheck } from "./flows/idCard.js";
import { vote } from "./flows/polls.js";
import { runAction, runText } from "./router.js";
import { MemoryRateLimiter, RedisRateLimiter } from "./services/rateLimit.js";
import { MemoryAnalytics, RedisAnalytics } from "./services/analytics.js";
import { MemoryLanguageStore, RedisLanguageStore } from "./services/prefs.js";
import {
  MemoryEscalationStore,
  RedisEscalationStore,
  type EscalationStore,
  type EscalationTicket,
} from "./services/escalation.js";
import { MemorySessionStore, RedisSessionStore, type SessionStore } from "./services/session.js";
import { usableDisplayName } from "./services/displayName.js";
import { subscriberStore } from "./services/subscribers.js";
import type { FlowContext, Reply, Services } from "./types.js";

// --- Service container -------------------------------------------------------
// Redis-backed stores when REDIS_URL is set (required for multi-instance /
// serverless deploys like Vercel, where in-memory state is lost between
// invocations); in-memory otherwise so the bot still boots locally.
const useRedis = Boolean(config.redisUrl);

// Escalation: persist the ticket (Redis/memory) AND notify the coordinator over
// WhatsApp. The notification is a platform concern, so it's composed in here —
// flows only ever see `escalation.create`, keeping them transport-agnostic.
const escalationStore = useRedis ? new RedisEscalationStore() : new MemoryEscalationStore();
const escalation: EscalationStore = {
  recent: (limit) => escalationStore.recent(limit),
  async create(ticket: EscalationTicket) {
    await escalationStore.create(ticket);
    await notifyCoordinator(ticket);
  },
};

const services: Services = {
  repos: createSampleRepositories(),
  rateLimit: useRedis ? new RedisRateLimiter() : new MemoryRateLimiter(),
  analytics: useRedis ? new RedisAnalytics() : new MemoryAnalytics(),
  prefs: useRedis ? new RedisLanguageStore() : new MemoryLanguageStore(),
  escalation,
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
    whatsapp: createWhatsAppAdapter({
      apiUrl: config.whatsapp.apiUrl,
      apiVersion: config.whatsapp.graphVersion,
    }),
  },
  state,
});

/** Build a FlowContext for a given user, loading + persisting session state. */
async function makeContext(
  userId: string,
  input: { text?: string; actionId?: string },
): Promise<FlowContext> {
  const session = await sessions.get(userId);
  // Seed the language from the long-lived store so a returning user (whose 24h
  // session expired) keeps their choice and never sees the picker again.
  if (session.data.langPref === undefined) {
    const saved = await services.prefs.get(userId);
    if (saved) session.data.langPref = saved;
  }
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

/** Keep the WhatsApp profile name on the session so the welcome can use it. */
function rememberDisplayName(ctx: FlowContext, raw: unknown): void {
  const name = usableDisplayName(raw);
  if (!name || ctx.session.data.displayName === name) return;
  ctx.session.data = { ...ctx.session.data, displayName: name };
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
  await services.analytics.track("in:text", userId);
  await subscriberStore().add(userId);
  const ctx = await makeContext(userId, { text });
  rememberDisplayName(ctx, message.author?.fullName ?? message.author?.userName);
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
  await services.analytics.track("in:action", userId);
  await subscriberStore().add(userId);
  const ctx = await makeContext(userId, { actionId });
  rememberDisplayName(ctx, event.user?.fullName ?? event.user?.userName);
  const reply = await runAction(ctx, actionId);
  await rememberList(ctx, reply);
  await render(thread as PostableThread, reply);
});

/**
 * Handle a WhatAPI webhook without using the Chat SDK's sender. WhatAPI accepts
 * Meta-shaped requests but returns a different success body, so the SDK treats
 * a delivered message as failed and retries it. Direct sends avoid duplicate
 * replies and keep media URLs out of the chat body.
 */
export async function handleWhatApiWebhook(payload: unknown): Promise<void> {
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        const item = message as Record<string, any>;
        const waId = typeof item.from === "string" ? item.from : "";
        if (!waId || item.type === "system") continue;
        const ownNumber =
          config.whatsapp.businessNumber ??
          String((value?.metadata as Record<string, unknown> | undefined)?.display_phone_number ?? "").replace(/\D/g, "");
        if (item.from_me === true || item.direction === "outbound" || (ownNumber && waId === ownNumber)) {
          continue;
        }

        const ctx = await makeContext(waId, {});
        const contact = Array.isArray(value?.contacts) ? value.contacts[0] : undefined;
        rememberDisplayName(ctx, (contact as any)?.profile?.name);
        await services.analytics.track(item.interactive ? "in:action" : "in:text", waId);
        await subscriberStore().add(waId);

        const actionId =
          item.interactive?.button_reply?.id ??
          item.interactive?.list_reply?.id ??
          item.button?.payload;
        const text =
          item.text?.body ??
          item.button?.text ??
          item.interactive?.button_reply?.title ??
          item.interactive?.list_reply?.title;
        const reply =
          typeof actionId === "string" && actionId
            ? await runAction(ctx, actionId)
            : await runText(ctx, typeof text === "string" ? text : "");
        await rememberList(ctx, reply);
        await render(graphThread(waId), reply);
      }
    }
  }
}

/**
 * Handle a WhatsApp Flow completion (see services/flowWebhook.ts). The webhook
 * route calls this for an `nfm_reply`. We rebuild the user's context, dispatch
 * by the correlation token, and reply over a direct-Graph-API thread.
 */
export async function handleFlowCompletion(
  waId: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const ctx = await makeContext(waId, {});
  await services.analytics.track("in:flow", waId);
  await subscriberStore().add(waId);
  let reply: Reply = [];
  if (token === "idstatus") {
    const mobile = String(payload.mobile ?? "");
    if (mobile) reply = await idCheck(ctx, mobile);
  } else if (token.startsWith("poll:")) {
    const pollId = token.slice(5);
    const choice = Number(payload.choice);
    if (Number.isInteger(choice)) reply = await vote(ctx, pollId, choice);
  }
  if ((Array.isArray(reply) && reply.length === 0) || !reply) return;
  const thread = graphThread(waId);
  await rememberList(ctx, reply);
  await render(thread, reply);
}
