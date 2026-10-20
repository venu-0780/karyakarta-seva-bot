// Alias for WhatsApp CRMs that require a callback URL ending in `/webhook`.
// Same GET challenge + POST message handling as /api/webhooks/whatsapp.
export { runtime, dynamic, maxDuration, GET, POST } from "../webhooks/whatsapp/route.js";
