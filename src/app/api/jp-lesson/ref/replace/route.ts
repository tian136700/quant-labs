import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  getJpLessonById,
  syncJpLessonTitleByRefKey,
  updateJpLessonRefKey,
} from "@/lib/jp-lesson-db";
import { parseLessonContent } from "@/lib/jp-lesson-shared";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";
import {
  saveJpVocabRefFileMeta,
  updateJpVocabWordsRefKey,
} from "@/lib/jp-vocab-db";
import { putJpVocabRefFile } from "@/lib/jp-vocab-ref-server";
import { jpLessonRefKey } from "@/lib/jp-vocab-ref-shared";
import type { JpVocabMediaType } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

const AUTH_MSG = {
  en: "Please log in to edit lesson plans.",
  zh: "请登录后再编辑教案。",
};

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabAccess(request);
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

    const lesson = await getJpLessonById(env.DB, lessonId);
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
    const mediaType: JpVocabMediaType =
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

    const targetRefKey = jpLessonRefKey(lessonId);
    const oldRefKey = lesson.ref_key;

    const stored = await putJpVocabRefFile(env, targetRefKey, mediaType, bytes);
    const ref = await saveJpVocabRefFileMeta(
      env.DB,
      targetRefKey,
      title,
      mediaType,
      stored.r2_key
    );

    let updatedLesson = lesson;
    if (oldRefKey !== targetRefKey) {
      const next = await updateJpLessonRefKey(env.DB, lessonId, targetRefKey);
      if (!next) {
        return jsonResponse({ ok: false, error: "update_failed" }, 500);
      }
      updatedLesson = next;

      if (lesson.completed && oldRefKey) {
        const items = parseLessonContent(lesson.content);
        await updateJpVocabWordsRefKey(
          env.DB,
          items,
          lesson.kind,
          oldRefKey,
          targetRefKey
        );
      }
    } else if (title !== lesson.title) {
      await syncJpLessonTitleByRefKey(env.DB, targetRefKey, title);
      updatedLesson = { ...updatedLesson, title, updated_at: ref.updated_at };
    }

    return jsonResponse({
      ok: true,
      ref,
      lesson: updatedLesson,
      storage: stored.storage,
      view_path: `/api/jp-vocab/ref/${targetRefKey}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
