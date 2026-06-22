import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  addJpVocabWord,
  getJpVocabRef,
  getOrUploadJpVocabRefByContent,
} from "@/lib/jp-vocab-db";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";
import { normalizeJpVocabRefKey } from "@/lib/jp-vocab-ref-shared";
import type { JpVocabKind, JpVocabMediaType } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

const AUTH_MSG = {
  en: "Please log in to add entries.",
  zh: "请登录后再添加。",
};

const ERROR_MSG: Record<string, { en: string; zh: string }> = {
  word_required: { en: "Word is required.", zh: "请填写单词或语法。" },
  word_duplicate: { en: "This entry already exists.", zh: "该词条已存在。" },
  file_too_large: {
    en: "File too large (max 20MB).",
    zh: "文件过大（最大 20MB）。",
  },
  empty_file: { en: "Empty file.", zh: "文件为空。" },
  use_multipart: {
    en: "Use multipart/form-data.",
    zh: "请使用 multipart/form-data 提交。",
  },
};

function errorText(code: string, locale: "en" | "zh"): string {
  return ERROR_MSG[code]?.[locale] ?? code;
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireJpVocabAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse(
        { ok: false, error: errorText("use_multipart", locale) },
        400
      );
    }

    const form = await request.formData();
    const word = String(form.get("word") || "").trim();
    const readingRaw = form.get("reading");
    const reading =
      typeof readingRaw === "string" && readingRaw.trim()
        ? readingRaw.trim()
        : null;
    const meaningRaw = form.get("meaning");
    const meaning =
      typeof meaningRaw === "string" && meaningRaw.trim()
        ? meaningRaw.trim()
        : null;
    const kind: JpVocabKind =
      form.get("kind") === "grammar" ? "grammar" : "word";

    const refTitleRaw = form.get("ref_title");
    const refTitle =
      typeof refTitleRaw === "string" && refTitleRaw.trim()
        ? refTitleRaw.trim()
        : null;

    const existingRefKey = normalizeJpVocabRefKey(
      String(form.get("ref_key") || "")
    );

    let refKey: string | null = existingRefKey || null;
    let refDeduped = false;

    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
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

      const rawType = String(form.get("media_type") || "").trim().toLowerCase();
      const mediaType: JpVocabMediaType =
        rawType === "pdf" || file.type === "application/pdf" ? "pdf" : "image";

      const uploaded = await getOrUploadJpVocabRefByContent(
        env,
        env.DB,
        bytes,
        mediaType,
        refTitle
      );
      refKey = uploaded.ref.ref_key;
      refDeduped = uploaded.deduped;
    } else if (refKey) {
      const existing = await getJpVocabRef(env.DB, refKey);
      if (!existing) {
        return jsonResponse(
          { ok: false, error: locale === "zh" ? "教案链接无效" : "Invalid ref_key" },
          400
        );
      }
      refDeduped = true;
    }

    const result = await addJpVocabWord(env.DB, {
      word,
      reading,
      meaning,
      kind,
      ref_key: refKey,
    });

    if (!result.ok) {
      const status = result.error === "word_duplicate" ? 409 : 400;
      return jsonResponse(
        { ok: false, error: errorText(result.error, locale) },
        status
      );
    }

    return jsonResponse({
      ok: true,
      word: result.word,
      ref_key: refKey,
      ref_deduped: refDeduped,
      ref_view_path: refKey ? `/api/jp-vocab/ref/${refKey}` : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
