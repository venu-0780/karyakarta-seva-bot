import { BRAND_IMAGES } from "../data/sample.js";
import { backButton, L, LB, PH, readLangPref } from "../services/i18n.js";
import type { BotResponse, FlowContext, ListRow, Reply } from "../types.js";

// Flow 4 — Jagan Sir press meets: browse hub
export async function jagan(ctx: FlowContext): Promise<Reply> {
  await ctx.setState("idle");
  const pref = readLangPref(ctx.session.data);
  const meets = await ctx.services.repos.content.jaganMeets();
  const latest = meets[0];
  const heading = L(pref, { te: "🎙️ *నేత ప్రెస్ మీట్‌లు*", en: "🎙️ *Leader press meets*" });
  const latestLine = latest
    ? `${LB(pref, { te: "తాజా", en: "Latest" })}: *${latest.title}*\n_${latest.date} · ${latest.topic}_\n\n`
    : "";
  const ask = L(pref, { te: "ఎలా చూడాలనుకుంటున్నారు?", en: "How would you like to browse?" });
  return {
    text: `${heading}\n${latestLine}${ask}`,
    headerImage: BRAND_IMAGES.leader,
    buttons: [
      { id: latest ? `jm-${latest.id}` : "jagan", label: LB(pref, PH.latestMeet) },
      { id: "j-date", label: LB(pref, PH.byDate) },
      { id: "j-topic", label: LB(pref, PH.byTopic) },
    ],
  };
}

// Browse by date -> list message (<=10 rows)
export async function jaganByDate(ctx: FlowContext): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const meets = await ctx.services.repos.content.jaganMeets();
  const rows: ListRow[] = meets.slice(0, 10).map((m) => ({
    id: `jm-${m.id}`,
    title: m.date.replace(" 2026", ""),
    description: m.topic,
  }));
  return {
    text: L(pref, { te: "*తేదీ వారీగా ప్రెస్ మీట్‌లు*\nఒక తేదీ ఎంచుకోండి.", en: "*Press meets by date*\nPick a date." }),
    list: {
      buttonLabel: LB(pref, { te: "తేదీ ఎంచుకోండి", en: "Choose date" }),
      sections: [{ title: LB(pref, { te: "తేదీలు", en: "Dates" }), rows }],
    },
  };
}

// Browse by topic -> list message grouped by topic
export async function jaganByTopic(ctx: FlowContext): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const meets = await ctx.services.repos.content.jaganMeets();
  const topics = [...new Set(meets.map((m) => m.topic))];
  const countWord = (n: number) => LB(pref, { te: `${n} ప్రెస్ మీట్‌లు`, en: `${n} press meet(s)` });
  const rows: ListRow[] = topics.slice(0, 10).map((topicName) => ({
    id: `jt-${topicName}`,
    title: topicName.slice(0, 24),
    description: countWord(meets.filter((m) => m.topic === topicName).length),
  }));
  return {
    text: L(pref, { te: "*అంశం వారీగా ప్రెస్ మీట్‌లు*\nఒక అంశం ఎంచుకోండి.", en: "*Press meets by topic*\nPick a topic." }),
    list: {
      buttonLabel: LB(pref, { te: "అంశం ఎంచుకోండి", en: "Choose topic" }),
      sections: [{ title: LB(pref, { te: "అంశాలు", en: "Topics" }), rows }],
    },
  };
}

// All meets under one topic
export async function jaganTopic(ctx: FlowContext, topic: string): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const meets = (await ctx.services.repos.content.jaganMeets()).filter((m) => m.topic === topic);
  const rows: ListRow[] = meets.slice(0, 9).map((m) => ({
    id: `jm-${m.id}`,
    title: m.date.replace(" 2026", ""),
    description: m.title.slice(0, 72),
  }));
  rows.push({ id: "j-topic", title: LB(pref, PH.otherTopics) });
  const countWord = LB(pref, { te: `${meets.length} ప్రెస్ మీట్‌లు`, en: `${meets.length} press meet(s)` });
  return {
    text: `*${topic}* · ${countWord}`,
    list: {
      buttonLabel: LB(pref, { te: "మీట్ తెరవండి", en: "Open meet" }),
      sections: [{ title: topic.slice(0, 24), rows }],
    },
  };
}

// A single meet: summary + full video link + reels (sent as media)
export async function jaganMeet(ctx: FlowContext, id: string): Promise<Reply> {
  const pref = readLangPref(ctx.session.data);
  const m = await ctx.services.repos.content.jaganMeet(id);
  if (!m) {
    return {
      text: L(pref, { te: "ఆ ప్రెస్ మీట్ ఇప్పుడు అందుబాటులో లేదు.", en: "That press meet is no longer available." }),
      buttons: [backButton(pref)],
    };
  }

  const dateLbl = LB(pref, { te: "తేదీ", en: "Date" });
  const topicLbl = LB(pref, { te: "అంశం", en: "Topic" });
  const venueLbl = LB(pref, { te: "వేదిక", en: "Venue" });
  const lenLbl = LB(pref, { te: "నిడివి", en: "Length" });
  const reelsLbl = LB(pref, { te: "*ఈ ప్రెస్ మీట్ నుండి రీల్స్:*", en: "*Reels from this press meet:*" });
  const fullVideo = LB(pref, { te: "పూర్తి వీడియో", en: "Full video" });

  const summary: BotResponse[] = [
    {
      text:
        `🎙️ *${m.title}*\n\n` +
        `${dateLbl}: ${m.date}\n${topicLbl}: ${m.topic}\n${venueLbl}: ${m.where}\n${lenLbl}: ${m.dur}\n\n` +
        (m.link.startsWith("http") ? "" : `${fullVideo}: ${m.link}\n\n`) +
        reelsLbl,
      ...(m.link.startsWith("http")
        ? { linkButton: { label: LB(pref, PH.watchVideo), url: m.link } }
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
    text: LB(pref, { te: "మరిన్ని చూడండి:", en: "Browse more:" }),
    buttons: [{ id: "j-date", label: LB(pref, PH.byDate) }, { id: "j-topic", label: LB(pref, PH.byTopic) }, backButton(pref)],
  });
  return summary;
}
