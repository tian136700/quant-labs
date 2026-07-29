import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyJpVocabUsageUpdates,
  clearAllJpVocabGrammarExampleSentences,
  clearJpVocabGrammarPairById,
  scanJpVocabGrammarMissingUsage,
} from "@/lib/jp-vocab-fill-usage";
import { verifyUploadAuth } from "@/lib/jp-review";
import { enforceVocabFillRouteRateLimit } from "@/lib/worker-api-rate-limit";

type FillUsageBody = {
  /** list_missing | apply | clear_grammar_examples | clear_pair */
  mode?:
    | "list_missing"
    | "apply"
    | "clear_grammar_examples"
    | "clear_pair";
  dry_run?: boolean;
  limit?: number;
  source?: string;
  force?: boolean;
  word_id?: number;
  updates?: Array<{
    word_id?: number;
    usage?: string;
    example_sentences?: string;
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
      "/api/jp-vocab/fill-usage"
    );
    if (limited) return limited;

    let body: FillUsageBody = {};
    try {
      body = (await request.json()) as FillUsageBody;
    } catch {
      /* empty = list_missing */
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
          example_sentences: String(item.example_sentences ?? "").trim() || null,
          source: per || null,
        };
      })
      .filter(
        (item) =>
          Number.isInteger(item.word_id) &&
          item.word_id > 0 &&
          (item.usage.length > 0 || Boolean(item.example_sentences))
      );

    const limit =
      typeof body.limit === "number" &&
      Number.isFinite(body.limit) &&
      body.limit > 0
        ? Math.min(Math.floor(body.limit), 20)
        : 1;

    if (body.mode === "clear_grammar_examples") {
      const result = await clearAllJpVocabGrammarExampleSentences(env.DB, {
        dryRun,
      });
      return jsonResponse({
        ok: true,
        mode: "clear_grammar_examples",
        ...result,
      });
    }

    if (body.mode === "clear_pair") {
      const wordId = Number(body.word_id);
      const result = await clearJpVocabGrammarPairById(env.DB, wordId, {
        dryRun,
      });
      return jsonResponse({
        ok: true,
        mode: "clear_pair",
        word_id: wordId,
        ...result,
      });
    }

    if (updates.length > 0 || body.mode === "apply") {
      const result = await applyJpVocabUsageUpdates(env.DB, updates, {
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

    const wordId =
      typeof body.word_id === "number" &&
      Number.isFinite(body.word_id) &&
      body.word_id > 0
        ? Math.floor(body.word_id)
        : undefined;

    const result = await scanJpVocabGrammarMissingUsage(env.DB, {
      limit,
      wordId,
    });
    return jsonResponse({
      ok: true,
      mode: "list_missing",
      limit,
      word_id: wordId ?? null,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
