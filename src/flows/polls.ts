import type { Poll } from "../data/repository.js";
import type { FlowContext, ListRow, Reply } from "../types.js";
import { BACK } from "./menu.js";

// Flow 5 — list of open polls
export async function polls(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  const all = await ctx.services.repos.polls.list();
  const rows: ListRow[] = [];
  for (const [i, p] of all.entries()) {
    const voted = await ctx.services.repos.polls.hasVoted(p.id, ctx.userId);
    rows.push({
      id: `poll-${p.id}`,
      title: `Poll ${i + 1}`,
      description: (voted != null ? "✓ Voted · " : "") + p.q.slice(0, 68),
    });
  }
  return {
    text: `🗳️ *Open polls* (${all.length})\nPick a poll to vote or see results.`,
    list: { buttonLabel: "Choose poll", sections: [{ title: "Polls", rows }] },
  };
}

// Show a poll: <=3 options -> buttons; 4-10 -> list. Already voted -> results.
export async function pollShow(ctx: FlowContext, id: string): Promise<Reply> {
  const p = await ctx.services.repos.polls.get(id);
  if (!p) return { text: "That poll is closed.", buttons: [BACK] };
  if ((await ctx.services.repos.polls.hasVoted(id, ctx.userId)) != null) return pollResult(ctx, id);

  if (p.opts.length <= 3) {
    await ctx.setState("idle");
    return {
      text: `*${p.q}*\n_Tap one option. You can vote once._`,
      buttons: p.opts.map((o, i) => ({ id: `vote-${id}-${i}`, label: o.slice(0, 20) })),
    };
  }

  // 4-10 options -> list message. Also accept a typed number as a fallback.
  await ctx.setState(`poll:${id}`);
  return {
    text: `*${p.q}*\nTap an option or reply with its number.`,
    list: {
      buttonLabel: "Vote",
      sections: [{ title: "Options", rows: p.opts.slice(0, 10).map((o, i) => ({ id: `vote-${id}-${i}`, title: o.slice(0, 24) })) }],
    },
  };
}

// Record a vote
export async function vote(ctx: FlowContext, id: string, optionIndex: number): Promise<Reply> {
  const p = await ctx.services.repos.polls.get(id);
  if (!p) return { text: "That poll is closed.", buttons: [BACK] };
  await ctx.setState("idle");

  const ok = await ctx.services.repos.polls.vote(id, ctx.userId, optionIndex);
  if (!ok) {
    return [{ text: "You already voted in this poll." }, ...toArray(await pollResult(ctx, id))];
  }
  return [
    { text: `✅ Thank you! Your vote for *${p.opts[optionIndex]}* is recorded.` },
    ...toArray(await pollResult(ctx, id)),
  ];
}

// Results as a text bar chart (WhatsApp has no native chart)
export async function pollResult(ctx: FlowContext, id: string): Promise<Reply> {
  const p = await ctx.services.repos.polls.get(id);
  if (!p) return { text: "That poll is closed.", buttons: [BACK] };
  const mine = await ctx.services.repos.polls.hasVoted(id, ctx.userId);
  const total = p.votes.reduce((a, b) => a + b, 0) || 1;
  const bars = p.opts
    .map((o, i) => {
      const pc = Math.round(((p.votes[i] ?? 0) / total) * 100);
      const filled = Math.round(pc / 10);
      const bar = "█".repeat(filled) + "░".repeat(10 - filled);
      return `${o}${mine === i ? " ✓" : ""}\n${bar} ${pc}%`;
    })
    .join("\n\n");
  return {
    text: `*Results so far* · ${total.toLocaleString("en-IN")} votes\n_${p.q}_\n\n${bars}`,
    buttons: [{ id: "poll", label: "Other polls" }, BACK],
  };
}

function toArray(r: Reply): import("../types.js").BotResponse[] {
  return Array.isArray(r) ? r : [r];
}

export type { Poll };
