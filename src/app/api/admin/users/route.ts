import { requireAdmin } from "@/lib/admin-auth";
import { listEtrUsers, setUserDisabled } from "@/lib/etr-auth-db";
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
  cannot_disable_admin: {
    en: "Admin accounts cannot be disabled.",
    zh: "不能禁用管理员账号。",
  },
  cannot_disable_self: {
    en: "You cannot disable your own account.",
    zh: "不能禁用当前登录的管理员账号。",
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

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: errMsg("forbidden", locale) }, 403);
    }

    const env = await getCloudflareEnv();
    const users = await listEtrUsers(env.DB);
    return jsonResponse({
      ok: true,
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        role_label: roleLabel(user.role as EtrUserRole, locale),
        disabled: (user.disabled ?? 0) !== 0,
        created_at: user.created_at,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function PATCH(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, user, isAdmin } = await requireAdmin(request);
    if (!isAdmin || !user) {
      return jsonResponse({ ok: false, error: errMsg("forbidden", locale) }, 403);
    }

    let body: { user_id?: unknown; disabled?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const userId = Number(body.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }
    if (typeof body.disabled !== "boolean") {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const result = await setUserDisabled(env.DB, userId, body.disabled, user.id);
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
