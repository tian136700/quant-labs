import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  getEnVocabStudyQuizProgressTarget,
  getEnVocabTeacherQuizLive,
  listEnVocabSharedToday,
} from "@/lib/en-vocab-db";
import { requireEnVocabStudyAccess } from "@/lib/en-vocab-auth";
import { beijingDateString } from "@/lib/en-vocab-daily-check";

const AUTH_MSG = {
  en: "Only Admin or Japanese teachers can access today's vocabulary.",
  zh: "仅管理员或英语老师可访问今日背英语单词。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const lite = new URL(request.url).searchParams.get("lite") === "1";

  try {
    const { env, allowed } = await requireEnVocabStudyAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const listPromise = listEnVocabSharedToday(env.DB);
    const quizPromise = lite ? null : getEnVocabStudyQuizProgressTarget(env.DB);
    const livePromise = getEnVocabTeacherQuizLive(env.DB);
    const [{ items, refs }, quiz_progress, live] = await Promise.all([
      listPromise,
      quizPromise ?? Promise.resolve(null),
      livePromise,
    ]);
    return jsonResponse(
      {
        ok: true,
        items,
        refs,
        share_date: beijingDateString(),
        // 学生 peek 按钮灰态须跟「老师当前 live 词」，勿只钉上次 peek 的 id
        teacher_live_word_id: live.word_id,
        ...(quiz_progress ? { quiz_progress } : {}),
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
