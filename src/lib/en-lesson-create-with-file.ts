/**
 * 英语新课建课 + 可选教案文件（upload 令牌接口与网页 create 共用）。
 */
import { createEnLesson, updateEnLessonRefKey } from "@/lib/en-lesson-db";
import { normalizeEnVocabCategory } from "@/lib/en-vocab-category";
import { saveEnVocabRefFileMeta } from "@/lib/en-vocab-db";
import { putEnVocabRefFile } from "@/lib/en-vocab-ref-server";
import { enLessonRefKey, normalizeEnVocabRefKey } from "@/lib/en-vocab-ref-shared";
import type { CloudflareEnv, EnLessonKind, EnLessonRecord, EnVocabMediaType } from "@/lib/types";

export const EN_LESSON_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export type EnLessonCreateWithFileInput = {
  kind: EnLessonKind;
  content: string;
  title?: string | null;
  category?: string | null;
  /** 课次备注（如语法说明） */
  remarks?: string | null;
  /** 无 file 时可绑定已有教案 key */
  ref_key?: string | null;
  fileBytes?: ArrayBuffer | null;
  mediaType?: EnVocabMediaType;
};

export type EnLessonCreateWithFileResult =
  | {
      ok: true;
      lesson: EnLessonRecord;
      ref_key: string | null;
      ref_view_path: string | null;
    }
  | { ok: false; error: string; status: number };

export async function createEnLessonWithOptionalFile(
  env: CloudflareEnv,
  input: EnLessonCreateWithFileInput
): Promise<EnLessonCreateWithFileResult> {
  const content = String(input.content || "").trim();
  if (!content) {
    return { ok: false, error: "content_required", status: 400 };
  }

  const kind: EnLessonKind = input.kind === "grammar" ? "grammar" : "word";
  const title = (input.title || "").trim() || null;
  const remarks = (input.remarks || "").trim() || null;
  const category = normalizeEnVocabCategory(input.category);
  const refKey = normalizeEnVocabRefKey(String(input.ref_key || ""));
  const fileBytes = input.fileBytes ?? null;
  const hasFile = Boolean(fileBytes?.byteLength);
  const mediaType: EnVocabMediaType =
    input.mediaType === "pdf" ? "pdf" : "image";

  if (hasFile && fileBytes && fileBytes.byteLength > EN_LESSON_UPLOAD_MAX_BYTES) {
    return { ok: false, error: "File too large (max 20MB)", status: 413 };
  }

  const result = await createEnLesson(env.DB, {
    kind,
    content,
    title,
    remarks,
    category,
    ref_key: hasFile ? null : refKey || null,
  });

  if (!result.ok) {
    const status = result.error === "content_duplicate" ? 409 : 400;
    return { ok: false, error: result.error, status };
  }

  let lesson = result.lesson;
  let assignedRefKey: string | null = lesson.ref_key;

  if (hasFile && fileBytes) {
    assignedRefKey = enLessonRefKey(lesson.id);
    const stored = await putEnVocabRefFile(
      env,
      assignedRefKey,
      mediaType,
      fileBytes
    );
    await saveEnVocabRefFileMeta(
      env.DB,
      assignedRefKey,
      title,
      mediaType,
      stored.r2_key
    );
    const updated = await updateEnLessonRefKey(env.DB, lesson.id, assignedRefKey);
    if (updated) lesson = updated;
  }

  return {
    ok: true,
    lesson,
    ref_key: assignedRefKey,
    ref_view_path: assignedRefKey
      ? `/api/en-vocab/ref/${assignedRefKey}`
      : null,
  };
}

/** 从 multipart FormData 解析建课字段（upload / create 共用） */
export async function parseEnLessonCreateFormData(
  form: FormData
): Promise<
  | { ok: true; input: EnLessonCreateWithFileInput }
  | { ok: false; error: string; status: number }
> {
  const kind: EnLessonKind =
    form.get("kind") === "grammar" ? "grammar" : "word";
  const content = String(form.get("content") || "").trim();
  const titleRaw = form.get("title");
  const title =
    typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : null;
  const remarksRaw = form.get("remarks");
  const remarks =
    typeof remarksRaw === "string" && remarksRaw.trim()
      ? remarksRaw.trim()
      : null;
  const catRaw = form.get("category");
  const category =
    typeof catRaw === "string" && catRaw.trim() ? catRaw.trim() : null;
  const refKey = normalizeEnVocabRefKey(String(form.get("ref_key") || ""));

  let fileBytes: ArrayBuffer | null = null;
  let mediaType: EnVocabMediaType = "image";

  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > EN_LESSON_UPLOAD_MAX_BYTES) {
      return {
        ok: false,
        error: "File too large (max 20MB)",
        status: 413,
      };
    }
    fileBytes = await file.arrayBuffer();
    const rawType = String(form.get("media_type") || "").trim().toLowerCase();
    mediaType =
      rawType === "pdf" || file.type === "application/pdf" ? "pdf" : "image";
  }

  return {
    ok: true,
    input: {
      kind,
      content,
      title,
      remarks,
      category,
      ref_key: refKey || null,
      fileBytes,
      mediaType,
    },
  };
}
