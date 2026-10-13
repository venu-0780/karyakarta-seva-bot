# Karyakarta Seva Bot

Multi-platform conversational bot ported from the `Karyakarta Seva Bot.html` prototype.
**WhatsApp-first** (via [Chat SDK](https://chat-sdk.dev/adapters/official/whatsapp)), with a
channel-agnostic core so Telegram / web can be added later without touching flow logic.

> ⚠️ **Read [`docs/DESIGN.md` §0](docs/DESIGN.md) before go-live.** Meta permanently prohibits
> political parties/candidates/campaigns on the WhatsApp Business Platform worldwide, and
> daily broadcasts at >1 lakh scale carry serious cost/quality/tier risk. The code is built so
> the same bot can fall back to Telegram if WhatsApp is blocked.

## Architecture in one line
`webhook → Chat SDK → router → flows (return BotResponse) → renderer → WhatsApp`.
Flows never import a platform SDK; only `src/render/whatsapp.ts` does.

```
app/api/webhooks/whatsapp/route.ts   HTTP entry (Next.js App Router)
src/bot.ts                           Chat SDK instance + handlers
src/router.ts                        text/action → flow (mirrors prototype run/onText)
src/flows/*                          the 7 flows (platform-agnostic)
src/render/whatsapp.ts               BotResponse → Chat SDK posts (WhatsApp limits)
src/data/*                           repository interfaces + sample data
src/services/*                       session, rate limit, i18n
scripts/broadcast.ts                 scheduled 7AM/6PM template pushes
scripts/alerts.ts                    proactive alerts (press LIVE / ID ready)
docs/DESIGN.md                       full design + compliance/scale notes
```

## Premium extras (beyond the 7 flows)
- **Human handoff** — when the bot can't help (or the member asks for a person /
  files a complaint), it offers to route the query to a coordinator. The ticket
  is stored and forwarded to `COORDINATOR_WA_ID` over WhatsApp with context.
- **Proactive alerts** — `npm run alert -- press-live` and
  `npm run alert -- id-ready <mobile>...` push approved templates when a press
  meet goes LIVE or a membership card reaches "Ready to collect" (states already
  modeled in the data). Selection logic lives in `src/services/alerts.ts`.
  Press-live alerts go to everyone who has messaged the bot (recorded in Redis
  by `src/services/subscribers.ts`); on a dev app that's whoever is on the
  Meta "To" allow list and has said hi.
- **Poll results as a real chart image** — rendered as a PNG bar chart (Telugu +
  English) by `app/api/chart/poll/[id]/route.tsx` (next/og). Exact numbers are
  still sent as text, so results survive even if the image can't load. Disable
  with `CHART_IMAGES=0`.
- **Tests** — `npm test` runs the routing, renderer, classifier, chart, alert,
  and intent-matching unit tests (Node's test runner via tsx, no network).

## The 7 flows
1. Daily talking points · 2. Praja Sankalpam · 3. Press meet schedule · 4. Jagan Sir press meets ·
5. Opinion polls · 6. ID card status · 7. Posters / reels / images.
All run end-to-end on the sample data in `src/data/sample.ts`.

## Setup
```bash
cp .env.example .env     # fill in the 4 WHATSAPP_* values (see below)
npm install
npm run typecheck        # expects deps installed
npm test                 # unit tests (routing / renderer / classifier / charts)
npm run dev              # serves the webhook at /api/webhooks/whatsapp (port 3000)
```
State uses an **in-memory store by default** (no Redis needed for local dev / a single
instance). Set `REDIS_URL` to use Redis for multi-instance state in production.

## Connect to WhatsApp
1. In the [Meta app dashboard](https://developers.facebook.com/apps) → **WhatsApp → API Setup**,
   copy the **temporary access token**, **phone number ID**, and the **App Secret** (App Settings →
   Basic). Put them in `.env` as `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_APP_SECRET`. Pick any random string for `WHATSAPP_VERIFY_TOKEN`. **All four are
   required — the bot refuses to boot without them.**
2. Expose your local server over HTTPS (Meta only calls public HTTPS URLs), e.g.
   `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`.
3. In **WhatsApp → Configuration → Webhook**, set the callback URL to
   `https://<your-tunnel-domain>/api/webhooks/whatsapp`, enter the **same** `WHATSAPP_VERIFY_TOKEN`,
   and click **Verify and save** (Meta hits `GET` and must get the challenge echoed back).
4. **Subscribe** to the `messages` webhook field (and `user_id_update` if you use it).
5. Send a WhatsApp message to the business number → you should get the Praja Seva Helpdesk menu.

Verify the handshake locally without Meta:
```bash
curl "http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<your-token>&hub.challenge=PING"
# → PING
```

## Going to production (swap the stubs)
- `src/services/session.ts` → Redis-backed `SessionStore`.
- `src/services/rateLimit.ts` → Redis-backed `RateLimiter`.
- `src/data/sample.ts` → real `MembershipRepo`, `ContentRepo`, `PollRepo`, `MediaRepo` (Postgres + CDN).
- `scripts/broadcast.ts` → queue-based fan-out with tier throttling + opt-out handling.
- `src/render/whatsapp.ts` / `src/bot.ts` → confirm the interactive-card DSL + action payload
  against the **installed** `@chat-adapter/whatsapp` version (search for `TODO(verify)`).

## Adding Telegram later
Write `src/render/telegram.ts` + register a Telegram adapter in `src/bot.ts`. The router and all
7 flows are reused unchanged.
```

Find every integration seam with:  `grep -rn "TODO(verify)\|TODO(prod)" src scripts`
