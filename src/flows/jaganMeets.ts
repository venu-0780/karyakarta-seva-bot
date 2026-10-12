import { BRAND_IMAGES } from "../data/sample.js";
import type { BotResponse, FlowContext, ListRow, Reply } from "../types.js";
import { BACK } from "./menu.js";

// Flow 4 — Jagan Sir press meets: browse hub
export async function jagan(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  const meets = await ctx.services.repos.content.jaganMeets();
  const latest = meets[0];
  return {
    text:
      `🎙️ *Jagan Sir press meets*\n` +
      (latest ? `Latest: *${latest.title}*\n_${latest.date} · ${latest.topic}_\n\n` : "") +
      `How would you like to browse?`,
    headerImage: BRAND_IMAGES.leader,
    buttons: [
      { id: latest ? `jm-${latest.id}` : "jagan", label: "Latest press meet" },
      { id: "j-date", label: "By date" },
      { id: "j-topic", label: "By topic" },
    ],
  };
}

// Browse by date -> list message (<=10 rows)
export async function jaganByDate(ctx: FlowContext): Promise<Reply> {
  const meets = await ctx.services.repos.content.jaganMeets();
  const rows: ListRow[] = meets.slice(0, 10).map((m) => ({
    id: `jm-${m.id}`,
    title: m.date.replace(" 2026", ""),
    description: m.topic,
  }));
  return {
    text: "*Press meets by date*\nPick a date.",
    list: { buttonLabel: "Choose date", sections: [{ title: "Dates", rows }] },
  };
}

// Browse by topic -> list message grouped by topic
export async function jaganByTopic(ctx: FlowContext): Promise<Reply> {
  const meets = await ctx.services.repos.content.jaganMeets();
  const topics = [...new Set(meets.map((m) => m.topic))];
  const rows: ListRow[] = topics.slice(0, 10).map((topicName) => ({
    id: `jt-${topicName}`,
    title: topicName.slice(0, 24),
    description: `${meets.filter((m) => m.topic === topicName).length} press meet(s)`,
  }));
  return {
    text: "*Press meets by topic*\nPick a topic.",
    list: { buttonLabel: "Choose topic", sections: [{ title: "Topics", rows }] },
  };
}

// All meets under one topic
export async function jaganTopic(ctx: FlowContext, topic: string): Promise<Reply> {
  const meets = (await ctx.services.repos.content.jaganMeets()).filter((m) => m.topic === topic);
  const rows: ListRow[] = meets.slice(0, 9).map((m) => ({
    id: `jm-${m.id}`,
    title: m.date.replace(" 2026", ""),
    description: m.title.slice(0, 72),
  }));
  rows.push({ id: "j-topic", title: "Other topics" });
  return {
    text: `*${topic}* · ${meets.length} press meet(s)`,
    list: { buttonLabel: "Open meet", sections: [{ title: topic.slice(0, 24), rows }] },
  };
}

// A single meet: summary + full video link + reels (sent as media)
export async function jaganMeet(ctx: FlowContext, id: string): Promise<Reply> {
  const m = await ctx.services.repos.content.jaganMeet(id);
  if (!m) return { text: "That press meet is no longer available.", buttons: [BACK] };

  const summary: BotResponse[] = [
    {
      text:
        `🎙️ *${m.title}*\n\n` +
        `Date: ${m.date}\nTopic: ${m.topic}\nVenue: ${m.where}\nLength: ${m.dur}\n\n` +
        (m.link.startsWith("http") ? "" : `Full video: ${m.link}\n\n`) +
        `*Reels from this press meet:*`,
      ...(m.link.startsWith("http")
        ? { linkButton: { label: "Watch full video", url: m.link } }
        : {}),
    },
  ];

  // Each reel is its own media message (WhatsApp: one media item per message).
  for (const reel of m.reels) {
    summary.push({
      media: [{ kind: "video", url: reel.url, caption: `${reel.subtitle} · ${m.title}` }],
    });
  }

  summary.push({
    text: "Browse more:",
    buttons: [{ id: "j-date", label: "By date" }, { id: "j-topic", label: "By topic" }, BACK],
  });
  return summary;
}
