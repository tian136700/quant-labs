import { localeFromRequest } from "@/lib/cloudflare-env";
import {
  getEnVocabStudyQuizProgressTarget,
  getEnVocabTeacherQuizLive,
  listEnVocabSharedToday,
} from "@/lib/en-vocab-db";
import { requireEnVocabStudyAccess } from "@/lib/en-vocab-auth";
import { beijingDateString } from "@/lib/en-vocab-daily-check";
import { enVocabTeacherPronounceFromLive } from "@/lib/en-vocab-teacher-quiz-live";
import { jsonResponseObserving1102 } from "@/lib/worker-1102-observe";

const AUTH_MSG = {
  en: "Only Admin or Japanese teachers can access today's vocabulary.",
  zh: "仅管理员或英语老师可访问今日背英语单词。",
};

export async function GET(request: Request) {
  const startedAtMs = Date.now();
  const locale = localeFromRequest(request);
  const lite = new URL(request.url).searchParams.get("lite") === "1";

  try {
    const { env, allowed } = await requireEnVocabStudyAccess(request);
    if (!allowed) {
      return jsonResponseObserving1102(
        request,
        startedAtMs,
        { ok: false, error: AUTH_MSG[locale] },
        401
      );
    }

    const listPromise = listEnVocabSharedToday(env.DB);
    const quizPromise = lite ? null : getEnVocabStudyQuizProgressTarget(env.DB);
    // lite 用 isolate 短缓存减轻每 5s 强制 D1；全量/非 lite 仍 bypass
    const livePromise = getEnVocabTeacherQuizLive(env.DB, new Date(), {
      bypassCache: !lite,
    });
    const [{ items, refs }, quiz_progress, live] = await Promise.all([
      listPromise,
      quizPromise ?? Promise.resolve(null),
      livePromise,
    ]);
    return jsonResponseObserving1102(
      request,
      startedAtMs,
      {
        ok: true,
        items,
        refs,
        share_date: beijingDateString(),
        teacher_live_word_id: live.word_id,
        teacher_pronounce: enVocabTeacherPronounceFromLive(live),
        ...(quiz_progress ? { quiz_progress } : {}),
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponseObserving1102(
      request,
      startedAtMs,
      { ok: false, error: message },
      500
    );
  }
}
