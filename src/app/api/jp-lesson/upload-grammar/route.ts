import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { updateJpLessonRefKey } from "@/lib/jp-lesson-db";
import { createOrUpsertJpLessonByCourseLabel } from "@/lib/jp-lesson-db-upsert";
import { saveJpVocabRefFileMeta } from "@/lib/jp-vocab-db";
import { putJpVocabRefFile } from "@/lib/jp-vocab-ref-server";
import { jpLessonRefKey, normalizeJpVocabRefKey } from "@/lib/jp-vocab-ref-shared";
import { verifyUploadAuth } from "@/lib/jp-review";
import type { JpVocabMediaType } from "@/lib/types";

/**
 * 标日等外部系统：单独上传「语法新课」。
 * 等价于 POST /api/jp-lesson/upload + kind=grammar，但强制语法，避免误传成单词。
 *
 * 同 course_label 若已有未完成 grammar（如 combo 占位课），合并写入，不另建一条。
 * 上传后列表为「未完成」；在日语新课里标「已完成」会分批 sync_to_vocab → 日语抽问。
 */

const MAX_BYTES = 20 * 1024 * 1024;

function optionalFormText(form: FormData, key: string): string | null {
  const raw = form.get(key);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    let content = "";
    let meanings: string | null = null;
    let annotations: string | null = null;
    let exampleSentences: string | null = null;
    let title: string | null = null;
    let courseLabel: string | null = null;
    let refKey = "";
    let fileBytes: ArrayBuffer | null = null;
    let mediaType: JpVocabMediaType = "image";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      content = String(form.get("content") || "").trim();
      meanings = optionalFormText(form, "meanings");
      annotations = optionalFormText(form, "annotations");
      exampleSentences = optionalFormText(form, "example_sentences");
      title = optionalFormText(form, "title");
      courseLabel = optionalFormText(form, "course_label");
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
        content?: string;
        meanings?: string | null;
        annotations?: string | null;
        example_sentences?: string | null;
        title?: string | null;
        course_label?: string | null;
        ref_key?: string | null;
      };
      content = String(body.content || "").trim();
      meanings = (body.meanings || "").trim() || null;
      annotations = (body.annotations || "").trim() || null;
      exampleSentences = (body.example_sentences || "").trim() || null;
      title = (body.title || "").trim() || null;
      courseLabel = (body.course_label || "").trim() || null;
      refKey = normalizeJpVocabRefKey(String(body.ref_key || ""));
    }

    if (!content) {
      return jsonResponse({ ok: false, error: "content_required" }, 400);
    }

    const hasFile = Boolean(fileBytes?.byteLength);

    const result = await createOrUpsertJpLessonByCourseLabel(env.DB, {
      kind: "grammar",
      content,
      meanings,
      annotations,
      example_sentences: exampleSentences,
      title,
      course_label: courseLabel,
      // 合并已有课时保留原教案 ref；无 file 且无旧 ref 才用客户端 ref_key
      ref_key: hasFile ? null : refKey || null,
    });

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    let lesson = result.lesson;
    let assignedRefKey: string | null = lesson.ref_key;

    if (hasFile && fileBytes) {
      assignedRefKey = lesson.ref_key || jpLessonRefKey(lesson.id);
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
      if (!lesson.ref_key) {
        const updated = await updateJpLessonRefKey(
          env.DB,
          lesson.id,
          assignedRefKey
        );
        if (updated) lesson = updated;
      }
    }

    return jsonResponse({
      ok: true,
      kind: "grammar",
      lesson,
      upserted: result.upserted,
      superseded_pending_ids: result.superseded_pending_ids,
      ref_key: assignedRefKey,
      ref_view_path: assignedRefKey
        ? `/api/jp-vocab/ref/${assignedRefKey}`
        : null,
      hint: "mark_completed_to_sync_quiz",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
