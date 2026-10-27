import { config, thanksSticker } from "../config.js";
import type { Poll } from "../data/repository.js";
import { backButton, L, LB, PH, readLangPref } from "../services/i18n.js";
import { pollChartModel, pollChartUrl } from "../services/pollChart.js";
import type { FlowContext, ListRow, Reply } from "../types.js";

const CLOSED = { te: "ఆ పోల్ ముగిసింది.", en: "That poll is closed." };

// Flow 5 — list of open polls
export async function polls(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  const all = await ctx.services.repos.polls.list();
  const votedTag = LB(pref, { te: "✓ ఓటు వేశారు · ", en: "✓ Voted · " });
  const rows: ListRow[] = [];
  for (const [i, p] of all.entries()) {
    const voted = await ctx.services.repos.polls.hasVoted(p.id, ctx.userId);
    rows.push({
      id: `poll-${p.id}`,
      title: `${LB(pref, { te: "పోల్", en: "Poll" })} ${i + 1}`,
      description: (voted != null ? votedTag : "") + p.q.slice(0, 68),
    });
  }
  return {
    text: L(pref, {
      te: `🗳️ *అభిప్రాయ పోల్స్* (${all.length})\nఓటు వేయడానికి లేదా ఫలితాలు చూడటానికి ఒక పోల్ ఎంచుకోండి.`,
      en: `🗳️ *Open polls* (${all.length})\nPick a poll to vote or see results.`,
    }),
    list: {
      buttonLabel: LB(pref, PH.choosePoll),
      sections: [{ title: LB(pref, { te: "పోల్స్", en: "Polls" }), rows }],
    },
  };
}

// Show a poll: <=3 options -> buttons; 4-10 -> list. Already voted -> results.
export async function pollShow(ctx: FlowContext, id: string): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const p = await ctx.services.repos.polls.get(id);
  if (!p) return { text: L(pref, CLOSED), buttons: [backButton(pref)] };
  if ((await ctx.services.repos.polls.hasVoted(id, ctx.userId)) != null) return pollResult(ctx, id);

  const flow = config.flows.poll
    ? {
        flowId: config.flows.poll,
        token: `poll:${id}`,
        screen: "POLL",
        cta: LB(pref, PH.vote),
        body: p.q.slice(0, 1024),
        data: {
          question: p.q,
          options: p.opts.map((o, i) => ({ id: String(i), title: o.slice(0, 30) })),
        },
      }
    : undefined;

  if (p.opts.length <= 3) {
    await ctx.setState("idle");
    return {
      ...(flow ? { flow } : {}),
      text: `*${p.q}*\n_${LB(pref, { te: "ఒక ఎంపిక నొక్కండి. ఒకసారి మాత్రమే ఓటు వేయగలరు.", en: "Tap one option. You can vote once." })}_`,
      buttons: p.opts.map((o, i) => ({ id: `vote-${id}-${i}`, label: o.slice(0, 20) })),
    };
  }

  // 4-10 options -> list message. Also accept a typed number as a fallback.
  await ctx.setState(`poll:${id}`);
  return {
    ...(flow ? { flow } : {}),
    text: `*${p.q}*\n${LB(pref, { te: "ఒక ఎంపిక నొక్కండి లేదా దాని నంబర్ పంపండి.", en: "Tap an option or reply with its number." })}`,
    list: {
      buttonLabel: LB(pref, PH.vote),
      sections: [
        {
          title: LB(pref, { te: "ఎంపికలు", en: "Options" }),
          rows: p.opts.slice(0, 10).map((o, i) => ({ id: `vote-${id}-${i}`, title: o.slice(0, 24) })),
        },
      ],
    },
  };
}

// Record a vote
export async function vote(ctx: FlowContext, id: string, optionIndex: number): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const p = await ctx.services.repos.polls.get(id);
  if (!p) return { text: L(pref, CLOSED), buttons: [backButton(pref)] };
  await ctx.setState("idle");

  const ok = await ctx.services.repos.polls.vote(id, ctx.userId, optionIndex);
  if (!ok) {
    return [
      { text: L(pref, { te: "ఈ పోల్‌లో మీరు ఇప్పటికే ఓటు వేశారు.", en: "You already voted in this poll." }) },
      ...toArray(await pollResult(ctx, id)),
    ];
  }
  const sticker = thanksSticker();
  return [
    {
      reactionEmoji: "✅",
      ...(sticker ? { sticker } : {}),
      text: L(pref, {
        te: `✅ ధన్యవాదాలు! *${p.opts[optionIndex]}* కు మీ ఓటు నమోదైంది.`,
        en: `✅ Thank you! Your vote for *${p.opts[optionIndex]}* is recorded.`,
      }),
    },
    ...toArray(await pollResult(ctx, id)),
  ];
}

// Poll results. Premium path: a real bar-chart image (rendered by the next/og
// route /api/chart/poll/*) with the exact numbers underneath as text — so the
// result is both a clean visual AND fully readable if the image can't load.
// Set CHART_IMAGES=0 to fall back to the original inline ASCII bars.
export async function pollResult(ctx: FlowContext, id: string): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const p = await ctx.services.repos.polls.get(id);
  if (!p) return { text: L(pref, CLOSED), buttons: [backButton(pref)] };
  const mine = await ctx.services.repos.polls.hasVoted(id, ctx.userId);
  const total = p.votes.reduce((a, b) => a + b, 0) || 1;
  const votesWord = LB(pref, { te: "ఓట్లు", en: "votes" });
  const header = `*${LB(pref, { te: "ఇప్పటి వరకు ఫలితాలు", en: "Results so far" })}* · ${total.toLocaleString("en-IN")} ${votesWord}`;
  const buttons = [
    { id: "poll", label: LB(pref, PH.otherPolls) },
    ...(config.flows.survey ? [{ id: "survey", label: LB(pref, { te: "రేట్ చేయండి", en: "Rate the bot" }) }] : []),
    backButton(pref),
  ];

  if (config.charts.enabled) {
    const model = pollChartModel(p, mine);
    const url = pollChartUrl(config.publicBaseUrl, p, mine);
    const lines = model.options
      .map((o) => `${o.mine ? "✅" : "▫️"} ${o.label} — *${o.votes.toLocaleString("en-IN")}* (${o.pct}%)`)
      .join("\n");
    // Chart first (question + bars are in the image). The exact figures and the
    // buttons follow in the next bubble, so they sit under the chart rather
    // than repeating the question in the caption.
    return [
      { media: [{ kind: "image", url, caption: header }] },
      { text: lines, buttons },
    ];
  }

  // Fallback: inline ASCII bars (WhatsApp has no native chart).
  const bars = p.opts
    .map((o, i) => {
      const pc = Math.round(((p.votes[i] ?? 0) / total) * 100);
      const filled = Math.round(pc / 10);
      const bar = "█".repeat(filled) + "░".repeat(10 - filled);
      return `${o}${mine === i ? " ✓" : ""}\n${bar} ${pc}%`;
    })
    .join("\n\n");
  return { text: `${header}\n_${p.q}_\n\n${bars}`, buttons };
}

function toArray(r: Reply): import("../types.js").BotResponse[] {
  return Array.isArray(r) ? r : [r];
}

export type { Poll };
