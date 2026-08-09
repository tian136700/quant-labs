import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  ensureEnVocabDailyDisplayOrder,
  ensureEnVocabTeacherVisibleLimit,
  getEnVocabDailyQuizStyle,
  getEnVocabWordByIdLite,
  listEnVocabSharedTodayWordIds,
  listEnVocabWordsWithRefs,
  recordEnVocabReview,
  recordEnVocabReviewWithUsageLevels,
  resetAllEnVocabReviews,
  resetTodayEnVocabRound,
  setEnVocabDailyQuizStyle,
  setEnVocabDailyQuizTarget,
} from "@/lib/en-vocab-db";
import { requireEnVocabAccess, requireEnVocabRead } from "@/lib/en-vocab-auth";
import { requireAdmin } from "@/lib/admin-auth";
import { redactJpVocabWordsMnemonicForClient } from "@/lib/jp-vocab-mnemonic";
import {
  normalizeEnVocabDailyQuizStyle,
  type EnVocabDailyQuizStyle,
} from "@/lib/en-vocab-daily-quiz-style";
import { isEnVocabLevel } from "@/lib/en-vocab-review";
import { trackEnVocabTeacherQuizDayAfterReview } from "@/lib/en-vocab-teacher-quiz-day";
import type { EnVocabLevel } from "@/lib/types";

const AUTH_MSG = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

const READ_AUTH_MSG = {
  en: "Please log in to view English vocabulary.",
  zh: "请登录后查看英语抽背。",
};

function parseEnVocabDailyQuizTargetCount(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const count = Math.floor(n);
  if (count < 1 || count > 999) return null;
  return count;
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireEnVocabRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: READ_AUTH_MSG[locale] }, 401);
    }
    const { isAdmin } = await requireAdmin(request);

    const wordIdRaw = new URL(request.url).searchParams.get("word_id");
    if (wordIdRaw != null && wordIdRaw.trim() !== "") {
      const wordId = Number(wordIdRaw);
      if (!Number.isInteger(wordId) || wordId <= 0) {
        return jsonResponse({ ok: false, error: "word_id_invalid" }, 400);
      }
      const word = await getEnVocabWordByIdLite(env.DB, wordId);
      if (!word) {
        return jsonResponse({ ok: false, error: "not_found" }, 404);
      }
      const [redacted] = redactJpVocabWordsMnemonicForClient([word], isAdmin);
      return jsonResponse({ ok: true, word: redacted });
    }

    const [{ words, refs }, daily_quiz_style, shared_today_word_ids] =
      await Promise.all([
        listEnVocabWordsWithRefs(env.DB),
        getEnVocabDailyQuizStyle(env.DB),
        listEnVocabSharedTodayWordIds(env.DB),
      ]);
    const display_order = await ensureEnVocabDailyDisplayOrder(env.DB, words);
    const teacher_visible_limit = await ensureEnVocabTeacherVisibleLimit(
      env.DB,
      { words, display_order }
    );
    return jsonResponse({
      ok: true,
      words: redactJpVocabWordsMnemonicForClient(words, isAdmin),
      refs,
      daily_quiz_style,
      display_order,
      shared_today_word_ids,
      teacher_visible_limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireEnVocabAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      action?: string;
      word_id?: number;
      level?: EnVocabLevel;
      usage_levels?: EnVocabLevel[];
      daily_quiz_style?: Partial<EnVocabDailyQuizStyle>;
      count?: number;
    };

    if (body.action === "daily_quiz_style") {
      const { isAdmin } = await requireAdmin(request);
      if (!isAdmin) {
        return jsonResponse({ ok: false, error: "forbidden" }, 403);
      }
      const daily_quiz_style = await setEnVocabDailyQuizStyle(
        env.DB,
        normalizeEnVocabDailyQuizStyle(body.daily_quiz_style)
      );
      return jsonResponse({ ok: true, daily_quiz_style });
    }

    if (body.action === "set_daily_quiz_target") {
      const { isAdmin } = await requireAdmin(request);
      if (!isAdmin) {
        return jsonResponse({ ok: false, error: "forbidden" }, 403);
      }
      const targetCount = parseEnVocabDailyQuizTargetCount(body.count);
      if (targetCount == null) {
        return jsonResponse({ ok: false, error: "invalid count" }, 400);
      }
      try {
        const teacher_visible_limit = await setEnVocabDailyQuizTarget(
          env.DB,
          targetCount
        );
        return jsonResponse({ ok: true, teacher_visible_limit });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status =
          message === "empty_quiz_pool" || message === "no_release_candidates"
            ? 400
            : 500;
        return jsonResponse({ ok: false, error: message }, status);
      }
    }

    if (body.action === "reset") {
      const result = await resetAllEnVocabReviews(env.DB);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, 400);
      }
      return jsonResponse({
        ok: true,
        words: result.words,
        display_order: result.display_order,
        // 重置已清共享；显式回空，避免客户端 localStorage 仍留「已共享」锁
        shared_today_word_ids: [] as number[],
      });
    }

    if (body.action === "reset_today") {
      const result = await resetTodayEnVocabRound(env.DB);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, 400);
      }
      return jsonResponse({
        ok: true,
        words: result.words,
        display_order: result.display_order,
        shared_today_word_ids: [] as number[],
      });
    }

    const wordId = Number(body.word_id);
    const usageLevels = Array.isArray(body.usage_levels)
      ? body.usage_levels
      : null;

    const { isAdmin: isAdminForReview } = await requireAdmin(request);

    const shareOpts = {
      // 勾选只写熟悉程度；整卡同步改到点「下一个」时 POST /share（只同步一次）
      shareToStudy: false as const,
      sharedBy: user?.username ?? "",
    };

    if (usageLevels) {
      if (!usageLevels.every(isEnVocabLevel) || !usageLevels.length) {
        return jsonResponse({ ok: false, error: "usage_levels_invalid" }, 400);
      }
      const result = await recordEnVocabReviewWithUsageLevels(
        env.DB,
        wordId,
        usageLevels,
        shareOpts
      );
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }
      if (user && !isAdminForReview) {
        try {
          await trackEnVocabTeacherQuizDayAfterReview(env.DB, user);
        } catch (trackErr) {
          console.error(
            "[en-vocab] trackEnVocabTeacherQuizDayAfterReview failed",
            trackErr
          );
        }
      }
      return jsonResponse({
        ok: true,
        word: result.word,
        shared: result.shared,
        shared_new: result.shared_new,
      });
    }

    const level = body.level;

    if (!level || !isEnVocabLevel(level)) {
      return jsonResponse({ ok: false, error: "level_invalid" }, 400);
    }

    const result = await recordEnVocabReview(env.DB, wordId, level, shareOpts);

    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    if (user && !isAdminForReview) {
      try {
        await trackEnVocabTeacherQuizDayAfterReview(env.DB, user);
      } catch (trackErr) {
        console.error(
          "[en-vocab] trackEnVocabTeacherQuizDayAfterReview failed",
          trackErr
        );
      }
    }

    return jsonResponse({
      ok: true,
      word: result.word,
      shared: result.shared,
      shared_new: result.shared_new,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
