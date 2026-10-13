// -----------------------------------------------------------------------------
// Proactive-alert selection logic.
//
// Two alerts, both derived from state ALREADY modeled in the data:
//   • "press meet is LIVE now"      -> a PressMeet whose status === "live"
//   • "ID card ready to collect"    -> a MembershipRecord at the final stage
//
// These are PURE functions over repository data so they can be unit-tested and
// reused by scripts/alerts.ts (which handles the actual WhatsApp template fan-
// out). Keeping selection separate from delivery mirrors scripts/broadcast.ts.
// -----------------------------------------------------------------------------
import type { ContentRepo, MembershipRecord, PressMeet } from "../data/repository.js";
import { STAGES } from "../data/repository.js";

/** The stage index that means "Ready to collect" (last stage). */
export const READY_STAGE = STAGES.length - 1;

export interface LiveMeet {
  day: "today" | "tmrw" | "yday";
  /** Human day label from the repo (e.g. "Fri, 9 Oct"). */
  label: string;
  meet: PressMeet;
}

/** Every press meet currently marked LIVE, scanning the known days. */
export async function liveMeets(content: ContentRepo): Promise<LiveMeet[]> {
  const days = ["today", "tmrw", "yday"] as const;
  const out: LiveMeet[] = [];
  for (const day of days) {
    const { label, list } = await content.pressMeets(day);
    for (const meet of list) {
      if (meet.status === "live") out.push({ day, label, meet });
    }
  }
  return out;
}

/** Members whose card has reached "Ready to collect". */
export function membersReadyToCollect(records: MembershipRecord[]): MembershipRecord[] {
  return records.filter((r) => r.stage === READY_STAGE);
}

/** One-line alert body for a live press meet (plain text; template body param). */
export function liveMeetAlertText(live: LiveMeet): string {
  const { meet } = live;
  return `🔴 LIVE now — ${meet.who}: "${meet.topic}" at ${meet.where}. Watch: ${meet.link}`;
}

/** One-line alert body for a ready-to-collect card (plain text; template param). */
export function idReadyAlertText(record: MembershipRecord): string {
  return `🪪 Your ID card (${record.mid}) is ready to collect. ${record.where}`;
}

/**
 * Opted-in audience for press-meet alerts. Shared by the CLI script and the
 * HTTP route so they never drift. TODO(prod): replace with
 * AlertRepo.subscribersFor("press-live") — opt-in only, per category.
 */
export async function pressLiveSubscribers(): Promise<string[]> {
  return ["15551234567"]; // sample recipient (E.164, no +)
}
