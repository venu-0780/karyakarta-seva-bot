// -----------------------------------------------------------------------------
// Poll-result chart PNG (next/og). Shared by the public image route
// (app/api/chart/poll) and the WhatsApp renderer, which uploads the bytes
// itself so the chart is already on WhatsApp's servers when the message is
// sent — otherwise WhatsApp fetches the URL in the background and the next
// text bubble overtakes the image.
// -----------------------------------------------------------------------------
import { ImageResponse } from "next/og";

import type { PollChartModel } from "../services/pollChart.js";

const WIDTH = 820;
const BAR_HEIGHT = 24;
const GREEN = "#1a8f3c";
const GREEN_MINE = "#0f6e2c";
const TRACK = "#e6ece6";
const INK = "#15321f";
const MUTED = "#5c6b60";

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
            return { name: f.name, data: await res.arrayBuffer(), weight: f.weight, style: "normal" as const };
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

/** PNG response for a poll snapshot. Height grows with the question and options. */
export async function renderPollChart(model: PollChartModel): Promise<Response> {
  const titleLines = Math.min(3, Math.max(1, Math.ceil(model.q.length / 36)));
  const header = 110 + titleLines * 40;
  const row = BAR_HEIGHT + 62;
  const height = header + model.options.length * row + 70;
  const fonts = await loadFonts();
  return new ImageResponse(<Chart model={model} />, {
    width: WIDTH,
    height,
    ...(fonts.length ? { fonts } : {}),
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}

/** Raw PNG bytes, for uploading to WhatsApp before the message is sent. */
export async function renderPollChartPng(model: PollChartModel): Promise<Uint8Array> {
  const res = await renderPollChart(model);
  return new Uint8Array(await res.arrayBuffer());
}
