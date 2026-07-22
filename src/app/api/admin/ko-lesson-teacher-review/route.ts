import { requireAdmin } from "@/lib/admin-auth";
import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  deleteKoLessonTeacherReviewRecords,
  listKoLessonTeacherReviewSummaries,
  listKoLessonTeacherReviews,
  saveKoLessonTeacherReview,
} from "@/lib/ko-lesson-teacher-review-db";
import type { KoLessonTeacherReviewSortField } from "@/lib/types";

const SORT_FIELDS = new Set<KoLessonTeacherReviewSortField>([
  "class_date",
  "score",
  "updated_at",
]);

const ERROR_MSG: Record<string, Record<"en" | "zh", string>> = {
  teacher_id_invalid: {
    en: "Invalid teacher.",
    zh: "老师无效。",
  },
  score_invalid: {
    en: "Please select a score from 0 to 10.",
    zh: "请选择评分（0～10 分）。",
  },
  class_date_invalid: {
    en: "Please select a valid class date.",
    zh: "请选择上课日期。",
  },
  not_found: {
    en: "Record not found.",
    zh: "记录不存在。",
  },
  teacher_mismatch: {
    en: "This review belongs to another teacher.",
    zh: "该评价不属于当前老师。",
  },
  save_failed: {
    en: "Save failed.",
    zh: "保存失败。",
  },
  ids_required: {
    en: "No record IDs provided.",
    zh: "未提供要删除的记录 ID。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return ERROR_MSG[key]?.[locale] ?? ERROR_MSG[key]?.en ?? key;
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const url = new URL(request.url);
    if (url.searchParams.get("summary") === "1") {
      const summaries = await listKoLessonTeacherReviewSummaries(env.DB);
      return jsonResponse({ ok: true, summaries });
    }

    const teacherId = Number(url.searchParams.get("teacher_id"));
    if (!Number.isInteger(teacherId) || teacherId <= 0) {
      return jsonResponse({ ok: false, error: errMsg("teacher_id_invalid", locale) }, 400);
    }

    const sortRaw = url.searchParams.get("sort") || "updated_at";
    const orderRaw = url.searchParams.get("order") || "desc";
    const limitRaw = parseInt(url.searchParams.get("limit") || "500", 10);

    const sort = SORT_FIELDS.has(sortRaw as KoLessonTeacherReviewSortField)
      ? (sortRaw as KoLessonTeacherReviewSortField)
      : "updated_at";
    const order = orderRaw === "asc" ? "asc" : "desc";

    const data = await listKoLessonTeacherReviews(
      env.DB,
      teacherId,
      sort,
      order,
      Number.isFinite(limitRaw) ? limitRaw : 500
    );

    return jsonResponse({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message, data: [] }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  let body: {
    id?: number | string;
    teacher_id?: number | string;
    class_date?: string;
    score?: number | string;
    remark?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const rawId = body.id;
    let id = 0;
    if (rawId != null && rawId !== "") {
      const parsed = parseInt(String(rawId), 10);
      if (Number.isFinite(parsed) && parsed > 0) id = parsed;
    }

    const teacherId = Number(body.teacher_id);
    if (!Number.isInteger(teacherId) || teacherId <= 0) {
      return jsonResponse(
        { ok: false, error: errMsg("teacher_id_invalid", locale) },
        400
      );
    }

    const result = await saveKoLessonTeacherReview(env.DB, {
      id,
      teacher_id: teacherId,
      class_date: body.class_date ?? "",
      score: Number(body.score),
      remark: body.remark,
    });

    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: errMsg(result.error, locale) },
        400
      );
    }

    return jsonResponse({ ok: true, data: result.record });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function DELETE(request: Request) {
  const locale = localeFromRequest(request);

  let body: { ids?: number[] | string[] | string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  let ids: number[] = [];
  if (Array.isArray(body.ids)) {
    ids = body.ids
      .map((v) => parseInt(String(v), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  } else if (typeof body.ids === "string") {
    ids = body.ids
      .split(",")
      .map((v) => parseInt(v.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  if (!ids.length) {
    return jsonResponse({ ok: false, error: errMsg("ids_required", locale) }, 400);
  }

  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403);
    }

    const { deleted } = await deleteKoLessonTeacherReviewRecords(env.DB, ids);
    return jsonResponse({ ok: true, deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
