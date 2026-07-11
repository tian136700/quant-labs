import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { getJpVocabTeacherVisibleLimit } from "@/lib/jp-vocab-db";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";

const AUTH_MSG = {
  en: "Please log in to view vocabulary settings.",
  zh: "请登录后查看单词设置。",
};

/** 轻量接口：仅返回今日抽查数量等老师可见配置（跨子域名共用 D1，供 japanese / finance 轮询同步） */
export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requireJpVocabAccess(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const teacher_visible_limit = await getJpVocabTeacherVisibleLimit(env.DB);
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
