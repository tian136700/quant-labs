import { verifyUploadAuth } from "@/lib/jp-review";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { ingestTrendFetch, type TrendIngestPayload } from "@/lib/trend-db";

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }

    if (!body || typeof body !== "object") {
      return jsonResponse({ ok: false, error: "Payload must be an object" }, 400);
    }

    const payload = body as TrendIngestPayload;
    if (!payload.fetched_at || !payload.processed || !payload.raw) {
      return jsonResponse(
        { ok: false, error: "Missing fetched_at, raw, or processed" },
        400
      );
    }

    const result = await ingestTrendFetch(env.DB, payload);
    return jsonResponse({
      ok: true,
      run_id: result.run_id,
      item_count: result.item_count,
      selected_count: result.selected_count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
