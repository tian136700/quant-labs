import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { listJpVocabSharedToday, getJpVocabDailyQuizProgress } from "@/lib/jp-vocab-db";
import { requireJpVocabStudyAccess } from "@/lib/jp-vocab-auth";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";

const AUTH_MSG = {
  en: "Only admin or authorized students can access today's vocabulary.",
  zh: "仅管理员或已授权学生可访问今日日语单词。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireJpVocabStudyAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const [{ items, refs }, quiz_progress] = await Promise.all([
      listJpVocabSharedToday(env.DB),
      getJpVocabDailyQuizProgress(env.DB),
    ]);
    return jsonResponse(
      {
        ok: true,
        items,
        refs,
        share_date: beijingDateString(),
        quiz_progress,
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
