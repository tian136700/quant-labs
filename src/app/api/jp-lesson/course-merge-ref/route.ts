import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireJpLessonOperate } from "@/lib/jp-lesson-auth";
import { saveJpVocabRefFileMeta } from "@/lib/jp-vocab-db";
import { putJpVocabRefFile } from "@/lib/jp-vocab-ref-server";
import {
  jpLessonCourseMergeRefKey,
  jpVocabRefViewerPath,
} from "@/lib/jp-vocab-ref-shared";

const MAX_BYTES = 20 * 1024 * 1024;

const AUTH_MSG = {
  en: "Please log in to save merged lesson plans.",
  zh: "请登录后再保存整课合并教案。",
};

/**
 * 同一课（course_group_id）合并分页 PDF 入库。
 * ref_key 稳定为 course-{groupId}，幂等覆盖。
 */
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
        {
          ok: false,
          error: "Use multipart/form-data with course_group_id and file",
        },
        400
      );
    }

    const form = await request.formData();
    const courseGroupId = String(form.get("course_group_id") || "").trim();
    if (!courseGroupId) {
      return jsonResponse({ ok: false, error: "course_group_id_required" }, 400);
    }

    const courseLabelRaw = form.get("course_label");
    const courseLabel =
      typeof courseLabelRaw === "string" && courseLabelRaw.trim()
        ? courseLabelRaw.trim()
        : courseGroupId;

    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonResponse({ ok: false, error: "file_required" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonResponse({ ok: false, error: "file_too_large" }, 413);
    }

    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) {
      return jsonResponse({ ok: false, error: "empty_file" }, 400);
    }

    const isPdf =
      file.type === "application/pdf" ||
      String(file.name || "").toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return jsonResponse({ ok: false, error: "pdf_required" }, 400);
    }

    const refKey = jpLessonCourseMergeRefKey(courseGroupId);
    const stored = await putJpVocabRefFile(env, refKey, "pdf", bytes);
    const ref = await saveJpVocabRefFileMeta(
      env.DB,
      refKey,
      courseLabel,
      "pdf",
      stored.r2_key
    );

    const refViewPath = jpVocabRefViewerPath(ref.ref_key, ref.updated_at);

    return jsonResponse({
      ok: true,
      ref_key: ref.ref_key,
      ref,
      ref_view_path: refViewPath,
      storage: stored.storage,
      course_group_id: courseGroupId,
      course_label: courseLabel,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
