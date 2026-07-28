import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  boostJpVocabQuizPriority,
  ensureJpVocabDailyDisplayOrder,
  ensureJpVocabTeacherVisibleLimit,
  getJpVocabDailyQuizStyle,
  getJpVocabQuizPriorityBoost,
  getJpVocabQuizTimeWeight,
  listJpVocabSharedTodayWordIds,
  listJpVocabWordsWithRefs,
  recordJpVocabReview,
  resetAllJpVocabReviews,
  resetTodayJpVocabRound,
  setJpVocabDailyQuizStyle,
  setJpVocabDailyQuizTarget,
} from "@/lib/jp-vocab-db";
import { requireJpVocabAccess, requireJpVocabRead } from "@/lib/jp-vocab-auth";
import { requireAdmin } from "@/lib/admin-auth";
import { redactJpVocabMnemonicForClient, redactJpVocabWordsMnemonicForClient } from "@/lib/jp-vocab-mnemonic";
import { parseJpVocabTeacherVisibleReleaseCount } from "@/lib/jp-vocab-teacher-visible";
import {
  normalizeJpVocabDailyQuizStyle,
  type JpVocabDailyQuizStyle,
} from "@/lib/jp-vocab-daily-quiz-style";
import { trackJpVocabTeacherQuizDayAfterReview } from "@/lib/jp-vocab-teacher-quiz-day";
import { JP_VOCAB_TEACHER_SHARE_ENABLED } from "@/lib/jp-vocab-share-ui";
import type { JpVocabLevel } from "@/lib/types";

const AUTH_MSG = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

const READ_AUTH_MSG = {
  en: "Please log in to view vocabulary.",
  zh: "请登录后查看单词。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireJpVocabRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: READ_AUTH_MSG[locale] }, 401);
    }

    const [{ words, refs }, daily_quiz_style, shared_today_word_ids, quiz_time_weight] =
      await Promise.all([
      listJpVocabWordsWithRefs(env.DB),
      getJpVocabDailyQuizStyle(env.DB),
      listJpVocabSharedTodayWordIds(env.DB),
      getJpVocabQuizTimeWeight(env.DB),
    ]);
    const display_order = await ensureJpVocabDailyDisplayOrder(env.DB, words);
    const teacher_visible_limit = await ensureJpVocabTeacherVisibleLimit(env.DB, {
      words,
      displayOrder: display_order,
    });
    const { isAdmin } = await requireAdmin(request);
    const quiz_priority_boost = isAdmin
      ? await getJpVocabQuizPriorityBoost(env.DB)
      : null;
    const clientWords = redactJpVocabWordsMnemonicForClient(words, isAdmin);
    return jsonResponse({
      ok: true,
      words: clientWords,
      refs,
      daily_quiz_style,
      quiz_time_weight,
      display_order,
      shared_today_word_ids,
      teacher_visible_limit,
      ...(quiz_priority_boost ? { quiz_priority_boost } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      action?: string;
      word_id?: number;
      level?: JpVocabLevel;
      daily_quiz_style?: Partial<JpVocabDailyQuizStyle>;
      count?: number;
      hide_checked_today?: boolean;
    };

    if (body.action === "daily_quiz_style") {
      const { isAdmin } = await requireAdmin(request);
      if (!isAdmin) {
        return jsonResponse({ ok: false, error: "forbidden" }, 403);
      }
      const daily_quiz_style = await setJpVocabDailyQuizStyle(
        env.DB,
        normalizeJpVocabDailyQuizStyle(body.daily_quiz_style)
      );
      return jsonResponse({ ok: true, daily_quiz_style });
    }

    if (body.action === "set_daily_quiz_target") {
      const { isAdmin } = await requireAdmin(request);
      if (!isAdmin) {
        return jsonResponse({ ok: false, error: "forbidden" }, 403);
      }
      const targetCount = parseJpVocabTeacherVisibleReleaseCount(body.count);
      if (targetCount == null) {
        return jsonResponse({ ok: false, error: "invalid count" }, 400);
      }
      const hideCheckedToday = false;
      const teacher_visible_limit = await setJpVocabDailyQuizTarget(
        env.DB,
        targetCount,
        hideCheckedToday
      );
      return jsonResponse({ ok: true, teacher_visible_limit });
    }

    if (body.action === "reset") {
      const result = await resetAllJpVocabReviews(env.DB);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, 400);
      }
      return jsonResponse({
        ok: true,
        words: result.words,
        display_order: result.display_order,
        teacher_visible_limit: result.teacher_visible_limit,
        // 重置已清共享；显式回空，避免客户端缓存仍显示「已共享」
        shared_today_word_ids: [] as number[],
      });
    }

    if (body.action === "reset_today") {
      const result = await resetTodayJpVocabRound(env.DB);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, 400);
      }
      return jsonResponse({
        ok: true,
        words: result.words,
        display_order: result.display_order,
        teacher_visible_limit: result.teacher_visible_limit,
        shared_today_word_ids: [] as number[],
      });
    }

    if (body.action === "boost_quiz_priority") {
      const { isAdmin } = await requireAdmin(request);
      if (!isAdmin) {
        return jsonResponse({ ok: false, error: "forbidden" }, 403);
      }
      const wordId = Number(body.word_id);
      if (!Number.isInteger(wordId) || wordId <= 0) {
        return jsonResponse({ ok: false, error: "invalid word_id" }, 400);
      }
      const result = await boostJpVocabQuizPriority(env.DB, wordId);
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }
      return jsonResponse({
        ok: true,
        quiz_priority_boost: result.quiz_priority_boost,
      });
    }

    const wordId = Number(body.word_id);
    const level = body.level;

    if (!level || !["very", "normal", "weak"].includes(level)) {
      return jsonResponse({ ok: false, error: "level_invalid" }, 400);
    }

    const { isAdmin: isAdminForReview } = await requireAdmin(request);

    const result = await recordJpVocabReview(env.DB, wordId, level, {
      shareToStudy: JP_VOCAB_TEACHER_SHARE_ENABLED,
      sharedBy: user?.username ?? "",
    });

    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    // 记录今日抽问操作人；抽完后定时任务按 1h/带读 2h 自动禁用（失败不影响勾选结果）
    if (user && !isAdminForReview) {
      try {
        await trackJpVocabTeacherQuizDayAfterReview(env.DB, user);
      } catch (trackErr) {
        console.error(
          "[jp-vocab] trackJpVocabTeacherQuizDayAfterReview failed",
          trackErr
        );
      }
    }

    return jsonResponse({
      ok: true,
      word: redactJpVocabMnemonicForClient(result.word, isAdminForReview),
      shared: result.shared,
      shared_new: result.shared_new,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "no_release_candidates") {
      return jsonResponse({ ok: false, error: "没有可展示的词条" }, 400);
    }
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
