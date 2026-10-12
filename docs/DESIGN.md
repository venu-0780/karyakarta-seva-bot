# Karyakarta Seva Bot — Design & Architecture

> Multi-platform conversational bot ported from the `Karyakarta Seva Bot.html` prototype.
> Active channel: **WhatsApp** (via Chat SDK). Architecture is channel-agnostic so Telegram,
> web, or others can be added without touching flow logic.

---

## 0. Read this first — compliance & scale risks

These are **business/legal blockers**, not engineering ones. They are documented here because
the decision was made to proceed on WhatsApp regardless. Keep them visible to stakeholders.

### 0.1 Political-use ban (hard blocker for WhatsApp)
Meta's WhatsApp Business Messaging Policy **permanently and worldwide prohibits political
parties, politicians, candidates, campaigns, and agencies/teams acting on their behalf** from
using the WhatsApp Business Platform. This applies in India and is enforced directly by Meta;
no Business Solution Provider (BSP) can grant an exception.

- Source: https://whatsappbusiness.com/policy/ (Policy on Government and Political Use)
- Source: https://habarichat.ai/help/whatsapp-political-parties-government.html

**Implication:** An account branded as a party service ("YSRCP Karyakarta Seva") is likely to be
rejected at business verification or banned later — taking the phone number and approved
templates with it. Mitigations (all carry risk, none guaranteed):
1. Register the WhatsApp Business Account under a **non-political legal entity** (e.g. a
   registered trust / foundation / media org / citizen-service body) with its own branding,
   and keep content issue-based rather than campaign/candidate-based.
2. If a **government entity** owns it (citizen services), WhatsApp is permitted but **only via a
   Solution Provider**, never a direct connection.
3. Keep the **channel-agnostic core** (this repo) so the exact same bot can run on **Telegram**
   (no such ban, free messaging) if/when WhatsApp is shut down. This is the recommended fallback.

### 0.2 Daily-broadcast friction & cost (>1 lakh scale)
- WhatsApp **messaging tiers** start at 1,000 business-initiated msgs/day (Tier 1), climbing to
  10k → 100k → unlimited only with sustained high quality over weeks.
  Source: https://whatsender.dev/blog/whatsapp-api-message-tiers-india-2026
- Reaching >1 lakh/day requires the **invite-only unlimited tier** and a spotless quality rating.
- **Daily** pushes drive blocks and tier downgrades. Platform guidance is 1–2 broadcasts/week.
- The two scheduled pushes (talking points, Praja Sankalpam) would be billed as **Marketing
  templates (~₹0.8631/msg in India, Oct 2026)**. At 1 lakh workers × 2/day × 30 days ≈ **₹51.8L/mo**
  in Meta fees alone, before BSP markup + 18% GST.
  Source: https://chatmitra.com/blog/whatsapp-business-cost-per-message/
- **Pull/interactive flows (3–7)** sit inside the 24-hour **service window**: 1,000 free service
  messages/number/month, then ₹0.1150 each (from 1 Oct 2026). These are cheap and the natural fit.

**Design response:** treat the daily broadcasts as the expensive/risky surface. Prefer opt-in,
weekly digest cadence, and consider a **WhatsApp Channel** (consumer broadcast) or **Telegram**
for the push PDFs while keeping the interactive bot on the API.

### 0.3 Data protection (DPDP Act)
Flow 6 (ID-card lookup) processes **registered mobile numbers** against a membership DB. Collect
explicit consent, log opt-in/opt-out, mask numbers in all replies (prototype already does
`9876XXXXX0`), rate-limit lookups (5/hour/sender), and retain audit logs.

---

## 1. Goals

- Port the 7 prototype flows to a production bot with **identical UX**.
- **Channel-agnostic core**: flow logic never imports a platform SDK directly.
- WhatsApp as the first live adapter; Telegram/web addable later with ~zero flow changes.
- Back sample data with real repositories (membership DB, content store, media/CDN).
- Scheduled broadcasts (7 AM talking points, 6 PM Praja Sankalpam) via approved templates.
- Admin surface for content upload, poll creation, press-meet scheduling, media library.

## 2. High-level architecture

```
                         ┌──────────────────────────────────────┐
  WhatsApp Cloud API ──▶ │  HTTP webhook (Next.js route handler) │
  (Telegram later)       │  bot.webhooks.whatsapp(req)           │
                         └───────────────┬──────────────────────┘
                                         │  normalized message / action
                                         ▼
                         ┌──────────────────────────────────────┐
                         │  Chat SDK `Chat` instance (src/bot.ts)│
                         │  adapters: { whatsapp }               │
                         │  state: Redis (subscriptions/locks)   │
                         └───────────────┬──────────────────────┘
                                         │  onNewMessage / onAction
                                         ▼
                         ┌──────────────────────────────────────┐
                         │  Router (src/router.ts)               │
                         │  text + action → flow handler         │
                         └───────────────┬──────────────────────┘
                                         ▼
          ┌───────────────── Flows (src/flows/*) — platform-agnostic ─────────────────┐
          │ menu · talkingPoints · prajaSankalpam · pressMeet · jaganMeets ·           │
          │ polls · idCard · media    → return BotResponse (our content model)         │
          └───────────────┬──────────────────────────────────────────────────────────┘
                          │ BotResponse
                          ▼
          ┌──────────────────────────────┐     ┌──────────────────────────────┐
          │ Renderer (src/render/*)      │     │ Repositories (src/data/*)     │
          │ BotResponse → Chat SDK posts │     │ membership DB, content, media │
          │ (buttons/list/doc/media)     │     │ (sample now, real later)      │
          └──────────────────────────────┘     └──────────────────────────────┘

  Scheduled broadcasts: scripts/broadcast.ts → queue/cron → adapter.sendTemplate(...)
  Admin dashboard: separate app writing to the same repositories (out of scope for scaffold)
```

### Key idea — the content model
Flows never call WhatsApp. They return a **`BotResponse`** (plain data: text, buttons, list,
documents, media, link button). A per-platform **renderer** translates that into Chat SDK calls.
Adding Telegram later = write `src/render/telegram.ts`; flows stay untouched.

## 3. Flow → WhatsApp primitive mapping

| # | Flow | Trigger | BotResponse shape | WhatsApp primitive | Window |
|---|------|---------|-------------------|--------------------|--------|
| 1 | Talking points | `1` / `tp` + daily 7 AM | document + link + buttons | Document msg (+ **template** for push) | Session + Push |
| 2 | Praja Sankalpam | `2` / `ps` + daily 6 PM | document + link + buttons | Document msg (+ **template** for push) | Session + Push |
| 3 | Press meet schedule | `3` / `pm` | text + reply buttons (≤3) | Interactive buttons + text | Session |
| 4 | Jagan Sir meets | `4` / `jagan` | list (by date/topic) + media | Interactive **list** + video | Session |
| 5 | Opinion polls | `5` / `poll` | buttons (≤3) or list (4–10) | Buttons / list; vote state in DB | Session |
| 6 | ID card status | `6` / `id` → mobile no. | text timeline | Free text in/out + DB lookup | Session |
| 7 | Posters/reels | `7` / `media` | list → image/video | List + media msgs (16 MB video cap) | Session |

WhatsApp constraints encoded in the renderer:
- Reply buttons: **max 3**, title ≤ 20 chars.
- List: **1 button, ≤10 rows total, ≤10 sections**; row title ≤ 24, description ≤ 72; body ≤ 4096.
- One media item per message → multiple media sent sequentially.
- Interactive messages only inside the 24-hour window; outside → approved template only.

## 4. State & sessions

- **Chat SDK state** (Redis): subscriptions + locks (SDK-managed).
- **App session** (`src/services/session.ts`, Redis-backed): conversation `state` string ported
  from the prototype (`idle`, `id`, `poll:<id>`) + scratch data.
- **Durable app data** (Postgres): poll definitions & votes (one vote/number), membership records,
  content metadata, media catalog, broadcast opt-ins, audit logs.

## 5. Repositories (swap sample → real)

`src/data/repository.ts` defines interfaces; `src/data/sample.ts` implements them with the
prototype's sample data. Production implementations:
- `MembershipRepo` → party membership DB or bulk Excel import table.
- `ContentRepo` → talking points / Praja Sankalpam / press meets / Jagan meets.
- `PollRepo` → polls + atomic vote increment (one vote per number, by district).
- `MediaRepo` → posters/reels metadata + CDN URLs.

## 6. Scheduled broadcasts

`scripts/broadcast.ts`:
1. Pull today's content from `ContentRepo`.
2. Fetch opted-in audience from `BroadcastRepo` (respect per-category opt-in + opt-out).
3. Fan out `adapter.sendTemplate(threadId, { name, language, components:[document header,...] })`.
4. For >1 lakh: push jobs to a **queue** (BullMQ/SQS), throttle to the account's messaging tier,
   track delivery webhooks, retry on transient errors, stop on `131049`/quality pauses.

Templates must be **pre-approved in WhatsApp Manager** with a document header param.

## 7. Admin dashboard (out of scope for scaffold)
CRUD on repositories: upload PDFs (date+language), create/schedule polls (district targeting +
live results), manage press-meet schedule with auto status (Upcoming→Live→Recording), media
library with order/caption. Any stack (Next.js admin, Retool, etc.) writing the same DB.

## 8. Rollout plan

1. **Phase 0** — Eligibility/entity decision, opt-in/opt-out + DPDP mechanism.
2. **Phase 1** — Core engine + 7 flows (this scaffold) on sample data.
3. **Phase 2** — Wire real repositories (membership DB, content, media/CDN).
4. **Phase 3** — Admin dashboard.
5. **Phase 4** — Scheduled broadcasts + templates (queue-based at scale).
6. **Phase 5** — Pilot one constituency, watch block/opt-out rates, then scale tiers.
7. **Phase 6** — Add Telegram adapter as resilience/fallback (recommended given §0.1).

## 9. Repo layout

```
karyakarta-seva-bot/
├─ docs/DESIGN.md                      ← this file
├─ app/api/webhooks/whatsapp/route.ts  ← HTTP entry (Next.js App Router)
├─ src/
│  ├─ bot.ts            ← Chat SDK instance + adapter + handlers wired
│  ├─ config.ts         ← env config
│  ├─ types.ts          ← BotResponse content model + flow types
│  ├─ router.ts         ← text/action → flow
│  ├─ render/whatsapp.ts← BotResponse → Chat SDK posts (WhatsApp limits)
│  ├─ flows/            ← the 7 flows (platform-agnostic)
│  ├─ data/             ← repository interfaces + sample data
│  └─ services/         ← session, rate limit, i18n
└─ scripts/broadcast.ts ← scheduled 7AM/6PM template pushes
```

## 10. Open items to confirm against installed Chat SDK version
The exact interactive-card DSL (how to attach reply buttons / list rows to `thread.post`) must be
verified against the **installed** `@chat-adapter/whatsapp` version — docs may be ahead of the
package. `src/render/whatsapp.ts` isolates every such call and marks them with `TODO(verify)`.
