import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  createEnLessonWithOptionalFile,
  parseEnLessonCreateFormData,
} from "@/lib/en-lesson-create-with-file";
import { requireEnLessonOperate } from "@/lib/en-vocab-auth";
import type { EnLessonKind } from "@/lib/types";
import { normalizeEnVocabRefKey } from "@/lib/en-vocab-ref-shared";

const AUTH_MSG = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

/**
 * 网页「新增」英语新课：会话鉴权（en_lesson:operate），支持 multipart 传图。
 * 脚本/令牌上传仍用 POST /api/en-lesson/upload。
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireEnLessonOperate(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    let createInput;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const parsed = await parseEnLessonCreateFormData(form);
      if (!parsed.ok) {
        return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
      }
      createInput = parsed.input;
    } else {
      const body = (await request.json()) as {
        kind?: EnLessonKind;
        content?: string;
        meanings?: string | null;
        title?: string | null;
        remarks?: string | null;
        category?: string | null;
        ref_key?: string | null;
      };
      createInput = {
        kind: (body.kind === "grammar" ? "grammar" : "word") as EnLessonKind,
        content: String(body.content || "").trim(),
        meanings: (body.meanings || "").trim() || null,
        title: (body.title || "").trim() || null,
        remarks: (body.remarks || "").trim() || null,
        category: (body.category || "").trim() || null,
        ref_key: normalizeEnVocabRefKey(String(body.ref_key || "")) || null,
        fileBytes: null as ArrayBuffer | null,
        mediaType: "image" as const,
      };
    }

    const result = await createEnLessonWithOptionalFile(env, createInput);
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, result.status);
    }

    return jsonResponse({
      ok: true,
      lesson: result.lesson,
      ref_key: result.ref_key,
      ref_view_path: result.ref_view_path,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
