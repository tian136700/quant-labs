/**
 * 英语新课建课 + 可选教案文件（upload 令牌接口与网页 create 共用）。
 *
 * 带教案 multipart 时：先轻量 D1 建课，再把 File/Blob 交给 R2（禁止先 arrayBuffer
 * 再扫全表 content 去重——同请求易 Error 1102）。
 */
import { createEnLesson, updateEnLessonRefKey } from "@/lib/en-lesson-db";
import { normalizeEnVocabCategory } from "@/lib/en-vocab-category";
import { saveEnVocabRefFileMeta } from "@/lib/en-vocab-db";
import {
  putEnVocabRefFile,
  type EnVocabRefFileBody,
} from "@/lib/en-vocab-ref-server";
import { enLessonRefKey, normalizeEnVocabRefKey } from "@/lib/en-vocab-ref-shared";
import type { CloudflareEnv, EnLessonKind, EnLessonRecord, EnVocabMediaType } from "@/lib/types";

export const EN_LESSON_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export type EnLessonCreateWithFileInput = {
  kind: EnLessonKind;
  content: string;
  /** 与 content 项对齐的释义，多项用 | 分隔 */
  meanings?: string | null;
  title?: string | null;
  category?: string | null;
  /** 课次备注（如语法说明） */
  remarks?: string | null;
  /** 无 file 时可绑定已有教案 key */
  ref_key?: string | null;
  /**
   * 教案正文：优先传 File/Blob（R2 可直接 put，少一份内存拷贝）。
   * ArrayBuffer 仍兼容 JSON/脚本路径。
   */
  fileBody?: EnVocabRefFileBody | null;
  /** @deprecated 用 fileBody；保留兼容旧调用 */
  fileBytes?: ArrayBuffer | null;
  mediaType?: EnVocabMediaType;
  /** 有 file 时的字节数（File.size / byteLength），用于限流 */
  fileSize?: number | null;
};

export type EnLessonCreateWithFileResult =
  | {
      ok: true;
      lesson: EnLessonRecord;
      ref_key: string | null;
      ref_view_path: string | null;
    }
  | { ok: false; error: string; status: number };

function resolveFileBody(
  input: EnLessonCreateWithFileInput
): { body: EnVocabRefFileBody | null; size: number } {
  if (input.fileBody != null) {
    const body = input.fileBody;
    if (typeof Blob !== "undefined" && body instanceof Blob) {
      return { body, size: body.size };
    }
    if (body instanceof ArrayBuffer) {
      return { body, size: body.byteLength };
    }
    if (body instanceof Uint8Array) {
      return { body, size: body.byteLength };
    }
    const hinted = input.fileSize;
    return {
      body,
      size:
        typeof hinted === "number" && Number.isFinite(hinted) && hinted > 0
          ? hinted
          : 1,
    };
  }
  const bytes = input.fileBytes ?? null;
  if (bytes && bytes.byteLength > 0) {
    return { body: bytes, size: bytes.byteLength };
  }
  return { body: null, size: 0 };
}

export async function createEnLessonWithOptionalFile(
  env: CloudflareEnv,
  input: EnLessonCreateWithFileInput
): Promise<EnLessonCreateWithFileResult> {
  const content = String(input.content || "").trim();
  if (!content) {
    return { ok: false, error: "content_required", status: 400 };
  }

  const kind: EnLessonKind = input.kind === "grammar" ? "grammar" : "word";
  const meanings = (input.meanings || "").trim() || null;
  const title = (input.title || "").trim() || null;
  const remarks = (input.remarks || "").trim() || null;
  const category = normalizeEnVocabCategory(input.category);
  const refKey = normalizeEnVocabRefKey(String(input.ref_key || ""));
  const { body: fileBody, size: fileSize } = resolveFileBody(input);
  const hasFile = Boolean(fileBody && fileSize > 0);
  const mediaType: EnVocabMediaType =
    input.mediaType === "pdf" ? "pdf" : "image";

  if (hasFile && fileSize > EN_LESSON_UPLOAD_MAX_BYTES) {
    return { ok: false, error: "File too large (max 20MB)", status: 413 };
  }

  // 先 D1 建课（轻量），再 put R2——避免大文件驻留时还扫库
  const result = await createEnLesson(env.DB, {
    kind,
    content,
    meanings,
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

  if (hasFile && fileBody) {
    assignedRefKey = enLessonRefKey(lesson.id);
    const stored = await putEnVocabRefFile(
      env,
      assignedRefKey,
      mediaType,
      fileBody
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
  const meaningsRaw = form.get("meanings");
  const meanings =
    typeof meaningsRaw === "string" && meaningsRaw.trim()
      ? meaningsRaw.trim()
      : null;
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

  let fileBody: EnVocabRefFileBody | null = null;
  let fileSize: number | null = null;
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
    // 保留 File，交 R2.put；禁止此处 arrayBuffer（与建课同请求双份内存 → 1102）
    fileBody = file;
    fileSize = file.size;
    const rawType = String(form.get("media_type") || "").trim().toLowerCase();
    mediaType =
      rawType === "pdf" || file.type === "application/pdf" ? "pdf" : "image";
  }

  return {
    ok: true,
    input: {
      kind,
      content,
      meanings,
      title,
      remarks,
      category,
      ref_key: refKey || null,
      fileBody,
      fileSize,
      mediaType,
    },
  };
}
