import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
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

  try {
    const { env, allowed } = await requireEnVocabStudyAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const [{ items, refs }, live] = await Promise.all([
      listEnVocabSharedToday(env.DB),
      getEnVocabTeacherQuizLive(env.DB),
    ]);
    return jsonResponse(
      {
        ok: true,
        items,
        refs,
        share_date: beijingDateString(),
        // 学生 peek 按钮灰态须跟「老师当前 live 词」，勿只钉上次 peek 的 id
        teacher_live_word_id: live.word_id,
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
