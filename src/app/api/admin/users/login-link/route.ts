import { requireAdmin } from "@/lib/admin-auth";
import { createLoginLink } from "@/lib/etr-login-link-db";
import { buildLoginLinkUrl } from "@/lib/login-link-slug";
import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";

const ERR: Record<string, Record<"en" | "zh", string>> = {
  forbidden: {
    en: "Admin access required.",
    zh: "需要管理员账号。",
  },
  user_not_found: {
    en: "User not found.",
    zh: "用户不存在。",
  },
  user_disabled: {
    en: "Cannot create a login link for a disabled account.",
    zh: "已禁用账号无法生成登录链接。",
  },
  payload_invalid: {
    en: "Invalid request payload.",
    zh: "请求数据无效。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return ERR[key]?.[locale] ?? ERR[key]?.en ?? key;
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, user, isAdmin } = await requireAdmin(request);
    if (!isAdmin || !user) {
      return jsonResponse({ ok: false, error: errMsg("forbidden", locale) }, 403);
    }

    let body: { user_id?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const userId = Number(body.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const result = await createLoginLink(env.DB, userId, user.id);
    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: errMsg(result.error, locale) },
        400
      );
    }

    const loginUrl = buildLoginLinkUrl(result.token);

    return jsonResponse({
      ok: true,
      url: loginUrl,
      link_expires_at: result.link_expires_at,
      session_days: result.session_days,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
