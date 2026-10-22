// -----------------------------------------------------------------------------
// A PostableThread backed purely by direct Graph API calls, for PROACTIVE sends
// that don't originate from an inbound Chat SDK thread (e.g. replying to a
// WhatsApp Flow completion webhook). It implements the same minimal surface the
// renderer uses, so render()/renderOne() work unchanged against it.
// -----------------------------------------------------------------------------
import { config } from "../config.js";
import type { PostPayload, PostableThread } from "./whatsapp.js";

async function graphPost(message: Record<string, unknown>): Promise<void> {
  const token = config.whatsapp.accessToken;
  const phoneId = config.whatsapp.phoneNumberId;
  if (!token || !phoneId) return;
  try {
    await fetch(`${config.whatsapp.apiUrl}/${config.whatsapp.graphVersion}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...message }),
    });
  } catch {
    // best-effort proactive send
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
        await graphPost({ to, type: "interactive", interactive });
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
