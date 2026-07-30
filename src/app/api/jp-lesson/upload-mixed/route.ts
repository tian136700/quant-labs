import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { createJpLessonMixed, updateJpLessonRefKey } from "@/lib/jp-lesson-db";
import { saveJpVocabRefFileMeta } from "@/lib/jp-vocab-db";
import { putJpVocabRefFile } from "@/lib/jp-vocab-ref-server";
import { jpLessonRefKey, normalizeJpVocabRefKey } from "@/lib/jp-vocab-ref-shared";
import { verifyUploadAuth } from "@/lib/jp-review";
import type { JpVocabMediaType } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

function optionalFormText(form: FormData, key: string): string | null {
  const raw = form.get(key);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * 日语新课：同一课同时传单词 + 语法（+ 可选教案文件）。
 * 入库 kind=word_grammar；列表显示「单词加语法」；
 * 标已完成后，单词以 kind=word、语法以 kind=grammar 同步到日语抽问。
 */
export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    let wordContent = "";
    let wordMeanings: string | null = null;
    let wordAnnotations: string | null = null;
    let wordExampleSentences: string | null = null;
    let grammarContent = "";
    let grammarMeanings: string | null = null;
    let grammarAnnotations: string | null = null;
    let grammarExampleSentences: string | null = null;
    let title: string | null = null;
    let refKey = "";
    let fileBytes: ArrayBuffer | null = null;
    let mediaType: JpVocabMediaType = "image";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      wordContent = String(form.get("word_content") || "").trim();
      wordMeanings = optionalFormText(form, "word_meanings");
      wordAnnotations = optionalFormText(form, "word_annotations");
      wordExampleSentences = optionalFormText(form, "word_example_sentences");
      grammarContent = String(form.get("grammar_content") || "").trim();
      grammarMeanings = optionalFormText(form, "grammar_meanings");
      grammarAnnotations = optionalFormText(form, "grammar_annotations");
      grammarExampleSentences = optionalFormText(
        form,
        "grammar_example_sentences"
      );
      title = optionalFormText(form, "title");
      refKey = normalizeJpVocabRefKey(String(form.get("ref_key") || ""));

      const file = form.get("file");
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_BYTES) {
          return jsonResponse({ ok: false, error: "File too large (max 20MB)" }, 413);
        }
        fileBytes = await file.arrayBuffer();
        const rawType = String(form.get("media_type") || "").trim().toLowerCase();
        mediaType =
          rawType === "pdf" || file.type === "application/pdf" ? "pdf" : "image";
      }
    } else {
      const body = (await request.json()) as {
        word_content?: string;
        word_meanings?: string | null;
        word_annotations?: string | null;
        word_example_sentences?: string | null;
        grammar_content?: string;
        grammar_meanings?: string | null;
        grammar_annotations?: string | null;
        grammar_example_sentences?: string | null;
        title?: string | null;
        ref_key?: string | null;
      };
      wordContent = String(body.word_content || "").trim();
      wordMeanings = (body.word_meanings || "").trim() || null;
      wordAnnotations = (body.word_annotations || "").trim() || null;
      wordExampleSentences = (body.word_example_sentences || "").trim() || null;
      grammarContent = String(body.grammar_content || "").trim();
      grammarMeanings = (body.grammar_meanings || "").trim() || null;
      grammarAnnotations = (body.grammar_annotations || "").trim() || null;
      grammarExampleSentences =
        (body.grammar_example_sentences || "").trim() || null;
      title = (body.title || "").trim() || null;
      refKey = normalizeJpVocabRefKey(String(body.ref_key || ""));
    }

    if (!wordContent) {
      return jsonResponse({ ok: false, error: "word_content_required" }, 400);
    }
    if (!grammarContent) {
      return jsonResponse({ ok: false, error: "grammar_content_required" }, 400);
    }

    const hasFile = Boolean(fileBytes?.byteLength);

    const result = await createJpLessonMixed(env.DB, {
      word_content: wordContent,
      word_meanings: wordMeanings,
      word_annotations: wordAnnotations,
      word_example_sentences: wordExampleSentences,
      grammar_content: grammarContent,
      grammar_meanings: grammarMeanings,
      grammar_annotations: grammarAnnotations,
      grammar_example_sentences: grammarExampleSentences,
      title,
      ref_key: hasFile ? null : refKey || null,
    });

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    let lesson = result.lesson;
    let assignedRefKey: string | null = lesson.ref_key;

    if (hasFile && fileBytes) {
      assignedRefKey = jpLessonRefKey(lesson.id);
      const stored = await putJpVocabRefFile(
        env,
        assignedRefKey,
        mediaType,
        fileBytes
      );
      await saveJpVocabRefFileMeta(
        env.DB,
        assignedRefKey,
        title,
        mediaType,
        stored.r2_key
      );
      const updated = await updateJpLessonRefKey(env.DB, lesson.id, assignedRefKey);
      if (updated) lesson = updated;
    }

    return jsonResponse({
      ok: true,
      lesson,
      ref_key: assignedRefKey,
      ref_view_path: assignedRefKey
        ? `/api/jp-vocab/ref/${assignedRefKey}`
        : null,
      kind: "word_grammar",
      kind_label: "单词加语法",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
