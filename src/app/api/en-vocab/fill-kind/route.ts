import { vocabFillRouteErrorResponse } from "@/lib/vocab-fill-route-error";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyEnVocabKindUpdates,
  scanEnVocabMisclassifiedKind,
} from "@/lib/en-vocab-fill-kind";
import { verifyUploadAuth } from "@/lib/jp-review";
import { enforceVocabFillRouteRateLimit } from "@/lib/worker-api-rate-limit";

type FillKindBody = {
  mode?: "list_missing" | "apply";
  dry_run?: boolean;
  limit?: number;
  source?: string;
  updates?: Array<{
    word_id?: number;
    kind?: string;
    source?: string;
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
      "/api/en-vocab/fill-kind"
    );
    if (limited) return limited;

    let body: FillKindBody = {};
    try {
      body = (await request.json()) as FillKindBody;
    } catch {
      /* empty */
    }

    const dryRun = Boolean(body.dry_run);
    const batchSource =
      typeof body.source === "string" ? body.source.trim() : "";
    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => ({
        word_id: Number(item.word_id),
        kind: String(item.kind || "").trim(),
        source:
          (typeof item.source === "string" && item.source.trim()) || null,
      }))
      .filter(
        (item) =>
          Number.isInteger(item.word_id) &&
          item.word_id > 0 &&
          item.kind === "grammar"
      )
      .map((item) => ({
        word_id: item.word_id,
        kind: "grammar" as const,
        source: item.source,
      }));

    const limit =
      typeof body.limit === "number" &&
      Number.isFinite(body.limit) &&
      body.limit > 0
        ? Math.floor(body.limit)
        : undefined;

    if (updates.length > 0 || body.mode === "apply") {
      const result = await applyEnVocabKindUpdates(env.DB, updates, {
        dryRun,
        defaultSource: batchSource || null,
      });
      return jsonResponse({
        ok: true,
        mode: "apply",
        ...result,
      });
    }

    const result = await scanEnVocabMisclassifiedKind(env.DB, { limit });
    return jsonResponse({
      ok: true,
      mode: "list_missing",
      ...result,
    });
  } catch (err) {
    console.error("[en-vocab/fill-kind]", err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      500
    );
  }
}
