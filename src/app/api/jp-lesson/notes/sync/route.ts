import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { syncLessonNotesToVocabIfCompleted } from "@/lib/jp-lesson-db";
import { requireJpLessonOperate } from "@/lib/jp-lesson-auth";

const AUTH_MSG = {
  en: "Please log in to save notes.",
  zh: "请登录后再编辑课堂笔记。",
};

/** 批量保存笔记后，若新课已完成则同步到单词复习 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpLessonOperate(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as { lesson_id?: number };
    const lessonId = Number(body.lesson_id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return jsonResponse({ ok: false, error: "lesson_id_invalid" }, 400);
    }

    await syncLessonNotesToVocabIfCompleted(env.DB, lessonId);
    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
