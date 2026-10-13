// -----------------------------------------------------------------------------
// Print the bot's engagement counters for a given UTC day (defaults to today).
//
// Counters are coarse and privacy-safe: feature usage + distinct daily users.
// Meaningful only when REDIS_URL is set (serverless state lives in Redis);
// without it the in-memory store is per-process and will read empty here.
//
// Run: npm run stats            (today)
//      npm run stats -- 2026-10-12
// -----------------------------------------------------------------------------
import { config } from "../src/config.js";
import { MemoryAnalytics, RedisAnalytics, type Analytics } from "../src/services/analytics.js";

const FEATURE_NAMES: Record<string, string> = {
  menu: "Main menu",
  tp: "Talking points",
  ps: "Praja Sankalpam",
  pm: "Press meet schedule",
  jagan: "Leader press meets",
  j: "Leader meets (browse)",
  jm: "Leader meet (open)",
  jt: "Leader meets (topic)",
  poll: "Opinion polls",
  vote: "Poll votes",
  id: "ID card status",
  media: "Posters & reels",
  send: "Media file sent",
  help: "Help",
  handoff: "Human handoff",
  unmatched: "Unrecognized text",
};

// Non-"use:"/"in:" counters worth surfacing (e.g. "handoff:submit").
const EVENT_NAMES: Record<string, string> = {
  "handoff:submit": "Handoff submitted",
};

function label(key: string): string {
  if (EVENT_NAMES[key]) return EVENT_NAMES[key]!;
  const [group, feature] = key.split(":");
  if (group === "in") return feature === "action" ? "Button/list taps" : "Text messages";
  if (group === "use") return FEATURE_NAMES[feature ?? ""] ?? feature ?? key;
  return key;
}

async function main() {
  const date = process.argv[2];
  const analytics: Analytics = config.redisUrl ? new RedisAnalytics() : new MemoryAnalytics();
  const snap = await analytics.snapshot(date);

  console.log(`\nKaryakarta Seva — engagement for ${snap.date}`);
  console.log(`Store: ${config.redisUrl ? "Redis" : "in-memory (per-process; set REDIS_URL for real data)"}`);
  console.log(`\nActive users (DAU): ${snap.activeUsers}`);

  const entries = Object.entries(snap.events).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    console.log("\nNo events recorded for this day.");
  } else {
    const width = Math.max(...entries.map(([k]) => label(k).length));
    console.log("");
    for (const [k, v] of entries) console.log(`  ${label(k).padEnd(width)}   ${v}`);
  }
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
