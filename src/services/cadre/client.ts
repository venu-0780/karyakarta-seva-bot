// -----------------------------------------------------------------------------
// HTTP client for the YSRCP cadre membership API. Server-to-server only.
// Owns the Basic-auth token exchange, bearer-token caching (shared through the
// TtlCache so every Vercel instance reuses one token), and the retry rules from
// the cadre API guide. Flows never call this; they go through idCardService.ts.
//
// Never log request bodies, phone numbers, names, or tokens. Only the HTTP
// status and the API's requestId are safe to log.
// -----------------------------------------------------------------------------
import type { TtlCache } from "../ttlCache.js";

export type CadreErrorKind =
  | "invalid_client"
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "not_found"
  | "rate_limited"
  | "unavailable";

export class CadreError extends Error {
  constructor(
    readonly kind: CadreErrorKind,
    readonly status: number,
    readonly requestId?: string,
    readonly retryAfterSec?: number,
  ) {
    super(`cadre ${kind} (HTTP ${status})`);
    this.name = "CadreError";
  }
}

export interface CadreRow {
  phone: string;
  name: string;
  idCardStatus: { code: string; flags: string[]; meaning?: string };
}

export interface CadreSearchPage {
  data: CadreRow[];
  page?: { offset: number; limit: number; nextOffset: number | null };
  dataset?: { sourceAsOf?: string; importedAt?: string };
}

export interface CadreClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  cache: TtlCache;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const TOKEN_KEY = "cadre:token";
const LOCK_KEY = "cadre:token:lock";
const LOCK_TTL_MS = 10_000;
const TOKEN_SAFETY_SEC = 60;
const DEFAULT_EXPIRY_SEC = 900;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class CadreClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: CadreClientOptions) {
    if (!opts.baseUrl.startsWith("https://")) throw new Error("CADRE_BASE_URL must use https");
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  /** One page of a phone or name search. Retries once on 401 with a fresh token. */
  async search(params: { phone?: string; name?: string; offset?: number }): Promise<CadreSearchPage> {
    const body = JSON.stringify(params);
    return this.withToken(async (token) => {
      const res = await this.send("/api/v1/cadre/lookup", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
      });
      const json = await readJson(res);
      if (!res.ok) throw errorFrom(res, json);
      return json as unknown as CadreSearchPage;
    });
  }

  private async withToken<T>(call: (token: string) => Promise<T>): Promise<T> {
    const token = await this.getToken();
    try {
      return await this.withRetry(() => call(token));
    } catch (err) {
      if (!(err instanceof CadreError) || err.kind !== "unauthorized") throw err;
      // The cached token was rejected: replace it once and retry once.
      const fresh = await this.getToken(token);
      return this.withRetry(() => call(fresh));
    }
  }

  /** Transient 503 / network failures get one bounded retry. */
  private async withRetry<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof CadreError && err.kind === "unavailable") {
        await sleep(1_000);
        return call();
      }
      throw err;
    }
  }

  /**
   * Returns a cached token. `stale` is a token that was just rejected; it is
   * never returned again. Only one instance refreshes at a time (lock); the
   * others wait briefly for its result.
   */
  private async getToken(stale?: string): Promise<string> {
    const cached = await this.opts.cache.get<string>(TOKEN_KEY);
    if (cached && cached !== stale) return cached;

    if (await this.opts.cache.acquire(LOCK_KEY, LOCK_TTL_MS)) {
      try {
        return await this.fetchToken();
      } finally {
        await this.opts.cache.release(LOCK_KEY);
      }
    }

    for (let i = 0; i < 10; i += 1) {
      await sleep(300);
      const fresh = await this.opts.cache.get<string>(TOKEN_KEY);
      if (fresh && fresh !== stale) return fresh;
    }
    return this.fetchToken();
  }

  private async fetchToken(): Promise<string> {
    const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString("base64");
    const res = await this.send("/api/v1/cadre/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    });
    const json = await readJson(res);
    if (!res.ok) throw errorFrom(res, json);
    if (typeof json.access_token !== "string") throw new CadreError("unavailable", res.status);

    const expiresSec = typeof json.expires_in === "number" ? json.expires_in : DEFAULT_EXPIRY_SEC;
    const ttlMs = Math.max(1, expiresSec - TOKEN_SAFETY_SEC) * 1000;
    await this.opts.cache.set(TOKEN_KEY, json.access_token, ttlMs);
    return json.access_token;
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new CadreError("unavailable", 0);
    }
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await res.json();
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function errorFrom(res: Response, json: Record<string, unknown>): CadreError {
  const requestId =
    typeof json.requestId === "string" ? json.requestId : (res.headers.get("x-request-id") ?? undefined);
  const retry = Number(res.headers.get("retry-after"));
  const retryAfterSec = Number.isFinite(retry) && retry > 0 ? retry : undefined;
  switch (res.status) {
    case 400:
    case 413:
      return new CadreError("bad_request", res.status, requestId);
    case 401:
      return new CadreError(json.error === "invalid_client" ? "invalid_client" : "unauthorized", 401, requestId);
    case 403:
      return new CadreError("forbidden", 403, requestId);
    case 404:
      return new CadreError("not_found", 404, requestId);
    case 429:
      return new CadreError("rate_limited", 429, requestId, retryAfterSec);
    default:
      return new CadreError("unavailable", res.status, requestId);
  }
}
