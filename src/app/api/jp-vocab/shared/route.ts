import { localeFromRequest } from "@/lib/cloudflare-env";
import {
  backfillJpVocabCheckedUnsharedShares,
  getJpVocabTeacherQuizLive,
  listJpVocabSharedToday,
  getJpVocabStudyQuizProgressTarget,
} from "@/lib/jp-vocab-db";
import { requireJpVocabStudyAccess } from "@/lib/jp-vocab-auth";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { redactJpVocabMnemonicForClient } from "@/lib/jp-vocab-mnemonic";
import { isAdminSuperuser } from "@/lib/rbac";
import { jsonResponseObserving1102 } from "@/lib/worker-1102-observe";

const AUTH_MSG = {
  en: "Only admin or authorized students can access today's vocabulary.",
  zh: "仅管理员或已授权学生可访问今日日语单词。",
};

export async function GET(request: Request) {
  const startedAtMs = Date.now();
  const locale = localeFromRequest(request);
  const lite = new URL(request.url).searchParams.get("lite") === "1";

  try {
    const { env, user, allowed } = await requireJpVocabStudyAccess(request);
    if (!allowed) {
      return jsonResponseObserving1102(
        request,
        startedAtMs,
        { ok: false, error: AUTH_MSG[locale] },
        401
      );
    }

    const isAdmin = isAdminSuperuser(user?.role);
    // 非 lite：先补「已抽未共享」再列表，避免学生端进度 14/35、老师已抽 15 对不上
    // bypassCache：老师切词写在别的 isolate，学生 shared 不能吃本 isolate 5s 短缓存
    // （否则 teacher_live_word_id 仍是旧词 → 按钮一直「老师已发送」）
    const live = await getJpVocabTeacherQuizLive(env.DB, new Date(), {
      bypassCache: true,
    });
    if (!lite) {
      await backfillJpVocabCheckedUnsharedShares(env.DB, {
        excludeWordId: live.word_id,
      });
    }
    const [{ items, refs }, quiz_progress] = await Promise.all([
      listJpVocabSharedToday(env.DB),
      lite
        ? Promise.resolve(null)
        : getJpVocabStudyQuizProgressTarget(env.DB),
    ]);
    const clientItems = isAdmin
      ? items
      : items.map((item) => ({
          ...item,
          word: redactJpVocabMnemonicForClient(item.word, false),
        }));
    return jsonResponseObserving1102(
      request,
      startedAtMs,
      {
        ok: true,
        items: clientItems,
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
