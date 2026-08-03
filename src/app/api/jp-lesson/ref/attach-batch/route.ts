import { requireAdmin } from "@/lib/admin-auth";
import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { getJpLessonById } from "@/lib/jp-lesson-db";
import {
  JP_LESSON_REF_ATTACH_MAX_BYTES,
  attachJpLessonRefFile,
  parseJpLessonAttachBatchIds,
} from "@/lib/jp-lesson-ref-attach";
import type { JpVocabMediaType, JpVocabRef } from "@/lib/types";

const AUTH_MSG = {
  en: "Admin only.",
  zh: "仅管理员可将教案挂到勾选课程。",
};

/**
 * 勾选多条未完成课 → 同一张教案图写入各课 lesson-{id}。
 * POST multipart: file + lesson_ids（JSON 数组）
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, isAdmin } = await requireAdmin(request);
    if (!user || !isAdmin) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse(
        {
          ok: false,
          error: "Use multipart/form-data with lesson_ids and file",
        },
        400
      );
    }

    const form = await request.formData();
    const idsParsed = parseJpLessonAttachBatchIds(form);
    if (!idsParsed.ok) {
      return jsonResponse({ ok: false, error: idsParsed.error }, 400);
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
      typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : null;

    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) {
      return jsonResponse({ ok: false, error: "empty_file" }, 400);
    }

    const lessons = [];
    const refs: Record<string, JpVocabRef> = {};
    let storage: string | null = null;

    for (const lessonId of idsParsed.ids) {
      const lesson = await getJpLessonById(env.DB, lessonId);
      if (!lesson) {
        return jsonResponse(
          { ok: false, error: "lesson_not_found", lesson_id: lessonId },
          404
        );
      }
      const result = await attachJpLessonRefFile(env, lesson, bytes, {
        mediaType,
        title: title ?? lesson.title,
      });
      if (!result.ok) {
        return jsonResponse(
          {
            ok: false,
            error: result.error,
            lesson_id: lessonId,
          },
          500
        );
      }
      lessons.push(result.lesson);
      refs[result.ref_key] = result.ref;
      storage = result.storage;
    }

    return jsonResponse({
      ok: true,
      lessons,
      refs,
      storage,
      lesson_ids: idsParsed.ids,
      count: lessons.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
