import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  createJpVocabShareRequest,
  dismissJpVocabShareRequests,
  listJpVocabPendingShareRequests,
} from "@/lib/jp-vocab-db";
import {
  requireJpVocabShareRequestCreate,
  requireJpVocabShareRequestTeacher,
} from "@/lib/jp-vocab-auth";

const AUTH_MSG = {
  en: "Please log in first.",
  zh: "请先登录。",
};

const PERM_MSG = {
  en: "You do not have permission to request words.",
  zh: "当前账号无权请求老师发送单词。",
};

const TEACHER_AUTH_MSG = {
  en: "Please log in as a teacher.",
  zh: "请使用老师账号登录。",
};

const TEACHER_PERM_MSG = {
  en: "Only admin or Japanese teachers can view requests.",
  zh: "仅管理员或日语老师可查看学生请求。",
};

const FREQUENT_MSG = {
  en: "Please wait a moment before requesting again.",
  zh: "请稍后再试，避免重复请求。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabShareRequestTeacher(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: user ? TEACHER_PERM_MSG[locale] : TEACHER_AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    const items = await listJpVocabPendingShareRequests(env.DB);
    return jsonResponse({ ok: true, items }, 200, { "Cache-Control": "no-store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabShareRequestCreate(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: user ? PERM_MSG[locale] : AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    const result = await createJpVocabShareRequest(env.DB, user.username);
    if (!result.ok) {
      const status = result.error === "too_frequent" ? 429 : 400;
      const error =
        result.error === "too_frequent" ? FREQUENT_MSG[locale] : result.error;
      return jsonResponse({ ok: false, error }, status);
    }

    return jsonResponse({
      ok: true,
      item: result.item,
      created: result.created,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function PATCH(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabShareRequestTeacher(request);
    if (!allowed || !user) {
      return jsonResponse(
        { ok: false, error: user ? TEACHER_PERM_MSG[locale] : TEACHER_AUTH_MSG[locale] },
        user ? 403 : 401
      );
    }

    let requestIds: number[] | undefined;
    try {
      const body = (await request.json()) as { request_ids?: unknown };
      if (Array.isArray(body.request_ids)) {
        requestIds = body.request_ids
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0);
      }
    } catch {
      /* empty body = dismiss all pending */
    }

    const result = await dismissJpVocabShareRequests(
      env.DB,
      user.username,
      requestIds?.length ? requestIds : undefined
    );
    return jsonResponse({ ok: true, dismissed: result.dismissed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
