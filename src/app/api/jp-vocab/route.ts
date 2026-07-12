import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  ensureJpVocabDailyDisplayOrder,
  ensureJpVocabTeacherVisibleLimit,
  getJpVocabAdminDailyReview,
  getJpVocabDailyQuizStyle,
  listJpVocabSharedTodayWordIds,
  listJpVocabWordsWithRefs,
  recordJpVocabAdminReviewNext,
  recordJpVocabReview,
  resetAllJpVocabReviews,
  resetTodayJpVocabRound,
  setJpVocabDailyQuizStyle,
  setJpVocabDailyQuizTarget,
} from "@/lib/jp-vocab-db";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";
import { requireAdmin } from "@/lib/admin-auth";
import { redactJpVocabMnemonicForClient, redactJpVocabWordsMnemonicForClient } from "@/lib/jp-vocab-mnemonic";
import { parseJpVocabTeacherVisibleReleaseCount } from "@/lib/jp-vocab-teacher-visible";
import {
  normalizeJpVocabDailyQuizStyle,
  type JpVocabDailyQuizStyle,
} from "@/lib/jp-vocab-daily-quiz-style";
import type { JpVocabLevel } from "@/lib/types";

const AUTH_MSG = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();
    const [{ words, refs }, daily_quiz_style, shared_today_word_ids] =
      await Promise.all([
      listJpVocabWordsWithRefs(env.DB),
      getJpVocabDailyQuizStyle(env.DB),
      listJpVocabSharedTodayWordIds(env.DB),
    ]);
    const display_order = await ensureJpVocabDailyDisplayOrder(env.DB, words);
    const teacher_visible_limit = await ensureJpVocabTeacherVisibleLimit(env.DB, {
      words,
      displayOrder: display_order,
    });
    const { isAdmin } = await requireAdmin(request);
    const admin_daily_review = isAdmin
      ? await getJpVocabAdminDailyReview(env.DB)
      : undefined;
    const clientWords = redactJpVocabWordsMnemonicForClient(words, isAdmin);
    return jsonResponse({
      ok: true,
      words: clientWords,
      refs,
      daily_quiz_style,
      display_order,
      shared_today_word_ids,
      teacher_visible_limit,
      ...(admin_daily_review ? { admin_daily_review } : {}),
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

    if (body.action === "admin_review_next") {
      const { isAdmin } = await requireAdmin(request);
      if (!isAdmin) {
        return jsonResponse({ ok: false, error: "forbidden" }, 403);
      }
      const wordId = Number(body.word_id);
      if (!Number.isFinite(wordId) || wordId <= 0) {
        return jsonResponse({ ok: false, error: "invalid word_id" }, 400);
      }
      const admin_daily_review = await recordJpVocabAdminReviewNext(
        env.DB,
        wordId
      );
      return jsonResponse({ ok: true, admin_daily_review });
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
      });
    }

    const wordId = Number(body.word_id);
    const level = body.level;

    if (!level || !["very", "normal", "weak"].includes(level)) {
      return jsonResponse({ ok: false, error: "level_invalid" }, 400);
    }

    const { isAdmin: isAdminForReview } = await requireAdmin(request);

    const result = await recordJpVocabReview(env.DB, wordId, level, {
      shareToStudy: true,
      sharedBy: user?.username ?? "",
    });

    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
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
