// -----------------------------------------------------------------------------
// Shared OpenAI client. One lazily-constructed instance reused by the LLM router
// (classification) and the grounded-answer generator, so we don't open a new
// client per call. maxRetries: 0 — every caller enforces its own timeout and
// fails OPEN, so a single attempt is correct.
// -----------------------------------------------------------------------------
import OpenAI from "openai";

import { config } from "../config.js";

let client: OpenAI | undefined;

export function getOpenAI(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: config.llm.apiKey, maxRetries: 0 });
  return client;
}
