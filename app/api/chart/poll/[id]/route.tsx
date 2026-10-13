// -----------------------------------------------------------------------------
// Poll-result chart image (PNG). WhatsApp can fetch this URL, and the renderer
// also generates the same PNG in-process (src/render/pollChartImage.tsx) so it
// can upload the bytes before sending — that keeps the chart above the
// numbers bubble. The `d` query param is the authoritative snapshot.
// -----------------------------------------------------------------------------
import { createSampleRepositories } from "../../../../../src/data/sample.js";
import { renderPollChart } from "../../../../../src/render/pollChartImage.js";
import { decodeChartData, pollChartModel } from "../../../../../src/services/pollChart.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const url = new URL(request.url);

  let model = decodeChartData(url.searchParams.get("d"));
  if (!model) {
    const poll = await createSampleRepositories().polls.get(id);
    if (!poll) return new Response("Poll not found", { status: 404 });
    model = pollChartModel(poll, null);
  }

  return renderPollChart(model);
}
