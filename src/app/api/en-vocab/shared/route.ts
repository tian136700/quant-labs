import { localeFromRequest } from "@/lib/cloudflare-env";
import {
  getEnVocabStudyQuizProgressTarget,
  getEnVocabTeacherQuizLive,
  listEnVocabSharedToday,
} from "@/lib/en-vocab-db";
import { requireEnVocabStudyAccess } from "@/lib/en-vocab-auth";
import { beijingDateString } from "@/lib/en-vocab-daily-check";
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
    // bypassCache：老师切词写在别的 isolate，学生 shared 不能吃本 isolate 5s 短缓存
    // （否则 teacher_live_word_id 仍是旧词 → 按钮一直「老师已发送」）
    const livePromise = getEnVocabTeacherQuizLive(env.DB, new Date(), {
      bypassCache: true,
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
