// -----------------------------------------------------------------------------
// A PostableThread backed purely by direct Graph API calls, for PROACTIVE sends
// that don't originate from an inbound Chat SDK thread (e.g. replying to a
// WhatsApp Flow completion webhook). It implements the same minimal surface the
// renderer uses, so render()/renderOne() work unchanged against it.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import { graphBodyAccepted, type PostPayload, type PostableThread } from "./whatsapp.js";

async function graphPost(message: Record<string, unknown>): Promise<boolean> {
  const token = config.whatsapp.accessToken;
  const phoneId = config.whatsapp.phoneNumberId;
  if (!token || !phoneId) return false;
  try {
    const res = await fetch(`${config.whatsapp.apiUrl}/${config.whatsapp.graphVersion}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "karyakarta-seva-bot/1.0",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...message }),
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!graphBodyAccepted(res.status, body)) {
      console.error("WhatsApp graph send failed", res.status, text.slice(0, 400));
      return false;
    }
    return true;
  } catch (err) {
    console.error("WhatsApp graph send failed", err instanceof Error ? err.message : "network");
    return false;
  }
}

const MEDIA_KEY = { image: "image", video: "video", file: "document", audio: "audio" } as const;

/** Build a PostableThread that sends everything to `toWaId` via the Graph API. */
export function graphThread(toWaId: string): PostableThread {
  return {
    id: `wa:${toWaId}`,
    adapter: {
      // The renderer's interactive path calls this for reply buttons / lists.
      sendInteractiveMessage: async (_threadId, to, interactive) => {
        const ok = await graphPost({ to, type: "interactive", interactive });
        if (!ok) throw new Error("interactive send failed");
      },
      decodeThreadId: () => ({ userWaId: toWaId }),
    },
    async post(payload: PostPayload | string) {
      if (typeof payload === "string") {
        await graphPost({ to: toWaId, type: "text", text: { body: payload } });
        return;
      }
      if (payload.attachments?.length) {
        for (const a of payload.attachments) {
          if (!a.url) continue;
          const key = MEDIA_KEY[a.type];
          const media: Record<string, unknown> = { link: a.url };
          if (a.name) media.filename = a.name;
          if (payload.markdown) media.caption = payload.markdown;
          await graphPost({ to: toWaId, type: key, [key]: media });
        }
        return;
      }
      if (payload.markdown) {
        await graphPost({ to: toWaId, type: "text", text: { body: payload.markdown } });
      }
    },
  };
}
