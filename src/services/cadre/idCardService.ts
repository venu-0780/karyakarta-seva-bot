// -----------------------------------------------------------------------------
// ID-card status from the cadre API, shaped for the WhatsApp flow.
//
// Guards that protect the shared production quota (30/min, 1,000/24h per client):
//   - per-minute and per-day budgets, checked before every upstream call
//   - a 15-minute cache per number (hits and misses), so repeat checks are free
// Only the mapped status is returned. The API's member id, phone, and extra
// fields are dropped here; the flow already knows the number it searched.
// -----------------------------------------------------------------------------
import { createHash } from "node:crypto";

import { config } from "../../config.js";
import type { RateLimiter } from "../rateLimit.js";
import type { TtlCache } from "../ttlCache.js";
import { CadreClient, CadreError } from "./client.js";

export interface IdCardRecord {
  name: string;
  /** API code, e.g. issued, verification_required, rejected_image_quality. */
  code: string;
  flags: string[];
}

export type IdCardLookup =
  | { kind: "found"; records: IdCardRecord[]; asOf?: string }
  | { kind: "not_found"; asOf?: string }
  | { kind: "unavailable"; reason: "quota" | "error" };

export interface IdCardService {
  /** `mobile` is the normalized 10-digit Indian number. */
  lookup(mobile: string): Promise<IdCardLookup>;
}

export interface IdCardServiceOptions {
  client: CadreClient;
  rateLimit: RateLimiter;
  cache: TtlCache;
  /** Stay below the API's 30/min per-client limit; the margin covers other workers. */
  perMinute?: number;
  /** Stay below the 1,000/24h limit; the margin covers other workers. */
  perDay?: number;
  cacheTtlMs?: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
const CACHE_TTL_MS = 15 * 60_000;
const MAX_PAGES = 3;

class QuotaExceeded extends Error {}

export function createCadreIdCardService(opts: IdCardServiceOptions): IdCardService {
  const perMinute = opts.perMinute ?? 25;
  const perDay = opts.perDay ?? 900;
  const cacheTtlMs = opts.cacheTtlMs ?? CACHE_TTL_MS;

  async function takeQuota(): Promise<void> {
    if (!(await opts.rateLimit.hit("cadre:minute", perMinute, MINUTE_MS))) throw new QuotaExceeded();
    if (!(await opts.rateLimit.hit("cadre:day", perDay, DAY_MS))) throw new QuotaExceeded();
  }

  return {
    async lookup(mobile) {
      const key = `cadre:idcard:${createHash("sha256").update(mobile).digest("hex")}`;
      try {
        const cached = await opts.cache.get<IdCardLookup>(key);
        if (cached) return cached;

        const records: IdCardRecord[] = [];
        let asOf: string | undefined;
        let offset = 0;
        for (let page = 0; page < MAX_PAGES; page += 1) {
          await takeQuota();
          const body = await opts.client.search({ phone: mobile, offset });
          for (const row of body.data ?? []) {
            records.push({
              name: row.name,
              code: row.idCardStatus?.code ?? "unknown",
              flags: row.idCardStatus?.flags ?? [],
            });
          }
          asOf = body.dataset?.sourceAsOf ?? asOf;
          const next = body.page?.nextOffset;
          if (next === null || next === undefined) break;
          offset = next;
        }

        const result: IdCardLookup = records.length
          ? { kind: "found", records, asOf }
          : { kind: "not_found", asOf };
        await opts.cache.set(key, result, cacheTtlMs);
        return result;
      } catch (err) {
        if (err instanceof QuotaExceeded) return { kind: "unavailable", reason: "quota" };
        // Log the kind and status only; never the number or the response body.
        console.error(
          "cadre id-card lookup failed",
          err instanceof CadreError ? err.kind : "error",
          err instanceof CadreError ? err.status : "",
        );
        return { kind: "unavailable", reason: "error" };
      }
    },
  };
}

/** The live service when CADRE_CLIENT_ID and CADRE_CLIENT_SECRET are set; otherwise undefined. */
export function cadreIdCardServiceFromConfig(deps: {
  cache: TtlCache;
  rateLimit: RateLimiter;
}): IdCardService | undefined {
  const { baseUrl, clientId, clientSecret, enabled } = config.cadre;
  if (!enabled || !clientId || !clientSecret) return undefined;
  return createCadreIdCardService({
    client: new CadreClient({ baseUrl, clientId, clientSecret, cache: deps.cache }),
    rateLimit: deps.rateLimit,
    cache: deps.cache,
  });
}
