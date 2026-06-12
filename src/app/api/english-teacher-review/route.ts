import { getSessionUser } from "@/lib/etr-auth-db";
import { parseSessionCookie } from "@/lib/etr-auth";
import {
  getCloudflareEnv,
  jsonResponse,
  localeFromRequest,
} from "@/lib/cloudflare-env";
import {
  deleteEnglishTeacherReviewRecords,
  listEnglishTeacherReviewHistory,
  saveEnglishTeacherReview,
} from "@/lib/english-teacher-review-db";
import type { EnglishTeacherReviewSortField } from "@/lib/types";

const SORT_FIELDS = new Set<EnglishTeacherReviewSortField>([
  "teacher_name",
  "class_date",
  "score",
  "updated_at",
]);

const ERROR_MSG: Record<string, Record<"en" | "zh", string>> = {
  teacher_name_required: {
    en: "Please enter the teacher's name.",
    zh: "请输入英语老师姓名。",
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
  save_failed: {
    en: "Save failed.",
    zh: "保存失败。",
  },
  ids_required: {
    en: "No record IDs provided.",
    zh: "未提供要删除的记录 ID。",
  },
  auth_required: {
    en: "Please log in or register first.",
    zh: "请先登录或注册。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return ERROR_MSG[key]?.[locale] ?? ERROR_MSG[key]?.en ?? key;
}

async function requireAuth(request: Request) {
  const env = await getCloudflareEnv();
  const token = parseSessionCookie(request.headers.get("cookie"));
  const user = await getSessionUser(env, token);
  return { env, user };
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user } = await requireAuth(request);
    if (!user) {
      return jsonResponse(
        { ok: false, error: errMsg("auth_required", locale), auth_required: true },
        401
      );
    }

    const url = new URL(request.url);
    const sortRaw = url.searchParams.get("sort") || "updated_at";
    const orderRaw = url.searchParams.get("order") || "desc";
    const limitRaw = parseInt(url.searchParams.get("limit") || "2000", 10);

    const sort = SORT_FIELDS.has(sortRaw as EnglishTeacherReviewSortField)
      ? (sortRaw as EnglishTeacherReviewSortField)
      : "updated_at";
    const order = orderRaw === "asc" ? "asc" : "desc";

    const data = await listEnglishTeacherReviewHistory(
      env.DB,
      sort,
      order,
      Number.isFinite(limitRaw) ? limitRaw : 2000
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
    teacher_name?: string;
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
    const { env, user } = await requireAuth(request);
    if (!user) {
      return jsonResponse(
        { ok: false, error: errMsg("auth_required", locale), auth_required: true },
        401
      );
    }

    const rawId = body.id;
    let id = 0;
    if (rawId != null && rawId !== "") {
      const parsed = parseInt(String(rawId), 10);
      if (Number.isFinite(parsed) && parsed > 0) id = parsed;
    }

    const result = await saveEnglishTeacherReview(env.DB, {
      id,
      teacher_name: body.teacher_name ?? "",
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
    const { env, user } = await requireAuth(request);
    if (!user) {
      return jsonResponse(
        { ok: false, error: errMsg("auth_required", locale), auth_required: true },
        401
      );
    }

    const { deleted } = await deleteEnglishTeacherReviewRecords(env.DB, ids);
    return jsonResponse({ ok: true, deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
