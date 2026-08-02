import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyJpVocabFrequencyUpdates,
  scanJpVocabMissingFrequency,
} from "@/lib/jp-vocab-fill-frequency";
import { verifyUploadAuth } from "@/lib/jp-review";
import {
  enforceVocabFillRouteRateLimit,
  JP_VOCAB_FILL_FREQUENCY_ROUTE,
} from "@/lib/worker-api-rate-limit";

type FillFrequencyBody = {
  /** list_missing（默认）| apply */
  mode?: "list_missing" | "apply";
  dry_run?: boolean;
  limit?: number;
  /** word | grammar | any */
  kind?: "word" | "grammar" | "any";
  word_id?: number;
  source?: string;
  updates?: Array<{
    word_id?: number;
    oral_frequency?: number | string | null;
    exam_frequency?: number | string | null;
    usage?: string | null;
    usage_merged?: boolean;
    source?: string | null;
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
      JP_VOCAB_FILL_FREQUENCY_ROUTE
    );
    if (limited) return limited;

    let body: FillFrequencyBody = {};
    try {
      body = (await request.json()) as FillFrequencyBody;
    } catch {
      /* empty = list_missing */
    }

    const dryRun = Boolean(body.dry_run);
    const limit =
      typeof body.limit === "number" &&
      Number.isFinite(body.limit) &&
      body.limit > 0
        ? Math.min(Math.floor(body.limit), 20)
        : 1;
    const kind =
      body.kind === "word" || body.kind === "grammar" || body.kind === "any"
        ? body.kind
        : "any";
    const wordId =
      typeof body.word_id === "number" &&
      Number.isInteger(body.word_id) &&
      body.word_id > 0
        ? body.word_id
        : undefined;

    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => ({
        word_id: Number(item.word_id),
        oral_frequency: item.oral_frequency,
        exam_frequency: item.exam_frequency,
        usage: item.usage != null ? String(item.usage) : null,
        usage_merged: Boolean(item.usage_merged),
        source:
          typeof item.source === "string" && item.source.trim()
            ? item.source.trim()
            : typeof body.source === "string" && body.source.trim()
              ? body.source.trim()
              : null,
      }))
      .filter((item) => Number.isInteger(item.word_id) && item.word_id > 0);

    if (updates.length > 0 || body.mode === "apply") {
      const result = await applyJpVocabFrequencyUpdates(env.DB, updates, {
        dryRun,
      });
      return jsonResponse({
        ok: true,
        mode: "apply",
        ...result,
      });
    }

    const result = await scanJpVocabMissingFrequency(env.DB, {
      limit,
      kind,
      wordId,
    });
    return jsonResponse({
      ok: true,
      mode: "list_missing",
      limit,
      kind,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
