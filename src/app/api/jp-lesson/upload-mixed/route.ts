import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { createJpLessonMixed, updateJpLessonRefKey } from "@/lib/jp-lesson-db";
import { saveJpVocabRefFileMeta } from "@/lib/jp-vocab-db";
import { putJpVocabRefFile } from "@/lib/jp-vocab-ref-server";
import { jpLessonRefKey, normalizeJpVocabRefKey } from "@/lib/jp-vocab-ref-shared";
import { verifyUploadAuth } from "@/lib/jp-review";
import type { JpLessonRecord, JpVocabMediaType } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

function optionalFormText(form: FormData, key: string): string | null {
  const raw = form.get(key);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

type UploadFilePart = {
  bytes: ArrayBuffer;
  mediaType: JpVocabMediaType;
};

async function materializeFormFile(
  form: FormData,
  fileKey: string,
  mediaTypeKey: string
): Promise<UploadFilePart | null | { error: string; status: number }> {
  const file = form.get(fileKey);
  if (!(file instanceof File) || file.size <= 0) return null;
  if (file.size > MAX_BYTES) {
    return { error: "File too large (max 20MB)", status: 413 };
  }
  const rawType = String(form.get(mediaTypeKey) || "").trim().toLowerCase();
  const mediaType: JpVocabMediaType =
    rawType === "pdf" || file.type === "application/pdf" ? "pdf" : "image";
  return { bytes: await file.arrayBuffer(), mediaType };
}

async function attachLessonFile(
  env: Awaited<ReturnType<typeof getCloudflareEnv>>,
  lesson: JpLessonRecord,
  part: UploadFilePart,
  title: string | null
): Promise<JpLessonRecord> {
  const assignedRefKey = jpLessonRefKey(lesson.id);
  const stored = await putJpVocabRefFile(
    env,
    assignedRefKey,
    part.mediaType,
    part.bytes
  );
  await saveJpVocabRefFileMeta(
    env.DB,
    assignedRefKey,
    title,
    part.mediaType,
    stored.r2_key
  );
  const updated = await updateJpLessonRefKey(env.DB, lesson.id, assignedRefKey);
  return updated ?? { ...lesson, ref_key: assignedRefKey };
}

/**
 * 日语新课合传：一次请求同时上传「单词课 + 语法课」（可各带教案）。
 * 入库为两条：kind=word / kind=grammar，共享 course_label（如「标日23课」）与 course_group_id。
 * 列表类型仍分开展示；「教材」列显示 course_label。各自标已完成分别进抽问。
 */
export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    let courseLabel = "";
    let wordContent = "";
    let wordMeanings: string | null = null;
    let wordAnnotations: string | null = null;
    let wordExampleSentences: string | null = null;
    let grammarContent = "";
    let grammarMeanings: string | null = null;
    let grammarAnnotations: string | null = null;
    let grammarExampleSentences: string | null = null;
    let title: string | null = null;
    let wordRefKey = "";
    let grammarRefKey = "";
    let wordFile: UploadFilePart | null = null;
    let grammarFile: UploadFilePart | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      courseLabel =
        optionalFormText(form, "course_label") ||
        optionalFormText(form, "title") ||
        "";
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
      wordRefKey = normalizeJpVocabRefKey(
        String(form.get("word_ref_key") || form.get("ref_key") || "")
      );
      grammarRefKey = normalizeJpVocabRefKey(
        String(form.get("grammar_ref_key") || "")
      );

      const wordPart = await materializeFormFile(
        form,
        "word_file",
        "word_media_type"
      );
      if (wordPart && "error" in wordPart) {
        return jsonResponse(
          { ok: false, error: wordPart.error },
          wordPart.status
        );
      }
      wordFile = wordPart;

      const grammarPart = await materializeFormFile(
        form,
        "grammar_file",
        "grammar_media_type"
      );
      if (grammarPart && "error" in grammarPart) {
        return jsonResponse(
          { ok: false, error: grammarPart.error },
          grammarPart.status
        );
      }
      grammarFile = grammarPart;

      // 兼容旧客户端只传一个 file：两边各绑同一教案（不推荐）
      if (!wordFile && !grammarFile) {
        const legacy = await materializeFormFile(form, "file", "media_type");
        if (legacy && "error" in legacy) {
          return jsonResponse(
            { ok: false, error: legacy.error },
            legacy.status
          );
        }
        if (legacy) {
          wordFile = legacy;
          grammarFile = legacy;
        }
      }
    } else {
      const body = (await request.json()) as {
        course_label?: string | null;
        word_content?: string;
        word_meanings?: string | null;
        word_annotations?: string | null;
        word_example_sentences?: string | null;
        grammar_content?: string;
        grammar_meanings?: string | null;
        grammar_annotations?: string | null;
        grammar_example_sentences?: string | null;
        title?: string | null;
        word_ref_key?: string | null;
        grammar_ref_key?: string | null;
        ref_key?: string | null;
      };
      courseLabel = (body.course_label || body.title || "").trim();
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
      wordRefKey = normalizeJpVocabRefKey(
        String(body.word_ref_key || body.ref_key || "")
      );
      grammarRefKey = normalizeJpVocabRefKey(String(body.grammar_ref_key || ""));
    }

    if (!courseLabel) {
      return jsonResponse({ ok: false, error: "course_label_required" }, 400);
    }
    if (!wordContent) {
      return jsonResponse({ ok: false, error: "word_content_required" }, 400);
    }
    if (!grammarContent) {
      return jsonResponse({ ok: false, error: "grammar_content_required" }, 400);
    }

    const result = await createJpLessonMixed(env.DB, {
      course_label: courseLabel,
      word_content: wordContent,
      word_meanings: wordMeanings,
      word_annotations: wordAnnotations,
      word_example_sentences: wordExampleSentences,
      grammar_content: grammarContent,
      grammar_meanings: grammarMeanings,
      grammar_annotations: grammarAnnotations,
      grammar_example_sentences: grammarExampleSentences,
      title,
      word_ref_key: wordFile ? null : wordRefKey || null,
      grammar_ref_key: grammarFile ? null : grammarRefKey || null,
    });

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    let wordLesson = result.word_lesson;
    let grammarLesson = result.grammar_lesson;

    if (wordFile) {
      wordLesson = await attachLessonFile(env, wordLesson, wordFile, title || courseLabel);
    }
    if (grammarFile) {
      // 若与 word 共用同一 ArrayBuffer（legacy 单 file），再存一份独立 ref
      grammarLesson = await attachLessonFile(
        env,
        grammarLesson,
        grammarFile,
        title || courseLabel
      );
    }

    return jsonResponse({
      ok: true,
      course_label: result.course_label,
      course_group_id: result.course_group_id,
      word_lesson: wordLesson,
      grammar_lesson: grammarLesson,
      lessons: [wordLesson, grammarLesson],
      word_ref_key: wordLesson.ref_key,
      grammar_ref_key: grammarLesson.ref_key,
      word_ref_view_path: wordLesson.ref_key
        ? `/api/jp-vocab/ref/${wordLesson.ref_key}`
        : null,
      grammar_ref_view_path: grammarLesson.ref_key
        ? `/api/jp-vocab/ref/${grammarLesson.ref_key}`
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
