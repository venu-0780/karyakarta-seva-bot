// -----------------------------------------------------------------------------
// Poll-result chart model + URL.
//
// The chart image itself is rendered by a Next.js route (app/api/chart/poll/
// [id]/route.tsx) using next/og. To keep that route a pure, stateless renderer
// (and consistent with whatever the flow computed, regardless of the data
// backend), the authoritative snapshot is passed in the URL as a compact,
// url-safe base64 payload (`d`). The route decodes it; if it's missing/invalid
// it falls back to loading the poll by id.
//
// These helpers are pure and unit-tested.
// -----------------------------------------------------------------------------
import type { Poll } from "../data/repository.js";

export interface PollChartOption {
  label: string;
  votes: number;
  /** Rounded percentage of the total (0–100). */
  pct: number;
  /** True for the option the current user voted for. */
  mine: boolean;
}

export interface PollChartModel {
  q: string;
  total: number;
  options: PollChartOption[];
}

/** Build the display model: per-option votes, rounded %, and the user's pick. */
export function pollChartModel(poll: Poll, mine: number | null): PollChartModel {
  const total = poll.votes.reduce((a, b) => a + b, 0);
  const denom = total || 1;
  const options: PollChartOption[] = poll.opts.map((label, i) => {
    const votes = poll.votes[i] ?? 0;
    return {
      label,
      votes,
      pct: Math.round((votes / denom) * 100),
      mine: mine === i,
    };
  });
  return { q: poll.q, total, options };
}

// --- URL payload (compact JSON, url-safe base64) -----------------------------

interface ChartPayload {
  q: string;
  o: string[]; // option labels
  v: number[]; // option vote counts
  m: number | null; // the user's chosen option index, or null
}

function toBase64Url(json: string): string {
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

/** Encode a poll snapshot into the `d` query param. */
export function encodeChartData(poll: Poll, mine: number | null): string {
  const payload: ChartPayload = { q: poll.q, o: poll.opts, v: poll.votes, m: mine };
  return toBase64Url(JSON.stringify(payload));
}

/**
 * Decode a `d` param back into a PollChartModel, or undefined when it's missing
 * or malformed (the route then falls back to loading the poll by id).
 */
export function decodeChartData(data: string | null | undefined): PollChartModel | undefined {
  if (!data) return undefined;
  try {
    const parsed = JSON.parse(fromBase64Url(data)) as Partial<ChartPayload>;
    if (
      typeof parsed.q !== "string" ||
      !Array.isArray(parsed.o) ||
      !Array.isArray(parsed.v) ||
      parsed.o.length !== parsed.v.length
    ) {
      return undefined;
    }
    const mine = typeof parsed.m === "number" ? parsed.m : null;
    return pollChartModel({ id: "", q: parsed.q, opts: parsed.o, votes: parsed.v }, mine);
  } catch {
    return undefined;
  }
}

/** Absolute HTTPS url WhatsApp can fetch for the poll-result chart image. */
export function pollChartUrl(baseUrl: string, poll: Poll, mine: number | null): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/chart/poll/${encodeURIComponent(poll.id)}?d=${encodeChartData(poll, mine)}`;
}
