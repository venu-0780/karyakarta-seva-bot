// -----------------------------------------------------------------------------
// Press-meet registration. The schedule stays in the chat; a second bubble
// opens the native Flow when EVENT_FLOW_ID is set. The form lists that day's
// meets that are still open, so the registration names a real meet.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import type { PressMeet } from "../data/repository.js";
import { eventFormData, senderPrefill } from "./formText.js";
import { L, LB, PH, readLangPref } from "../services/i18n.js";
import type { BotResponse, FlowContext } from "../types.js";

export type EventDay = "today" | "tmrw" | "yday";

/** Option title for one meet, within the 30-character radio limit. */
export function meetOption(meet: PressMeet): string {
  const title = `${meet.time} · ${meet.topic}`;
  return title.length <= 30 ? title : `${title.slice(0, 29)}…`;
}

export function eventInvite(ctx: FlowContext, day: EventDay, meets: PressMeet[]): BotResponse | undefined {
  const flowId = config.flows.event;
  if (!flowId) return undefined;
  const open = meets.map((meet, i) => ({ meet, i })).filter(({ meet }) => meet.status !== "rec");
  if (open.length === 0) return undefined;
  const pref = readLangPref(ctx.session.data);
  return {
    flow: {
      flowId,
      token: `event:${day}`,
      screen: "WHO",
      cta: LB(pref, { te: "నమోదు చేయండి", en: "Register" }),
      body: L(pref, {
        te: "🎟️ ఈ ప్రెస్ మీట్‌కు హాజరు కావాలా? కింద నమోదు చేయండి.",
        en: "🎟️ Want to attend? Register with the button below.",
      }),
      data: eventFormData(
        pref,
        open.map(({ meet, i }) => ({ id: String(i), title: meetOption(meet) })),
        senderPrefill(ctx),
      ),
      footer: LB(pref, PH.formBack),
    },
    text: L(pref, {
      te: "నమోదు ఫారమ్ ఇప్పుడు అందుబాటులో లేదు. కోఆర్డినేటర్‌కు మెసేజ్ పంపండి.",
      en: "The registration form isn't available right now. Message your coordinator to sign up.",
    }),
  };
}
