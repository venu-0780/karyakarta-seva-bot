// -----------------------------------------------------------------------------
// Create + upload + publish a WhatsApp Flow from a local Flow JSON file, then
// print the resulting flow_id to put in .env (ID_STATUS_FLOW_ID / POLL_FLOW_ID).
//
// Needs WHATSAPP_WABA_ID and a WHATSAPP_ACCESS_TOKEN with the
// whatsapp_business_management permission (the System User token works).
//
// Run:
//   npm run create-flow -- id-status "ID Card Status" CUSTOMER_SUPPORT
//   npm run create-flow -- poll      "Opinion Poll"   SURVEY
// -----------------------------------------------------------------------------
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { config } from "../src/config.js";

const API = `${config.whatsapp.apiUrl}/${config.whatsapp.graphVersion}`;
const TOKEN = config.whatsapp.accessToken;
const WABA = config.wabaId;

const CATEGORIES = [
  "SIGN_UP", "SIGN_IN", "APPOINTMENT_BOOKING", "LEAD_GENERATION",
  "CONTACT_US", "CUSTOMER_SUPPORT", "SURVEY", "OTHER",
];

async function post(url: string, body: BodyInit, headers: Record<string, string> = {}) {
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, ...headers }, body });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return json as Record<string, unknown>;
}

async function main() {
  const [file, name, category = "OTHER"] = process.argv.slice(2);
  if (!file || !name) {
    console.error('Usage: npm run create-flow -- <json-file> "<Flow name>" [CATEGORY]');
    process.exit(1);
  }
  if (!TOKEN || !WABA) {
    console.error("Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_WABA_ID in the environment / .env");
    process.exit(1);
  }
  if (!CATEGORIES.includes(category)) {
    console.error(`Invalid category "${category}". One of: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const jsonPath = resolve(here, "..", "flows-json", file.endsWith(".json") ? file : `${file}.json`);
  const flowJson = await readFile(jsonPath, "utf8");
  JSON.parse(flowJson); // fail fast on malformed JSON

  const envByFile: Record<string, string> = {
    "id-status": "ID_STATUS_FLOW_ID",
    poll: "POLL_FLOW_ID",
    feedback: "FEEDBACK_FLOW_ID",
    "event-register": "EVENT_FLOW_ID",
    membership: "MEMBERSHIP_FLOW_ID",
    survey: "SURVEY_FLOW_ID",
  };
  const stem = file.replace(/\.json$/, "");
  const envVar = envByFile[stem] ?? "FLOW_ID";
  const existing = process.env[envVar];

  let flowId: string;
  if (existing) {
    flowId = existing;
    console.log(`Updating published flow "${name}" ${flowId} (${envVar})...`);
  } else {
    console.log(`Creating flow "${name}" (${category}) on WABA ${WABA}...`);
    const created = await post(
      `${API}/${WABA}/flows`,
      JSON.stringify({ name, categories: [category] }),
      { "Content-Type": "application/json" },
    );
    flowId = String(created.id);
    console.log(`  flow id: ${flowId}`);
  }

  console.log("Uploading Flow JSON...");
  const form = new FormData();
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  form.append("file", new Blob([flowJson], { type: "application/json" }), "flow.json");
  const upload = await post(`${API}/${flowId}/assets`, form);
  const validation = (upload.validation_errors as unknown[]) ?? [];
  if (validation.length) {
    console.error("  validation errors:", JSON.stringify(validation, null, 2));
    console.error("  Fix the Flow JSON and re-run. The draft flow was created but not published.");
    process.exit(1);
  }
  console.log("  uploaded, no validation errors.");

  console.log("Publishing...");
  await post(`${API}/${flowId}/publish`, "");
  console.log("  published.");

  console.log(`\n✅ Done. ${envVar}=${flowId}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
