import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyEnVocabUsageUpdates,
  scanEnVocabWordsMissingUsage,
  stripEnVocabUsageExamLabelsInDb,
} from "@/lib/en-vocab-fill-usage";
import { verifyUploadAuth } from "@/lib/jp-review";
import { enforceVocabFillRouteRateLimit } from "@/lib/worker-api-rate-limit";

type FillUsageBody = {
  mode?: "list_missing" | "apply" | "strip_exam_labels";
  dry_run?: boolean;
  limit?: number;
  kind?: "word" | "grammar";
  source?: string;
  /** 线上付费整词刷新：覆盖已有用法 */
  force?: boolean;
  updates?: Array<{
    word_id?: number;
    usage?: string;
    source?: string;
    usage_source?: string;
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
      "/api/en-vocab/fill-usage"
    );
    if (limited) return limited;

    let body: FillUsageBody = {};
    try {
      body = (await request.json()) as FillUsageBody;
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
          (typeof item.usage_source === "string" && item.usage_source.trim()) ||
          "";
        return {
          word_id: Number(item.word_id),
          usage: String(item.usage ?? "").trim(),
          source: per || null,
        };
      })
      .filter(
        (item) =>
          Number.isInteger(item.word_id) &&
          item.word_id > 0 &&
          item.usage.length > 0
      );

    const kind =
      body.kind === "word" || body.kind === "grammar" ? body.kind : undefined;
    const limit =
      typeof body.limit === "number" &&
      Number.isFinite(body.limit) &&
      body.limit > 0
        ? Math.floor(body.limit)
        : undefined;

    if (body.mode === "strip_exam_labels") {
      const result = await stripEnVocabUsageExamLabelsInDb(env.DB, {
        dryRun,
        limit,
      });
      return jsonResponse({
        ok: true,
        mode: "strip_exam_labels",
        ...result,
      });
    }

    if (updates.length > 0 || body.mode === "apply") {
      const result = await applyEnVocabUsageUpdates(env.DB, updates, {
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

    const result = await scanEnVocabWordsMissingUsage(env.DB, {
      limit,
      kind,
    });
    return jsonResponse({
      ok: true,
      mode: "list_missing",
      ...result,
    });
  } catch (err) {
    console.error("[en-vocab/fill-usage]", err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      500
    );
  }
}
