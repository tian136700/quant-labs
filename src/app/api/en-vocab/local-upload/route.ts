import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import { clearEnVocabApiUploadMeanings, uploadEnVocabWords } from "@/lib/en-vocab-db";
import {
  sanitizeEnVocabLocalUploadInput,
  sanitizeEnVocabLocalUploadInputs,
} from "@/lib/en-vocab-local-upload";
import { EN_VOCAB_UPLOAD_SOURCE_API } from "@/lib/en-vocab-upload-source";
import type { EnVocabUploadInput } from "@/lib/types";

const DUPLICATE_WORD_MESSAGE = "单词重复了，库中已存在，已跳过";

function buildUploadSummaryMessage(
  added: number,
  duplicateWords: string[]
): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`成功新增 ${added} 个`);
  if (duplicateWords.length > 0) {
    parts.push(
      `有 ${duplicateWords.length} 个单词重复已跳过：${duplicateWords.join("、")}`
    );
  }
  if (!parts.length) return "没有可写入的单词";
  return parts.join("；");
}

/**
 * 本地 STT / 脚本：直接往英语抽背词库推词（不经英语新课）。
 * 自动标记 upload_source=api → 页面显示「通过API接口上传」。
 * 重复词不覆盖，返回 duplicate_words / duplicates 提示。
 * 不接受释义：即使请求体带 meaning 也会忽略，释义由 fill-meaning 后续补全。
 *
 * POST /api/en-vocab/local-upload
 * Authorization: Bearer <JP_REVIEW_UPLOAD_TOKEN>
 *
 * 维护：{ "mode": "clear_api_meanings" } 清空已有 api 上传词条的释义。
 */
export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = (await request.json()) as {
      mode?: string;
      words?: EnVocabUploadInput[] | EnVocabUploadInput;
      word?: string;
      category?: string | null;
      kind?: string;
      reading?: string | null;
      meaning?: string | null;
    };

    if (body.mode === "clear_api_meanings") {
      const result = await clearEnVocabApiUploadMeanings(env.DB);
      return jsonResponse({
        ok: true,
        mode: "clear_api_meanings",
        cleared: result.cleared,
        message:
          result.cleared > 0
            ? `已清空 ${result.cleared} 条「通过API接口上传」词条的释义`
            : "没有需要清空的 API 上传释义",
      });
    }

    let words: EnVocabUploadInput[] = [];
    if (Array.isArray(body.words)) {
      words = body.words;
    } else if (body.words && typeof body.words === "object") {
      words = [body.words];
    } else if (typeof body.word === "string" && body.word.trim()) {
      words = [
        sanitizeEnVocabLocalUploadInput({
          word: body.word,
          category: body.category,
          kind: body.kind === "grammar" ? "grammar" : "word",
          reading: body.reading,
        }),
      ];
    }

    words = sanitizeEnVocabLocalUploadInputs(words).map((w) => ({
      ...w,
      upload_source: EN_VOCAB_UPLOAD_SOURCE_API,
    }));

    const result = await uploadEnVocabWords(env.DB, words, false, []);

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    const duplicateWords = result.duplicate_words;
    const hasDuplicates = duplicateWords.length > 0;
    const message = buildUploadSummaryMessage(result.added, duplicateWords);

    return jsonResponse({
      ok: true,
      added: result.added,
      skipped: result.skipped,
      total: result.total,
      added_words: result.added_words,
      duplicate_words: duplicateWords,
      /** 每条重复词的提示，方便客户端直接展示 */
      duplicates: duplicateWords.map((word) => ({
        word,
        message: DUPLICATE_WORD_MESSAGE,
      })),
      has_duplicates: hasDuplicates,
      message,
      upload_source: EN_VOCAB_UPLOAD_SOURCE_API,
      upload_source_label: "通过API接口上传",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
