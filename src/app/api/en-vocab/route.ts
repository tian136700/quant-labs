import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  ensureEnVocabDailyDisplayOrder,
  getEnVocabDailyQuizStyle,
  listEnVocabSharedTodayWordIds,
  listEnVocabWordsWithRefs,
  recordEnVocabReview,
  resetAllEnVocabReviews,
  resetTodayEnVocabRound,
  setEnVocabDailyQuizStyle,
} from "@/lib/en-vocab-db";
import { requireEnVocabAccess } from "@/lib/en-vocab-auth";
import { requireAdmin } from "@/lib/admin-auth";
import {
  normalizeEnVocabDailyQuizStyle,
  type EnVocabDailyQuizStyle,
} from "@/lib/en-vocab-daily-quiz-style";
import type { EnVocabLevel } from "@/lib/types";

const AUTH_MSG = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

export async function GET() {
  try {
    const env = await getCloudflareEnv();
    const [{ words, refs }, daily_quiz_style, shared_today_word_ids] = await Promise.all([
      listEnVocabWordsWithRefs(env.DB),
      getEnVocabDailyQuizStyle(env.DB),
      listEnVocabSharedTodayWordIds(env.DB),
    ]);
    const display_order = await ensureEnVocabDailyDisplayOrder(env.DB, words);
    return jsonResponse({
      ok: true,
      words,
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
      });
    }

    const wordId = Number(body.word_id);
    const level = body.level;

    if (!level || !["very", "normal", "weak"].includes(level)) {
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
