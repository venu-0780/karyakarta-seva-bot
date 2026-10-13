// -----------------------------------------------------------------------------
// Shared test helpers: build a FlowContext backed entirely by in-memory stores
// and the sample repositories, so routing/flow tests run with no network, no
// Redis, and no WhatsApp. The LLM path stays inert (no OPENAI_API_KEY), keeping
// router tests fully deterministic.
// -----------------------------------------------------------------------------
import { createSampleRepositories } from "../src/data/sample.js";
import { MemoryAnalytics } from "../src/services/analytics.js";
import { MemoryEscalationStore } from "../src/services/escalation.js";
import { MemoryLanguageStore } from "../src/services/prefs.js";
import { MemoryRateLimiter } from "../src/services/rateLimit.js";
import type { FlowContext, Services, Session } from "../src/types.js";
import type { LangPref } from "../src/services/i18n.js";

export function makeServices(): Services & { escalation: MemoryEscalationStore } {
  const escalation = new MemoryEscalationStore();
  return {
    repos: createSampleRepositories(),
    rateLimit: new MemoryRateLimiter(),
    analytics: new MemoryAnalytics(),
    prefs: new MemoryLanguageStore(),
    escalation,
  };
}

export interface TestContext extends FlowContext {
  services: Services & { escalation: MemoryEscalationStore };
}

/** Build a FlowContext seeded with a language (default "en" to skip the picker). */
export function makeContext(opts?: {
  lang?: LangPref;
  state?: string;
  data?: Record<string, unknown>;
  userId?: string;
}): TestContext {
  const lang = opts?.lang ?? "en";
  const session: Session = {
    state: opts?.state ?? "idle",
    data: { langPref: lang, ...(opts?.data ?? {}) },
  };
  const services = makeServices();
  const ctx: TestContext = {
    userId: opts?.userId ?? "15550001111",
    session,
    services,
    lang: lang === "en" ? "en" : "te",
    async setState(state, data) {
      session.state = state;
      if (data !== undefined) session.data = data;
    },
  };
  return ctx;
}
