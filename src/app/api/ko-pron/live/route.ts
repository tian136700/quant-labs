import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  requireKoPronAccess,
  requireKoPronStudyAccess,
} from "@/lib/ko-pron-auth";
import {
  getKoPronStudyLivePayload,
  revealKoPronTeacherQuizLiveReading,
  setKoPronTeacherQuizLiveLetter,
} from "@/lib/ko-pron-db";
import { touchAuthUserActivityIpFromRequest } from "@/lib/etr-auth-db";

const STUDY_AUTH = {
  en: "Please log in to view today's pronunciation.",
  zh: "请登录后查看今日韩语发音。",
};

const TEACHER_AUTH = {
  en: "Please log in to sync the quiz card.",
  zh: "请登录后再同步抽查卡片。",
};

/** 学生端轮询当前老师抽查卡片 */
export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, allowed } = await requireKoPronStudyAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: STUDY_AUTH[locale] }, 401);
    }
    const payload = await getKoPronStudyLivePayload(env.DB);
    return jsonResponse(
      {
        ok: true,
        live: payload.live,
        letter: payload.student_letter,
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

/**
 * 老师端写入 live：
 * - action: set | clear → 打开/切换/关闭卡片
 * - action: reveal → 勾选熟悉程度后揭示罗马音
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, user, allowed } = await requireKoPronAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: TEACHER_AUTH[locale] }, 401);
    }

    const body = (await request.json()) as {
      action?: string;
      letter_id?: number | null;
    };
    const action = (body.action || "set").trim();

    if (action === "clear") {
      const live = await setKoPronTeacherQuizLiveLetter(env.DB, null);
      return jsonResponse({ ok: true, live });
    }

    if (action === "reveal") {
      const letterId = Number(body.letter_id);
      if (!Number.isFinite(letterId) || letterId < 1) {
        return jsonResponse(
          {
            ok: false,
            error: locale === "zh" ? "字母无效。" : "Invalid letter.",
          },
          400
        );
      }
      const live = await revealKoPronTeacherQuizLiveReading(env.DB, letterId);
      await touchAuthUserActivityIpFromRequest(env.DB, user, request);
      return jsonResponse({ ok: true, live });
    }

    const letterId =
      body.letter_id == null ? null : Number(body.letter_id);
    if (letterId != null && (!Number.isFinite(letterId) || letterId < 1)) {
      return jsonResponse(
        {
          ok: false,
          error: locale === "zh" ? "字母无效。" : "Invalid letter.",
        },
        400
      );
    }
    const live = await setKoPronTeacherQuizLiveLetter(
      env.DB,
      letterId == null ? null : letterId
    );
    if (letterId != null) {
      await touchAuthUserActivityIpFromRequest(env.DB, user, request);
    }
    return jsonResponse({ ok: true, live });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
