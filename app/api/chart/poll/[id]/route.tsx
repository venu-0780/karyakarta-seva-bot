// -----------------------------------------------------------------------------
// Poll-result chart image (PNG), rendered with next/og.
//
// WhatsApp fetches this URL itself, so it must be public HTTPS. The flow builds
// the URL via src/services/pollChart.ts, passing an authoritative snapshot in
// the `d` query param (url-safe base64 JSON). This route is a pure, stateless
// renderer: it decodes `d`; if that's missing/invalid it falls back to loading
// the poll by id from the repositories.
//
// It is purely additive — the poll flow always sends exact numbers as text too,
// so if this image ever fails to render or load, the member still sees results.
// -----------------------------------------------------------------------------
import { ImageResponse } from "next/og";

import { createSampleRepositories } from "../../../../../src/data/sample.js";
import { decodeChartData, pollChartModel, type PollChartModel } from "../../../../../src/services/pollChart.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 820;
const BAR_HEIGHT = 24;
const GREEN = "#1a8f3c";
const GREEN_MINE = "#0f6e2c";
const TRACK = "#e6ece6";
const INK = "#15321f";
const MUTED = "#5c6b60";

// --- Fonts (Latin + Telugu) --------------------------------------------------
// Fetched once per instance from jsdelivr and cached. On any failure we fall
// back to next/og's built-in font (Latin only); Telugu labels would then not
// render, but the message's text block still carries the exact results.
type FontSpec = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

const FONT_URLS: { url: string; name: string; weight: 400 | 700 }[] = [
  { url: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5/files/noto-sans-latin-400-normal.woff", name: "Noto Sans", weight: 400 },
  { url: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5/files/noto-sans-latin-700-normal.woff", name: "Noto Sans", weight: 700 },
  { url: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-telugu@5/files/noto-sans-telugu-telugu-400-normal.woff", name: "Noto Sans Telugu", weight: 400 },
  { url: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-telugu@5/files/noto-sans-telugu-telugu-700-normal.woff", name: "Noto Sans Telugu", weight: 700 },
];

let fontsPromise: Promise<FontSpec[]> | undefined;

async function loadFonts(): Promise<FontSpec[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      try {
        const specs = await Promise.all(
          FONT_URLS.map(async (f) => {
            const res = await fetch(f.url);
            if (!res.ok) throw new Error(`font ${res.status}`);
            const data = await res.arrayBuffer();
            return { name: f.name, data, weight: f.weight, style: "normal" as const };
          }),
        );
        return specs;
      } catch {
        return [];
      }
    })();
  }
  return fontsPromise;
}

// --- Chart element -----------------------------------------------------------
function Chart({ model }: { model: PollChartModel }) {
  const fontFamily = '"Noto Sans", "Noto Sans Telugu"';
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 48,
        backgroundColor: "#ffffff",
        fontFamily,
      }}
    >
      <div style={{ display: "flex", fontSize: 20, color: GREEN, fontWeight: 700, letterSpacing: 1 }}>
        PRAJA SEVA · POLL RESULTS
      </div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 30, color: INK, fontWeight: 700, lineHeight: 1.15 }}>
        {model.q}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
        {model.options.map((o, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
            <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", flexDirection: "row", alignItems: "center", fontSize: 26, color: INK, fontWeight: o.mine ? 700 : 400 }}>
                {o.mine ? (
                  <div
                    style={{ display: "flex", width: 14, height: 14, borderRadius: 14, backgroundColor: GREEN_MINE, marginRight: 10 }}
                  />
                ) : null}
                {o.label}
                {o.mine ? (
                  <div style={{ display: "flex", fontSize: 18, color: GREEN_MINE, fontWeight: 700, marginLeft: 10 }}>
                    YOUR VOTE
                  </div>
                ) : null}
              </div>
              <div style={{ display: "flex", fontSize: 24, color: MUTED, fontWeight: 700 }}>
                {o.pct}% · {o.votes.toLocaleString("en-IN")}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: BAR_HEIGHT,
                backgroundColor: TRACK,
                borderRadius: BAR_HEIGHT,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: `${Math.max(o.pct, 1)}%`,
                  height: BAR_HEIGHT,
                  backgroundColor: o.mine ? GREEN_MINE : GREEN,
                  borderRadius: BAR_HEIGHT,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: "auto", fontSize: 22, color: MUTED }}>
        {model.total.toLocaleString("en-IN")} total votes
      </div>
    </div>
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const url = new URL(request.url);

  // Prefer the authoritative snapshot in `d`; fall back to loading the poll.
  let model = decodeChartData(url.searchParams.get("d"));
  if (!model) {
    const poll = await createSampleRepositories().polls.get(id);
    if (!poll) return new Response("Poll not found", { status: 404 });
    model = pollChartModel(poll, null);
  }

  // Reserve enough vertical space for a question that wraps (so it never
  // overlaps the first bar) plus one block per option.
  const titleLines = Math.min(3, Math.max(1, Math.ceil(model.q.length / 36)));
  const header = 110 + titleLines * 40;
  const row = BAR_HEIGHT + 62; // label line + bar + gap
  const height = header + model.options.length * row + 70;
  const fonts = await loadFonts();

  return new ImageResponse(<Chart model={model} />, {
    width: WIDTH,
    height,
    ...(fonts.length ? { fonts } : {}),
    headers: {
      // Cache aggressively at the edge; the `d` snapshot makes each URL unique.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
