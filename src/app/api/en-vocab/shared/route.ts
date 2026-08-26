import { localeFromRequest } from "@/lib/cloudflare-env";
import {
  backfillEnVocabCheckedUnsharedShares,
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

    // 非 lite：先补「已抽未共享」再列表，避免学生端 28/30、老师已抽完对不上
    // lite 用 isolate 短缓存减轻每 5s 强制 D1；全量/非 lite 仍 bypass
    const live = await getEnVocabTeacherQuizLive(env.DB, new Date(), {
      bypassCache: !lite,
    });
    if (!lite) {
      await backfillEnVocabCheckedUnsharedShares(env.DB, {
        excludeWordId: live.word_id,
      });
    }
    const [{ items, refs }, quiz_progress] = await Promise.all([
      listEnVocabSharedToday(env.DB),
      lite
        ? Promise.resolve(null)
        : getEnVocabStudyQuizProgressTarget(env.DB),
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
