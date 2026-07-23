import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  requireEnLessonOperate,
  requireEnVocabAccess,
} from "@/lib/en-vocab-auth";
import { getOrUploadEnVocabRefByContent } from "@/lib/en-vocab-db";
import { enVocabRefApiPath } from "@/lib/en-vocab-ref-shared";
import type { EnVocabMediaType } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

const AUTH_MSG = {
  en: "Please log in to edit class notes.",
  zh: "请登录后再编辑课堂笔记。",
};

const ERROR_MSG: Record<string, { en: string; zh: string }> = {
  file_required: { en: "Image file is required.", zh: "请选择图片文件。" },
  file_too_large: {
    en: "File too large (max 20MB).",
    zh: "文件过大（最大 20MB）。",
  },
  empty_file: { en: "Empty file.", zh: "文件为空。" },
  use_multipart: {
    en: "Use multipart/form-data.",
    zh: "请使用 multipart/form-data 提交。",
  },
  image_only: {
    en: "Only image files are supported.",
    zh: "仅支持图片文件。",
  },
  ref_storage_unavailable: {
    en: "Image storage is unavailable. Please try again later.",
    zh: "图片存储暂不可用，请稍后再试。",
  },
};

function errorText(code: string, locale: "en" | "zh"): string {
  return ERROR_MSG[code]?.[locale] ?? code;
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const vocabAccess = await requireEnVocabAccess(request);
    const lessonAccess = await requireEnLessonOperate(request);
    if (!vocabAccess.allowed && !lessonAccess.allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }
    const { env } = vocabAccess;

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse(
        { ok: false, error: errorText("use_multipart", locale) },
        400
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return jsonResponse(
        { ok: false, error: errorText("file_required", locale) },
        400
      );
    }
    if (!file.type.startsWith("image/")) {
      return jsonResponse(
        { ok: false, error: errorText("image_only", locale) },
        400
      );
    }
    if (file.size > MAX_BYTES) {
      return jsonResponse(
        { ok: false, error: errorText("file_too_large", locale) },
        413
      );
    }

    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) {
      return jsonResponse(
        { ok: false, error: errorText("empty_file", locale) },
        400
      );
    }

    const mediaType: EnVocabMediaType = "image";
    const uploaded = await getOrUploadEnVocabRefByContent(
      env,
      env.DB,
      bytes,
      mediaType,
      null
    );

    return jsonResponse({
      ok: true,
      ref_key: uploaded.ref.ref_key,
      view_path: enVocabRefApiPath(uploaded.ref.ref_key, {
        v: uploaded.ref.updated_at,
      }),
      deduped: uploaded.deduped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("storage") || message.includes("R2")) {
      return jsonResponse(
        { ok: false, error: errorText("ref_storage_unavailable", locale) },
        503
      );
    }
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
