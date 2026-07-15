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
  dry_run?: boolean;
  /** 默认 catalog：按内置 N5 例句词表补全 */
  from_catalog?: boolean;
  /** 扫描已有例句但缺中文译义 */
  scan_incomplete_gloss?: boolean;
  /** 仅为已有译义补「译文：」前缀 */
  normalize_gloss_label?: boolean;
  /** 允许覆盖已有 example_sentences（补译义时必开） */
  allow_overwrite?: boolean;
  updates?: Array<{ word_id?: number; example_sentences?: string }>;
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
      /* empty body = scan mode */
    }

    const dryRun = Boolean(body.dry_run);
    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => ({
        word_id: Number(item.word_id),
        example_sentences: String(item.example_sentences ?? "").trim(),
      }))
      .filter(
        (item) =>
          Number.isInteger(item.word_id) &&
          item.word_id > 0 &&
          item.example_sentences.length > 0
      );

    let result;
    let mode: string;
    if (updates.length > 0) {
      mode = "apply";
      result = await applyJpVocabExampleSentenceUpdates(env.DB, updates, {
        dryRun,
        allowOverwrite: Boolean(body.allow_overwrite),
      });
    } else if (body.normalize_gloss_label) {
      mode = "normalize_gloss_label";
      result = await normalizeJpVocabExampleSentencesFormatInDb(env.DB, { dryRun });
    } else if (body.scan_incomplete_gloss) {
      mode = "scan_incomplete_gloss";
      result = await scanJpVocabWordsIncompleteExampleGloss(env.DB);
    } else if (body.from_catalog) {
      mode = "catalog";
      result = await fillJpVocabExampleSentencesFromCatalog(env.DB, { dryRun });
    } else {
      mode = "scan";
      result = await scanJpVocabWordsMissingExampleSentences(env.DB);
    }

    return jsonResponse({
      ok: true,
      mode,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
