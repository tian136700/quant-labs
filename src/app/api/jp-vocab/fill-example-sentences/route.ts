import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyJpVocabExampleSentenceUpdates,
  fillJpVocabExampleSentencesFromCatalog,
  normalizeJpVocabExampleSentencesFormatInDb,
  scanJpVocabWordsIncompleteExampleGloss,
  scanJpVocabWordsMissingExampleSentences,
} from "@/lib/jp-vocab-fill-example-sentences";
import { verifyUploadAuth } from "@/lib/jp-review";

type FillExampleSentencesBody = {
  /**
   * list_missing=拉取缺例句（默认，空 body 亦同）
   * apply=提交 updates 写库（有 updates 时自动）
   * catalog / scan_incomplete_gloss / normalize_gloss_label=其它运维模式
   */
  mode?:
    | "list_missing"
    | "apply"
    | "catalog"
    | "scan_incomplete_gloss"
    | "normalize_gloss_label";
  dry_run?: boolean;
  /** list_missing：最多返回几条（定时任务建议 10～30） */
  limit?: number;
  /** list_missing：只拉 word 或 grammar */
  kind?: "word" | "grammar";
  /** apply：整批默认来源（单条 updates[].source 优先） */
  source?: string;
  /** 默认 catalog：按内置 N5 例句词表补全 */
  from_catalog?: boolean;
  /** 扫描已有例句但缺中文译义 */
  scan_incomplete_gloss?: boolean;
  /** 仅为已有译义补「译文：」前缀 */
  normalize_gloss_label?: boolean;
  /** 允许覆盖已有 example_sentences（补译义时必开） */
  allow_overwrite?: boolean;
  updates?: Array<{
    word_id?: number;
    example_sentences?: string;
    /** 例句来源，如 DeepSeek / Qwen本地 / 手动 */
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
      typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0
        ? Math.floor(body.limit)
        : undefined;

    let result;
    let mode: string;

    if (updates.length > 0 || body.mode === "apply") {
      mode = "apply";
      result = await applyJpVocabExampleSentenceUpdates(env.DB, updates, {
        dryRun,
        allowOverwrite: Boolean(body.allow_overwrite),
        validateFormat: true,
        defaultSource: batchSource || null,
      });
    } else if (body.mode === "normalize_gloss_label" || body.normalize_gloss_label) {
      mode = "normalize_gloss_label";
      result = await normalizeJpVocabExampleSentencesFormatInDb(env.DB, { dryRun });
    } else if (body.mode === "scan_incomplete_gloss" || body.scan_incomplete_gloss) {
      mode = "scan_incomplete_gloss";
      result = await scanJpVocabWordsIncompleteExampleGloss(env.DB);
    } else if (body.mode === "catalog" || body.from_catalog) {
      mode = "catalog";
      result = await fillJpVocabExampleSentencesFromCatalog(env.DB, { dryRun });
    } else {
      mode = "list_missing";
      result = await scanJpVocabWordsMissingExampleSentences(env.DB, {
        limit,
        kind,
      });
    }

    return jsonResponse({
      ok: true,
      mode,
      ...(limit != null ? { limit } : {}),
      ...(kind ? { kind } : {}),
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
