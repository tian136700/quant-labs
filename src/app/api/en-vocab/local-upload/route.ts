import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import { uploadEnVocabWords } from "@/lib/en-vocab-db";
import { EN_VOCAB_UPLOAD_SOURCE_API } from "@/lib/en-vocab-upload-source";
import type { EnVocabUploadInput } from "@/lib/types";

/**
 * 本地 STT / 脚本：直接往英语抽背词库推词（不经英语新课）。
 * 自动标记 upload_source=api → 页面显示「通过API接口上传」。
 *
 * POST /api/en-vocab/local-upload
 * Authorization: Bearer <JP_REVIEW_UPLOAD_TOKEN>
 * Body: { "words": [ { "word": "condition", "category": "托福词汇" }, … ] }
 */
export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = (await request.json()) as {
      words?: EnVocabUploadInput[] | EnVocabUploadInput;
      word?: string;
      category?: string | null;
      kind?: string;
      reading?: string | null;
      meaning?: string | null;
    };

    let words: EnVocabUploadInput[] = [];
    if (Array.isArray(body.words)) {
      words = body.words;
    } else if (body.words && typeof body.words === "object") {
      words = [body.words];
    } else if (typeof body.word === "string" && body.word.trim()) {
      words = [
        {
          word: body.word,
          category: body.category,
          kind: body.kind === "grammar" ? "grammar" : "word",
          reading: body.reading,
          meaning: body.meaning,
        },
      ];
    }

    words = words.map((w) => ({
      ...w,
      upload_source: EN_VOCAB_UPLOAD_SOURCE_API,
    }));

    const result = await uploadEnVocabWords(env.DB, words, false, []);

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    return jsonResponse({
      ok: true,
      added: result.added,
      skipped: result.skipped,
      total: result.total,
      upload_source: EN_VOCAB_UPLOAD_SOURCE_API,
      upload_source_label: "通过API接口上传",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
