import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  getEnLessonById,
  syncEnLessonTitleByRefKey,
  updateEnLessonRefKey,
} from "@/lib/en-lesson-db";
import { parseLessonContent } from "@/lib/en-lesson-shared";
import { requireEnVocabAccess } from "@/lib/en-vocab-auth";
import {
  saveEnVocabRefFileMeta,
  updateEnVocabWordsRefKey,
} from "@/lib/en-vocab-db";
import { putEnVocabRefFile } from "@/lib/en-vocab-ref-server";
import { enLessonRefKey } from "@/lib/en-vocab-ref-shared";
import type { EnVocabMediaType } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

const AUTH_MSG = {
  en: "Please log in to edit lesson plans.",
  zh: "请登录后再编辑教案。",
};

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireEnVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse(
        { ok: false, error: "Use multipart/form-data with lesson_id and file" },
        400
      );
    }

    const form = await request.formData();
    const lessonId = Number(form.get("lesson_id"));
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return jsonResponse({ ok: false, error: "lesson_id_invalid" }, 400);
    }

    const lesson = await getEnLessonById(env.DB, lessonId);
    if (!lesson) {
      return jsonResponse({ ok: false, error: "lesson_not_found" }, 404);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonResponse({ ok: false, error: "file_required" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonResponse({ ok: false, error: "file_too_large" }, 413);
    }

    const rawType = String(form.get("media_type") || "").trim().toLowerCase();
    const mediaType: EnVocabMediaType =
      rawType === "pdf" || file.type === "application/pdf" ? "pdf" : "image";

    const titleRaw = form.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim()
        ? titleRaw.trim()
        : lesson.title;

    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) {
      return jsonResponse({ ok: false, error: "empty_file" }, 400);
    }

    const targetRefKey = enLessonRefKey(lessonId);
    const oldRefKey = lesson.ref_key;

    const stored = await putEnVocabRefFile(env, targetRefKey, mediaType, bytes);
    const ref = await saveEnVocabRefFileMeta(
      env.DB,
      targetRefKey,
      title,
      mediaType,
      stored.r2_key
    );

    let updatedLesson = lesson;
    if (oldRefKey !== targetRefKey) {
      const next = await updateEnLessonRefKey(env.DB, lessonId, targetRefKey);
      if (!next) {
        return jsonResponse({ ok: false, error: "update_failed" }, 500);
      }
      updatedLesson = next;

      if (lesson.completed && oldRefKey) {
        const items = parseLessonContent(lesson.content);
        // EnLessonKind = word|grammar，与 EnVocabKind 一致（勿 alias 成含 word_grammar 的 JpLessonKind）
        await updateEnVocabWordsRefKey(
          env.DB,
          items,
          lesson.kind,
          oldRefKey,
          targetRefKey
        );
      }
    } else if (title !== lesson.title) {
      await syncEnLessonTitleByRefKey(env.DB, targetRefKey, title);
      updatedLesson = { ...updatedLesson, title, updated_at: ref.updated_at };
    }

    return jsonResponse({
      ok: true,
      ref,
      lesson: updatedLesson,
      storage: stored.storage,
      view_path: `/api/en-vocab/ref/${targetRefKey}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
