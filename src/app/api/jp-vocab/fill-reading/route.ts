import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyJpVocabReadingUpdates,
  autoFillJpVocabReadings,
} from "@/lib/jp-vocab-fill-reading";
import { verifyUploadAuth } from "@/lib/jp-review";

type FillReadingBody = {
  dry_run?: boolean;
  use_jisho?: boolean;
  jisho_delay_ms?: number;
  updates?: Array<{ word_id?: number; reading?: string }>;
};

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let body: FillReadingBody = {};
    try {
      body = (await request.json()) as FillReadingBody;
    } catch {
      /* empty body = auto mode with defaults */
    }

    const dryRun = Boolean(body.dry_run);
    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => ({
        word_id: Number(item.word_id),
        reading: String(item.reading ?? "").trim(),
      }))
      .filter(
        (item) =>
          Number.isInteger(item.word_id) && item.word_id > 0 && item.reading.length > 0
      );

    const result =
      updates.length > 0
        ? await applyJpVocabReadingUpdates(env.DB, updates, { dryRun })
        : await autoFillJpVocabReadings(env.DB, {
            dryRun,
            useJisho: body.use_jisho !== false,
            jishoDelayMs:
              typeof body.jisho_delay_ms === "number" && body.jisho_delay_ms >= 0
                ? body.jisho_delay_ms
                : 350,
          });

    return jsonResponse({
      ok: true,
      mode: updates.length > 0 ? "apply" : "auto",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
