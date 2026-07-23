import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireAdmin } from "@/lib/admin-auth";
import { requireKoPronAccess, requireKoPronRead } from "@/lib/ko-pron-auth";
import {
  listKoPronBundle,
  recordKoPronReview,
  setKoPronDailyQuizTarget,
} from "@/lib/ko-pron-db";
import { trackKoPronTeacherQuizDayAfterReview } from "@/lib/ko-pron-teacher-quiz-day";
import type { KoPronLevel } from "@/lib/types";

const AUTH_MSG = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

const READ_AUTH_MSG = {
  en: "Please log in to view letters.",
  zh: "请登录后查看字母。",
};

const LEVELS: KoPronLevel[] = ["very", "normal", "weak"];

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, allowed } = await requireKoPronRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: READ_AUTH_MSG[locale] }, 401);
    }
    const bundle = await listKoPronBundle(env.DB);
    return jsonResponse({ ok: true, ...bundle });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, user, allowed } = await requireKoPronAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      action?: string;
      letter_id?: number;
      word_id?: number;
      level?: KoPronLevel;
      count?: number;
    };

    if (body.action === "set_daily_quiz_target") {
      const { isAdmin } = await requireAdmin(request);
      if (!isAdmin) {
        return jsonResponse(
          {
            ok: false,
            error:
              locale === "zh"
                ? "仅管理员可设置今日抽查数量。"
                : "Only admins can set the daily quiz target.",
          },
          403
        );
      }
      const count = Number(body.count);
      if (!Number.isFinite(count) || count < 1) {
        return jsonResponse(
          {
            ok: false,
            error: locale === "zh" ? "数量无效。" : "Invalid count.",
          },
          400
        );
      }
      try {
        const teacher_visible_limit = await setKoPronDailyQuizTarget(
          env.DB,
          count
        );
        return jsonResponse({ ok: true, teacher_visible_limit });
      } catch (targetErr) {
        const code =
          targetErr instanceof Error ? targetErr.message : String(targetErr);
        if (code === "empty_quiz_pool") {
          return jsonResponse(
            {
              ok: false,
              error:
                locale === "zh"
                  ? "抽问池为空。请先在「韩语发音勾选」勾选已背过的字母。"
                  : "Quiz pool is empty. Select letters on Korean Pronunciation Select first.",
            },
            400
          );
        }
        throw targetErr;
      }
    }

    const letterId = Number(body.letter_id ?? body.word_id);
    const level = body.level;
    if (!letterId || !level || !LEVELS.includes(level)) {
      return jsonResponse(
        {
          ok: false,
          error: locale === "zh" ? "参数无效。" : "Invalid parameters.",
        },
        400
      );
    }

    const result = await recordKoPronReview(env.DB, letterId, level);
    if (!result.ok) {
      if (result.error === "not_found") {
        return jsonResponse(
          {
            ok: false,
            error: locale === "zh" ? "字母不存在。" : "Letter not found.",
          },
          404
        );
      }
      if (result.error === "review_locked") {
        return jsonResponse(
          {
            ok: false,
            error:
              locale === "zh"
                ? "勾选已满 1 小时，无法再修改。"
                : "Review locked after 1 hour.",
            code: "review_locked",
          },
          400
        );
      }
      return jsonResponse(
        {
          ok: false,
          error: locale === "zh" ? "参数无效。" : "Invalid parameters.",
        },
        400
      );
    }
    const letter = result.letter;

    // 记录今日抽问操作人；抽完后定时任务按 +20min 自动禁用（失败不影响勾选结果）
    const { isAdmin: isAdminForReview } = await requireAdmin(request);
    if (user && !isAdminForReview) {
      try {
        await trackKoPronTeacherQuizDayAfterReview(env.DB, user);
      } catch (trackErr) {
        console.error(
          "[ko-pron] trackKoPronTeacherQuizDayAfterReview failed",
          trackErr
        );
      }
    }

    return jsonResponse({ ok: true, letter, word: letter });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
