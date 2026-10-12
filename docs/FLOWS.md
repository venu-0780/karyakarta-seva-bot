# WhatsApp Flows (ID status & Poll)

WhatsApp Flows are native in-chat forms. This bot can open a Flow for **ID card
status** (one phone-number field) and **poll voting** (radio options) instead of
the chat-based button/list UI.

Flows are **completely optional and inert until you publish one and set its id**.
With no flow ids configured, the bot keeps using the existing button/list flows.

## How it works in this codebase

- Flow JSON lives in `flows-json/id-status.json` and `flows-json/poll.json`.
- `src/flows/idCard.ts` / `src/flows/polls.ts` emit a `flow` message **only when**
  `ID_STATUS_FLOW_ID` / `POLL_FLOW_ID` are set.
- `src/render/whatsapp.ts` (`postFlow`) sends it via a direct Graph API call.
- On submit, Meta POSTs an `nfm_reply`. `app/api/webhooks/whatsapp/route.ts`
  verifies the signature, `src/services/flowWebhook.ts` parses it, and
  `handleFlowCompletion` in `src/bot.ts` runs the existing `idCheck` / `vote`.
- The `flow_token` we send (`idstatus` or `poll:<id>`) tells the handler what to do.

## One-time setup

### 1. Get your WABA ID (WhatsApp Business Account ID)

Any one of these:

- **Meta Business Suite / WhatsApp Manager** → *Account tools → WhatsApp Manager*.
  Click your WhatsApp Business Account; the **WhatsApp Business Account ID** is
  shown in the account details / URL. (Different from the *Phone Number ID* you
  already have.)
- **Meta for Developers** → your App → *WhatsApp → API Setup*: the page lists both
  the Phone number ID and the WhatsApp Business Account ID.
- **Graph API** with your existing token:
  ```bash
  curl "https://graph.facebook.com/v23.0/<PHONE_NUMBER_ID>?fields=whatsapp_business_account&access_token=<TOKEN>"
  ```
  The returned `whatsapp_business_account.id` is your WABA ID.

Put it in `.env`:
```
WHATSAPP_WABA_ID=xxxxxxxxxxxxxxx
```
Your System User access token must have the **whatsapp_business_management**
permission (the permanent token created earlier does).

### 2. Create + publish the flows

```bash
npm run create-flow -- id-status "ID Card Status" CUSTOMER_SUPPORT
npm run create-flow -- poll      "Opinion Poll"   SURVEY
```

Each command creates the flow, uploads the JSON, publishes it, and prints:
```
✅ Done. Add this to your .env (and Vercel env):
   ID_STATUS_FLOW_ID=123456789012345
```

### 3. Set the ids (local + Vercel)

```
ID_STATUS_FLOW_ID=...
POLL_FLOW_ID=...
```
Also add them in the Vercel project env. Once set, tapping **Check ID status** or
opening a poll opens the native Flow form. Remove the ids to instantly revert to
the button/list UI.

## Testing an unpublished draft

Set `WHATSAPP_FLOW_MODE=draft` to send the flow in draft mode (visible only to
admins of the WhatsApp Business Account) before publishing. Switch back to
`published` (default) for real users.

## Notes

- Flows cost nothing extra — a Flow message counts as a normal conversation message.
- The Flow JSON is bilingual (Telugu + English) inline. For fully per-user
  language we'd publish separate te/en flows or pass labels via flow data.
- Cards/forms validate input on-device (e.g. phone field), reducing typos.
