import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { getJpLessonById } from "@/lib/jp-lesson-db";
import { requireJpLessonOperate } from "@/lib/jp-lesson-auth";
import {
  JP_LESSON_REF_ATTACH_MAX_BYTES,
  attachJpLessonRefFile,
} from "@/lib/jp-lesson-ref-attach";
import type { JpVocabMediaType } from "@/lib/types";

const AUTH_MSG = {
  en: "Please log in to edit lesson plans.",
  zh: "请登录后再编辑教案。",
};

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpLessonOperate(request);
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
    if (file.size > JP_LESSON_REF_ATTACH_MAX_BYTES) {
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
    const result = await attachJpLessonRefFile(env, lesson, bytes, {
      mediaType,
      title,
    });
    if (!result.ok) {
      const status = result.error === "empty_file" ? 400 : 500;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({
      ok: true,
      ref: result.ref,
      lesson: result.lesson,
      storage: result.storage,
      view_path: result.view_path,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
