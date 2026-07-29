import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { listJpVocabSharedToday, getJpVocabStudyQuizProgressTarget } from "@/lib/jp-vocab-db";
import { requireJpVocabStudyAccess } from "@/lib/jp-vocab-auth";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { redactJpVocabMnemonicForClient } from "@/lib/jp-vocab-mnemonic";
import { isAdminSuperuser } from "@/lib/rbac";

const AUTH_MSG = {
  en: "Only admin or authorized students can access today's vocabulary.",
  zh: "仅管理员或已授权学生可访问今日日语单词。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const lite = new URL(request.url).searchParams.get("lite") === "1";

  try {
    const { env, user, allowed } = await requireJpVocabStudyAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const isAdmin = isAdminSuperuser(user?.role);
    const listPromise = listJpVocabSharedToday(env.DB);
    const quizPromise = lite ? null : getJpVocabStudyQuizProgressTarget(env.DB);
    const [{ items, refs }, quiz_progress] = await Promise.all([
      listPromise,
      quizPromise ?? Promise.resolve(null),
    ]);
    const clientItems = isAdmin
      ? items
      : items.map((item) => ({
          ...item,
          word: redactJpVocabMnemonicForClient(item.word, false),
        }));
    return jsonResponse(
      {
        ok: true,
        items: clientItems,
        refs,
        share_date: beijingDateString(),
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
