import { requireAdminOrUploadToken } from "@/lib/admin-or-upload-auth";
import { jsonResponse } from "@/lib/cloudflare-env";
import { lookupEnLessonTeacherReview } from "@/lib/en-lesson-teacher-telegram-lookup";

/**
 * Telegram / 外部：按姓名查英语老师评分与备注评价。
 * 鉴权：管理员 Cookie 或 Bearer JP_REVIEW_UPLOAD_TOKEN。
 *
 * GET ?name=欣欣
 * GET ?teacher_id=12（多候选选定后）
 */
export async function GET(request: Request) {
  try {
    const { env, allowed } = await requireAdminOrUploadToken(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "").trim();
    const teacherIdRaw = url.searchParams.get("teacher_id");
    const teacherId =
      teacherIdRaw != null && teacherIdRaw !== ""
        ? Number(teacherIdRaw)
        : null;

    const result = await lookupEnLessonTeacherReview(env.DB, name, teacherId);

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
