import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyEnVocabReadingUpdates,
  scanEnVocabWordsMissingReading,
} from "@/lib/en-vocab-fill-reading";
import { verifyUploadAuth } from "@/lib/jp-review";

type FillReadingBody = {
  mode?: "list_missing" | "apply";
  dry_run?: boolean;
  limit?: number;
  source?: string;
  /** 线上付费整词刷新：覆盖已有音标 */
  force?: boolean;
  updates?: Array<{
    word_id?: number;
    reading?: string;
    source?: string;
    reading_source?: string;
  }>;
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
      /* empty body → list_missing */
    }

    const dryRun = Boolean(body.dry_run);
    const batchSource =
      typeof body.source === "string" ? body.source.trim() : "";
    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => {
        const per =
          (typeof item.source === "string" && item.source.trim()) ||
          (typeof item.reading_source === "string" &&
            item.reading_source.trim()) ||
          "";
        return {
          word_id: Number(item.word_id),
          reading: String(item.reading ?? "").trim(),
          source: per || null,
        };
      })
      .filter(
        (item) =>
          Number.isInteger(item.word_id) &&
          item.word_id > 0 &&
          item.reading.length > 0
      );

    const limit =
      typeof body.limit === "number" &&
      Number.isFinite(body.limit) &&
      body.limit > 0
        ? Math.floor(body.limit)
        : undefined;

    if (updates.length > 0 || body.mode === "apply") {
      const result = await applyEnVocabReadingUpdates(env.DB, updates, {
        dryRun,
        validateFormat: true,
        defaultSource: batchSource || null,
        force: Boolean(body.force),
      });
      return jsonResponse({
        ok: true,
        mode: "apply",
        ...result,
      });
    }

    const result = await scanEnVocabWordsMissingReading(env.DB, { limit });
    return jsonResponse({
      ok: true,
      mode: "list_missing",
      ...result,
    });
  } catch (err) {
    console.error("[en-vocab/fill-reading]", err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      500
    );
  }
}
