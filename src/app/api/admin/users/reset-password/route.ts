import { requireAdmin } from "@/lib/admin-auth";
import { resetUserPasswordByAdmin } from "@/lib/etr-auth-db";
import { RBAC_ROLE_LABELS } from "@/lib/rbac";
import type { EtrUserRole } from "@/lib/etr-auth";
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
  cannot_edit_admin: {
    en: "Admin accounts cannot be reset here.",
    zh: "不能重置管理员账号。",
  },
  payload_invalid: {
    en: "Invalid request payload.",
    zh: "请求数据无效。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return ERR[key]?.[locale] ?? ERR[key]?.en ?? key;
}

function roleLabel(role: EtrUserRole, locale: "en" | "zh"): string {
  const item = RBAC_ROLE_LABELS[role];
  return locale === "zh" ? item.zh : item.en;
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
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

    const env = await getCloudflareEnv();
    const result = await resetUserPasswordByAdmin(env, userId);
    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: errMsg(result.error, locale) },
        400
      );
    }

    return jsonResponse({
      ok: true,
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        role_label: roleLabel(result.user.role as EtrUserRole, locale),
        disabled: (result.user.disabled ?? 0) !== 0,
        created_at: result.user.created_at,
      },
      password: result.password,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
