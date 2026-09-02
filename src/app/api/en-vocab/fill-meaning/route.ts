import { vocabFillRouteErrorResponse } from "@/lib/vocab-fill-route-error";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyEnVocabMeaningUpdates,
  scanEnVocabWordsMissingMeaning,
} from "@/lib/en-vocab-fill-meaning";
import { verifyUploadAuth } from "@/lib/jp-review";
import { enforceVocabFillRouteRateLimit } from "@/lib/worker-api-rate-limit";

type FillMeaningBody = {
  mode?: "list_missing" | "apply";
  dry_run?: boolean;
  limit?: number;
  source?: string;
  /** 线上付费整词刷新：覆盖已有释义/词性 */
  force?: boolean;
  updates?: Array<{
    word_id?: number;
    meaning?: string;
    pos?: string;
    source?: string;
    meaning_source?: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const limited = await enforceVocabFillRouteRateLimit(
      env.DB,
      request,
      "/api/en-vocab/fill-meaning"
    );
    if (limited) return limited;

    let body: FillMeaningBody = {};
    try {
      body = (await request.json()) as FillMeaningBody;
    } catch {
      /* empty body = list_missing */
    }

    const dryRun = Boolean(body.dry_run);
    const batchSource =
      typeof body.source === "string" ? body.source.trim() : "";
    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => {
        const per =
          (typeof item.source === "string" && item.source.trim()) ||
          (typeof item.meaning_source === "string" &&
            item.meaning_source.trim()) ||
          "";
        return {
          word_id: Number(item.word_id),
          meaning:
            item.meaning != null ? String(item.meaning).trim() || null : null,
          pos: item.pos != null ? String(item.pos).trim() || null : null,
          source: per || null,
        };
      })
      .filter(
        (item) =>
          Number.isInteger(item.word_id) &&
          item.word_id > 0 &&
          Boolean(item.meaning || item.pos)
      );

    const limit =
      typeof body.limit === "number" &&
      Number.isFinite(body.limit) &&
      body.limit > 0
        ? Math.floor(body.limit)
        : undefined;

    if (updates.length > 0 || body.mode === "apply") {
      const result = await applyEnVocabMeaningUpdates(env.DB, updates, {
        dryRun,
        validateFormat: !Boolean(body.force),
        defaultSource: batchSource || null,
        force: Boolean(body.force),
      });
      return jsonResponse({
        ok: true,
        mode: "apply",
        ...result,
      });
    }

    const result = await scanEnVocabWordsMissingMeaning(env.DB, { limit });
    return jsonResponse({
      ok: true,
      mode: "list_missing",
      ...result,
    });
  } catch (err) {
    console.error("[en-vocab/fill-meaning]", err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      500
    );
  }
}
