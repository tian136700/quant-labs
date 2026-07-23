import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  ensureEnVocabDailyDisplayOrder,
  getEnVocabDailyQuizStyle,
  listEnVocabSharedTodayWordIds,
  listEnVocabWordsWithRefs,
  recordEnVocabReview,
  recordEnVocabReviewWithUsageLevels,
  resetAllEnVocabReviews,
  resetTodayEnVocabRound,
  setEnVocabDailyQuizStyle,
} from "@/lib/en-vocab-db";
import { requireEnVocabAccess } from "@/lib/en-vocab-auth";
import { requireAdmin } from "@/lib/admin-auth";
import { redactJpVocabWordsMnemonicForClient } from "@/lib/jp-vocab-mnemonic";
import {
  normalizeEnVocabDailyQuizStyle,
  type EnVocabDailyQuizStyle,
} from "@/lib/en-vocab-daily-quiz-style";
import { isEnVocabLevel } from "@/lib/en-vocab-review";
import type { EnVocabLevel } from "@/lib/types";

const AUTH_MSG = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();
    const { isAdmin } = await requireAdmin(request);
    const [{ words, refs }, daily_quiz_style, shared_today_word_ids] = await Promise.all([
      listEnVocabWordsWithRefs(env.DB),
      getEnVocabDailyQuizStyle(env.DB),
      listEnVocabSharedTodayWordIds(env.DB),
    ]);
    const display_order = await ensureEnVocabDailyDisplayOrder(env.DB, words);
    return jsonResponse({
      ok: true,
      words: redactJpVocabWordsMnemonicForClient(words, isAdmin),
      refs,
      daily_quiz_style,
      display_order,
      shared_today_word_ids,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireEnVocabAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      action?: string;
      word_id?: number;
      level?: EnVocabLevel;
      usage_levels?: EnVocabLevel[];
      daily_quiz_style?: Partial<EnVocabDailyQuizStyle>;
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

    if (usageLevels) {
      if (!usageLevels.length || !usageLevels.every(isEnVocabLevel)) {
        return jsonResponse({ ok: false, error: "usage_levels_invalid" }, 400);
      }
      const result = await recordEnVocabReviewWithUsageLevels(
        env.DB,
        wordId,
        usageLevels
      );
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return jsonResponse({ ok: false, error: result.error }, status);
      }
      return jsonResponse({ ok: true, word: result.word });
    }

    const level = body.level;

    if (!level || !isEnVocabLevel(level)) {
      return jsonResponse({ ok: false, error: "level_invalid" }, 400);
    }

    const result = await recordEnVocabReview(env.DB, wordId, level);

    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    return jsonResponse({ ok: true, word: result.word });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
