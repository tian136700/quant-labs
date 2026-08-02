import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { getEnVocabTeacherVisibleLimit } from "@/lib/en-vocab-db";
import { requireEnVocabRead } from "@/lib/en-vocab-auth";

const AUTH_MSG = {
  en: "Please log in to view vocabulary settings.",
  zh: "请登录后查看单词设置。",
};

/** 轻量接口：仅返回今日抽查数量等老师可见配置（对齐 /api/jp-vocab/teacher-visible） */
export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireEnVocabRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    // 必须 bypass：否则 isolate 5s 读缓存会把别的端已改的「今日抽查数量」打回旧值（手机仍显示 32）
    const teacher_visible_limit = await getEnVocabTeacherVisibleLimit(env.DB, {
      bypassCache: true,
    });
    return jsonResponse(
      { ok: true, teacher_visible_limit },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
