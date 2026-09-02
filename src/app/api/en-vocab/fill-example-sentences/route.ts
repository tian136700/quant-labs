import { vocabFillRouteErrorResponse } from "@/lib/vocab-fill-route-error";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyEnVocabExampleSentenceUpdates,
  clearAllEnVocabExampleSentences,
  clearInvalidEnVocabExampleSentences,
  scanEnVocabWordsMissingExampleSentences,
} from "@/lib/en-vocab-fill-example-sentences";
import { verifyUploadAuth } from "@/lib/jp-review";
import { enforceVocabFillRouteRateLimit } from "@/lib/worker-api-rate-limit";

type FillExampleSentencesBody = {
  mode?: "list_missing" | "apply" | "clear_all" | "clear_invalid";
  dry_run?: boolean;
  limit?: number;
  kind?: "word" | "grammar";
  source?: string;
  /** 线上付费整词刷新：覆盖已有例句 */
  force?: boolean;
  updates?: Array<{
    word_id?: number;
    example_sentences?: string;
    source?: string;
    example_sentences_source?: string;
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
      "/api/en-vocab/fill-example-sentences"
    );
    if (limited) return limited;

    let body: FillExampleSentencesBody = {};
    try {
      body = (await request.json()) as FillExampleSentencesBody;
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
          (typeof item.example_sentences_source === "string" &&
            item.example_sentences_source.trim()) ||
          "";
        return {
          word_id: Number(item.word_id),
          example_sentences: String(item.example_sentences ?? "").trim(),
          source: per || null,
        };
      })
      .filter(
        (item) =>
          Number.isInteger(item.word_id) &&
          item.word_id > 0 &&
          item.example_sentences.length > 0
      );

    const kind =
      body.kind === "word" || body.kind === "grammar" ? body.kind : undefined;
    const limit =
      typeof body.limit === "number" &&
      Number.isFinite(body.limit) &&
      body.limit > 0
        ? Math.floor(body.limit)
        : undefined;

    if (body.mode === "clear_all") {
      const result = await clearAllEnVocabExampleSentences(env.DB, { dryRun });
      return jsonResponse({
        ok: true,
        mode: "clear_all",
        ...result,
      });
    }

    if (body.mode === "clear_invalid") {
      const result = await clearInvalidEnVocabExampleSentences(env.DB, {
        dryRun,
        limit,
      });
      return jsonResponse({
        ok: true,
        mode: "clear_invalid",
        ...result,
      });
    }

    if (updates.length > 0 || body.mode === "apply") {
      const result = await applyEnVocabExampleSentenceUpdates(env.DB, updates, {
        dryRun,
        // 与 reading/meaning/usage 一致：force → 放宽严校验（仍挡 structured dump）
        // 曾硬编码 true → 付费结果被 word_not_used/wrong_example_count 拒收 → 下一轮整词再烧 Claude
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

    const result = await scanEnVocabWordsMissingExampleSentences(env.DB, {
      limit,
      kind,
    });
    return jsonResponse({
      ok: true,
      mode: "list_missing",
      ...result,
    });
  } catch (err) {
    console.error("[en-vocab/fill-example-sentences]", err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      500
    );
  }
}
