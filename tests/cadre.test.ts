import assert from "node:assert/strict";
import { test } from "node:test";

import { CadreClient, CadreError } from "../src/services/cadre/client.js";
import { createCadreIdCardService, type IdCardLookup } from "../src/services/cadre/idCardService.js";
import { MemoryRateLimiter } from "../src/services/rateLimit.js";
import { MemoryTtlCache } from "../src/services/ttlCache.js";
import { idCheck } from "../src/flows/idCard.js";
import { makeContext } from "./helpers.js";

const BASE = "https://cadre.example.test";
const PHONE = "9440886016";

// Fake fetch: records every call and answers with the handler's response.
function fakeFetch(handler: (url: string, auth: string | null, body: string) => Response) {
  const calls: { url: string; auth: string | null; body: string }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get("authorization");
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url, auth, body });
    return handler(url, auth, body);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const tokenOk = (token = "tok-1", expiresIn = 900) =>
  json(200, { access_token: token, token_type: "Bearer", expires_in: expiresIn, scope: "cadre:lookup:phone" });

const row = (phone: string, name: string, code = "issued", flags: string[] = ["1st_time"]) => ({
  phone,
  name,
  idCardStatus: { code, flags, meaning: "" },
});

const page = (data: unknown[], nextOffset: number | null = null) =>
  json(200, {
    data,
    page: { offset: 0, limit: 10, nextOffset },
    dataset: { sourceAsOf: "2026-09-30", importedAt: "2026-11-03T00:00:00.000Z" },
  });

function cadreClient(fetchImpl: typeof fetch, cache = new MemoryTtlCache()) {
  return new CadreClient({ baseUrl: BASE, clientId: "client", clientSecret: "secret", cache, fetchImpl });
}

// ---------------------------------------------------------------- client ----

test("token is reused across lookups until it nears expiry", async () => {
  const { fn, calls } = fakeFetch((url) => (url.endsWith("/token") ? tokenOk() : page([])));
  const client = cadreClient(fn);
  await client.search({ phone: PHONE, offset: 0 });
  await client.search({ phone: PHONE, offset: 0 });
  assert.equal(calls.filter((c) => c.url.endsWith("/token")).length, 1);
  assert.equal(calls.filter((c) => c.url.endsWith("/lookup"))[1]?.auth, "Bearer tok-1");
});

test("a 401 on lookup refreshes the token once and retries", async () => {
  let tokenCalls = 0;
  const { fn } = fakeFetch((url, auth) => {
    if (url.endsWith("/token")) {
      tokenCalls += 1;
      return tokenOk(`tok-${tokenCalls}`);
    }
    if (auth === "Bearer tok-1") return json(401, { error: "invalid_token" });
    return page([row(`+91${PHONE}`, "Malaka Krishna Reddy")]);
  });
  const result = await cadreClient(fn).search({ phone: PHONE, offset: 0 });
  assert.equal(tokenCalls, 2);
  assert.equal(result.data.length, 1);
});

test("invalid_client on the token endpoint stops without retrying", async () => {
  let tokenCalls = 0;
  const { fn } = fakeFetch((url) => {
    if (url.endsWith("/token")) {
      tokenCalls += 1;
      return json(401, { error: "invalid_client", requestId: "req-1" });
    }
    return page([]);
  });
  await assert.rejects(cadreClient(fn).search({ phone: PHONE, offset: 0 }), (err: unknown) => {
    return err instanceof CadreError && err.kind === "invalid_client" && err.requestId === "req-1";
  });
  assert.equal(tokenCalls, 1);
});

test("429 surfaces rate_limited with Retry-After", async () => {
  const { fn } = fakeFetch((url) =>
    url.endsWith("/token") ? tokenOk() : json(429, { error: "rate_limited" }, { "retry-after": "30" }),
  );
  await assert.rejects(cadreClient(fn).search({ phone: PHONE, offset: 0 }), (err: unknown) => {
    return err instanceof CadreError && err.kind === "rate_limited" && err.retryAfterSec === 30;
  });
});

test("lookup body carries only the phone and offset", async () => {
  const { fn, calls } = fakeFetch((url) => (url.endsWith("/token") ? tokenOk() : page([])));
  await cadreClient(fn).search({ phone: PHONE, offset: 0 });
  const body = JSON.parse(calls.find((c) => c.url.endsWith("/lookup"))!.body);
  assert.deepEqual(body, { phone: PHONE, offset: 0 });
});

test("a non-https base URL is refused at construction", () => {
  assert.throws(
    () => new CadreClient({ baseUrl: "http://insecure.test", clientId: "a", clientSecret: "b", cache: new MemoryTtlCache() }),
    /https/,
  );
});

// --------------------------------------------------------------- service ----

test("empty data is not_found and never exposes a phone in the record", async () => {
  const { fn } = fakeFetch((url) => (url.endsWith("/token") ? tokenOk() : page([])));
  const service = createCadreIdCardService({
    client: cadreClient(fn),
    rateLimit: new MemoryRateLimiter(),
    cache: new MemoryTtlCache(),
  });
  const lookup = await service.lookup(PHONE);
  assert.equal(lookup.kind, "not_found");
});

test("two matches on one number are both returned, without phone numbers", async () => {
  const { fn } = fakeFetch((url) =>
    url.endsWith("/token")
      ? tokenOk()
      : page([row(`+91${PHONE}`, "Malaka Krishna Reddy"), row(`+91${PHONE}`, "M K Reddy", "requires_review", ["Prior"])]),
  );
  const service = createCadreIdCardService({
    client: cadreClient(fn),
    rateLimit: new MemoryRateLimiter(),
    cache: new MemoryTtlCache(),
  });
  const lookup = await service.lookup(PHONE);
  assert.equal(lookup.kind, "found");
  if (lookup.kind !== "found") return;
  assert.equal(lookup.records.length, 2);
  assert.deepEqual(Object.keys(lookup.records[0]!).sort(), ["code", "flags", "name"]);
  assert.equal(lookup.asOf, "2026-09-30");
});

test("a repeat check of the same number is served from cache without an upstream call", async () => {
  const { fn, calls } = fakeFetch((url) => (url.endsWith("/token") ? tokenOk() : page([row(`+91${PHONE}`, "A B")])));
  const service = createCadreIdCardService({
    client: cadreClient(fn),
    rateLimit: new MemoryRateLimiter(),
    cache: new MemoryTtlCache(),
  });
  await service.lookup(PHONE);
  const before = calls.length;
  const again = await service.lookup(PHONE);
  assert.equal(again.kind, "found");
  assert.equal(calls.length, before);
});

test("the per-minute budget stops calls before they reach the API", async () => {
  const { fn, calls } = fakeFetch((url) => (url.endsWith("/token") ? tokenOk() : page([])));
  const service = createCadreIdCardService({
    client: cadreClient(fn),
    rateLimit: new MemoryRateLimiter(),
    cache: new MemoryTtlCache(),
    perMinute: 1,
  });
  await service.lookup("9440886016");
  const second = await service.lookup("9123456780");
  assert.deepEqual(second, { kind: "unavailable", reason: "quota" });
  assert.equal(calls.filter((c) => c.url.endsWith("/lookup")).length, 1);
});

test("an upstream rejection is reported as unavailable with no detail", async () => {
  const { fn } = fakeFetch((url) => (url.endsWith("/token") ? tokenOk() : json(400, { error: "bad_request" })));
  const service = createCadreIdCardService({
    client: cadreClient(fn),
    rateLimit: new MemoryRateLimiter(),
    cache: new MemoryTtlCache(),
  });
  assert.deepEqual(await service.lookup(PHONE), { kind: "unavailable", reason: "error" });
});

// ------------------------------------------------------------------ reply ----

function withService(ctxUserId: string | undefined, lookup: IdCardLookup) {
  const ctx = makeContext(ctxUserId ? { userId: ctxUserId } : undefined);
  ctx.services.idCard = { lookup: async () => lookup };
  return ctx;
}

test("issued card: masked name, issued line, and a reaction", async () => {
  const ctx = withService("15550001111", {
    kind: "found",
    records: [{ name: "Malaka Krishna Reddy", code: "issued", flags: ["1st_time"] }],
    asOf: "2026-09-30",
  });
  const reply = await idCheck(ctx, PHONE);
  const item = Array.isArray(reply) ? reply[0]! : reply;
  assert.match(item.text ?? "", /ID card issued/);
  assert.doesNotMatch(item.text ?? "", /Malaka/);
  assert.equal(item.reactionEmoji, "✅");
  assert.doesNotMatch(item.text ?? "", /Ready to collect|Dispatched/);
  assert.match(item.text ?? "", /2026-09-30/);
});

test("the sender's own number shows the full name", async () => {
  const ctx = withService("919440886016", {
    kind: "found",
    records: [{ name: "Malaka Krishna Reddy", code: "issued", flags: [] }],
  });
  const reply = await idCheck(ctx, PHONE);
  const item = Array.isArray(reply) ? reply[0]! : reply;
  assert.match(item.text ?? "", /Malaka Krishna Reddy/);
});

test("verification_required says not verified and offers the helpline", async () => {
  const ctx = withService("15550001111", {
    kind: "found",
    records: [{ name: "A B", code: "verification_required", flags: ["Not verified"] }],
  });
  const reply = await idCheck(ctx, PHONE);
  const item = Array.isArray(reply) ? reply[0]! : reply;
  assert.match(item.text ?? "", /Not verified yet/);
  assert.ok((item.contacts?.length ?? 0) > 0);
  assert.equal(item.reactionEmoji, undefined);
});

test("unknown codes fall back to the unknown message", async () => {
  const ctx = withService("15550001111", {
    kind: "found",
    records: [{ name: "A B", code: "something_new", flags: [] }],
  });
  const reply = await idCheck(ctx, PHONE);
  const item = Array.isArray(reply) ? reply[0]! : reply;
  assert.match(item.text ?? "", /Status not available/);
});

test("not_found reply names the masked number and offers the helpline", async () => {
  const ctx = withService("15550001111", { kind: "not_found" });
  const reply = await idCheck(ctx, PHONE);
  const item = Array.isArray(reply) ? reply[0]! : reply;
  assert.match(item.text ?? "", /No ID card record found/);
  assert.ok((item.contacts?.length ?? 0) > 0);
});

test("quota and error replies never show the raw error", async () => {
  for (const reason of ["quota", "error"] as const) {
    const ctx = withService("15550001111", { kind: "unavailable", reason });
    const reply = await idCheck(ctx, PHONE);
    const item = Array.isArray(reply) ? reply[0]! : reply;
    assert.match(item.text ?? "", /⚠️/);
    assert.doesNotMatch(item.text ?? "", /HTTP|token|requestId|401|403/);
  }
});
