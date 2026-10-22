import { config } from "../src/config.js";

const { accessToken, apiUrl, graphVersion, phoneNumberId } = config.whatsapp;

if (!accessToken || !phoneNumberId) {
  console.error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID.");
  process.exit(1);
}

const url = new URL(`${apiUrl}/${graphVersion}/${phoneNumberId}`);
url.searchParams.set("fields", "id,display_phone_number,verified_name");

try {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const raw = await response.text();
  let body: unknown = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    // Keep non-JSON provider errors readable.
  }

  if (!response.ok) {
    console.error(`WhatsApp API check failed (${response.status} ${response.statusText}).`);
    console.error(typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const account = body as {
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
  };
  console.log("WhatsApp API authentication succeeded.");
  console.log(`Phone number ID: ${account.id ?? phoneNumberId}`);
  if (account.display_phone_number) console.log(`Phone: ${account.display_phone_number}`);
  if (account.verified_name) console.log(`Verified name: ${account.verified_name}`);
} catch (error) {
  console.error(
    "WhatsApp API check could not connect:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
