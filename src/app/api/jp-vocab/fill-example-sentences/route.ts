import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyJpVocabExampleSentenceUpdates,
  fillJpVocabExampleSentencesFromCatalog,
  normalizeJpVocabExampleSentencesFormatInDb,
  scanJpVocabWordsIncompleteExampleFurigana,
  scanJpVocabWordsIncompleteExampleGloss,
  scanJpVocabWordsMissingExampleSentences,
} from "@/lib/jp-vocab-fill-example-sentences";
import { normalizeJpVocabNaAdjRowsInDb } from "@/lib/jp-vocab-na-adj-db";
import { verifyUploadAuth } from "@/lib/jp-review";
import { enforceVocabFillRouteRateLimit } from "@/lib/worker-api-rate-limit";

type FillExampleSentencesBody = {
  /**
   * list_missing=拉取缺例句（默认，空 body 亦同）
   * list_missing_related_compounds=缺相关构词（默认单汉字词）
   * apply=提交 updates 写库（有 updates 时自动）
   * catalog / scan_incomplete_gloss / scan_incomplete_furigana / normalize_gloss_label=其它运维模式
   */
  mode?:
    | "list_missing"
    | "list_missing_related_compounds"
    | "apply"
    | "catalog"
    | "scan_incomplete_gloss"
    | "scan_incomplete_furigana"
    | "normalize_gloss_label"
    | "normalize_na_adj";
  dry_run?: boolean;
  /** list_missing：最多返回几条（定时任务建议 10～30） */
  limit?: number;
  /** list_missing：只拉 word 或 grammar */
  kind?: "word" | "grammar";
  /** list_missing_related_compounds：默认 true 只拉单汉字 */
  single_kanji_only?: boolean;
  list_missing_related_compounds?: boolean;
  /** apply：整批默认来源（单条 updates[].source 优先） */
  source?: string;
  /** 默认 catalog：按内置 N5 例句词表补全 */
  from_catalog?: boolean;
  /** 扫描已有例句但缺中文译义 */
  scan_incomplete_gloss?: boolean;
  /** 扫描已有例句但汉字漏标假名 */
  scan_incomplete_furigana?: boolean;
  /** 仅为已有译义补「译文：」前缀 */
  normalize_gloss_label?: boolean;
  /** な形容词「〜だ」剥成词干（词+读音）；list_missing 也会自动跑 */
  normalize_na_adj?: boolean;
  /** 允许覆盖已有 example_sentences（补译义时必开） */
  allow_overwrite?: boolean;
  /**
   * apply：默认 true=严格校验；false=线上 normalize
   * （仍拒 incomplete_kanji_furigana / wrong_jukugo_furigana / bad_furigana_paren）
   */
  validate_format?: boolean;
  updates?: Array<{
    word_id?: number;
    example_sentences?: string;
    connection?: string;
    related_compounds?: string;
    mark_related_compounds_checked?: boolean;
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

    const limited = await enforceVocabFillRouteRateLimit(
      env.DB,
      request,
      "/api/jp-vocab/fill-example-sentences"
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
          example_sentences: String(item.example_sentences ?? "").trim() || null,
          connection: String(item.connection ?? "").trim() || null,
          related_compounds:
            String(item.related_compounds ?? "").trim() || null,
          mark_related_compounds_checked: Boolean(
            item.mark_related_compounds_checked
          ),
          source: per || null,
        };
      })
      .filter(
        (item) =>
          Number.isInteger(item.word_id) &&
          item.word_id > 0 &&
          (Boolean(item.example_sentences) ||
            Boolean(item.connection) ||
            Boolean(item.related_compounds) ||
            Boolean(item.mark_related_compounds_checked))
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
        // 默认严格校验；Agent / 线上 batch 可传 validate_format:false 走 online normalize
        validateFormat: body.validate_format !== false,
        defaultSource: batchSource || null,
      });
    } else if (body.mode === "normalize_na_adj" || body.normalize_na_adj) {
      mode = "normalize_na_adj";
      result = await normalizeJpVocabNaAdjRowsInDb(env.DB, { dryRun });
    } else if (body.mode === "normalize_gloss_label" || body.normalize_gloss_label) {
      mode = "normalize_gloss_label";
      result = await normalizeJpVocabExampleSentencesFormatInDb(env.DB, { dryRun });
    } else if (body.mode === "scan_incomplete_gloss" || body.scan_incomplete_gloss) {
      mode = "scan_incomplete_gloss";
      result = await scanJpVocabWordsIncompleteExampleGloss(env.DB);
    } else if (
      body.mode === "scan_incomplete_furigana" ||
      body.scan_incomplete_furigana
    ) {
      mode = "scan_incomplete_furigana";
      result = await scanJpVocabWordsIncompleteExampleFurigana(env.DB);
    } else if (body.mode === "catalog" || body.from_catalog) {
      mode = "catalog";
      result = await fillJpVocabExampleSentencesFromCatalog(env.DB, { dryRun });
    } else if (
      body.mode === "list_missing_related_compounds" ||
      body.list_missing_related_compounds
    ) {
      mode = "list_missing_related_compounds";
      const { listJpVocabWordsMissingRelatedCompounds } = await import(
        "@/lib/jp-vocab-related-compounds-fill"
      );
      result = await listJpVocabWordsMissingRelatedCompounds(env.DB, {
        limit,
        single_kanji_only: body.single_kanji_only !== false,
      });
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
