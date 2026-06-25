import { requireAdmin } from "@/lib/admin-auth";
import {
  createUserByAdmin,
  deleteUserByAdmin,
  listEtrUsers,
  setUserDisabled,
  syncBootstrapUsersFromEnv,
} from "@/lib/etr-auth-db";
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
  cannot_delete_self: {
    en: "You cannot delete your own account.",
    zh: "不能删除当前登录的管理员账号。",
  },
  cannot_delete_admin: {
    en: "Admin accounts cannot be deleted.",
    zh: "不能删除管理员账号。",
  },
  delete_failed: {
    en: "Failed to delete user.",
    zh: "删除用户失败。",
  },
  payload_invalid: {
    en: "Invalid request payload.",
    zh: "请求数据无效。",
  },
  username_invalid: {
    en: "Username must be 6–32 characters (letters, numbers, _ . - or Chinese).",
    zh: "用户名须为 6–32 个字符（字母、数字、_ . - 或中文）。",
  },
  username_reserved: {
    en: "This username is reserved.",
    zh: "该用户名已被系统保留。",
  },
  username_taken: {
    en: "Username already exists.",
    zh: "用户名已存在。",
  },
  password_too_short: {
    en: "Password must be at least 6 characters.",
    zh: "密码至少 6 位。",
  },
  password_too_weak: {
    en: "Teacher accounts need a password of at least 10 characters.",
    zh: "教师账号密码至少 10 位。",
  },
  role_invalid: {
    en: "Invalid role.",
    zh: "角色无效。",
  },
  cannot_create_admin: {
    en: "Admin accounts cannot be created here.",
    zh: "不能在此创建管理员账号。",
  },
  create_failed: {
    en: "Failed to create user.",
    zh: "创建用户失败。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return ERR[key]?.[locale] ?? ERR[key]?.en ?? key;
}

function roleLabel(role: EtrUserRole, locale: "en" | "zh"): string {
  const item = RBAC_ROLE_LABELS[role];
  return locale === "zh" ? item.zh : item.en;
}

function serializeUser(user: {
  id: number;
  username: string;
  role: string;
  disabled?: number;
  created_at: string;
}, locale: "en" | "zh") {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    role_label: roleLabel(user.role as EtrUserRole, locale),
    disabled: (user.disabled ?? 0) !== 0,
    created_at: user.created_at,
  };
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: errMsg("forbidden", locale) }, 403);
    }

    const env = await getCloudflareEnv();
    await syncBootstrapUsersFromEnv(env);
    const users = await listEtrUsers(env.DB);
    return jsonResponse({
      ok: true,
      users: users.map((user) => serializeUser(user, locale)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: errMsg("forbidden", locale) }, 403);
    }

    let body: { username?: unknown; password?: unknown; role?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "user").trim() as EtrUserRole;

    if (!username || !password) {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const result = await createUserByAdmin(env, username, password, role);
    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: errMsg(result.error, locale) },
        400
      );
    }

    return jsonResponse({
      ok: true,
      user: serializeUser(result.user, locale),
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
      user: serializeUser(result.user, locale),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function DELETE(request: Request) {
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

    const result = await deleteUserByAdmin(env.DB, userId, user.id);
    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: errMsg(result.error, locale) },
        400
      );
    }

    return jsonResponse({ ok: true, username: result.username });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
