import { requireAdmin } from "@/lib/admin-auth";
import {
  createUserByAdmin,
  deleteUserByAdmin,
  findUserById,
  listJpLessonTeacherLinkMapByUserId,
  listEtrUsers,
  setUserDisabled,
  setUserNeverDisable,
  setUserAllowMultiDevice,
  setUserJpLessonTeacherLink,
  syncBootstrapUsersFromEnv,
  updateUserByAdmin,
} from "@/lib/etr-auth-db";
import {
  detectTeacherModules,
  formatTeacherModulesLabel,
  parseTeacherModulesInput,
  teacherModulesFromRole,
  teacherModulesToRoleAndExtras,
  type RbacTeacherModules,
} from "@/lib/rbac";
import {
  listUserExtraPermissionsMap,
  setUserExtraPermissions,
} from "@/lib/rbac-db";
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
  cannot_edit_admin: {
    en: "Admin accounts cannot be edited here.",
    zh: "不能编辑管理员账号。",
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
    en: "Username must be 4–32 characters (letters, numbers, _ . - or Chinese).",
    zh: "用户名须为 4–32 个字符（字母、数字、_ . - 或中文）。",
  },
  username_reserved: {
    en: "This username is reserved.",
    zh: "该用户名已被系统保留。",
  },
  cannot_rename_bootstrap: {
    en: "System account usernames (Admin / LiLaoshi / user1) cannot be renamed.",
    zh: "系统保留账号（Admin / 李老师 / user1）不能改用户名。",
  },
  username_taken: {
    en: "Username already exists.",
    zh: "用户名已存在。",
  },
  password_too_short: {
    en: "Password must be at least 6 characters.",
    zh: "密码至少 6 位。",
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
  teacher_not_found: {
    en: "Selected teacher was not found.",
    zh: "所选老师不存在。",
  },
};

function errMsg(key: string, locale: "en" | "zh"): string {
  return ERR[key]?.[locale] ?? ERR[key]?.en ?? key;
}

function serializeUser(
  user: {
    id: number;
    username: string;
    role: string;
    disabled?: number;
    never_disable?: number;
    allow_multi_device?: number;
    created_at: string;
    last_login_at?: string | null;
    last_login_ip?: string | null;
  },
  locale: "en" | "zh",
  teacherLink?: { teacher_id: number; teacher_name: string } | null,
  teacherModules?: RbacTeacherModules | null
) {
  const modules =
    teacherModules ?? teacherModulesFromRole(user.role);
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    role_label: formatTeacherModulesLabel(modules, locale),
    teacher_modules: modules,
    jp_lesson_teacher_id: teacherLink?.teacher_id ?? null,
    jp_lesson_teacher_name: teacherLink?.teacher_name ?? null,
    disabled: (user.disabled ?? 0) !== 0,
    never_disable: (user.never_disable ?? 0) !== 0,
    allow_multi_device: (user.allow_multi_device ?? 0) !== 0,
    created_at: user.created_at,
    last_login_at: user.last_login_at ?? null,
    last_login_ip: user.last_login_ip ?? null,
  };
}

function parseTeacherIdInput(
  raw: unknown
): { ok: true; value: number | null | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === "") return { ok: true, value: null };
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return { ok: false };
  return { ok: true, value: id };
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
    const teacherLinkMap = await listJpLessonTeacherLinkMapByUserId(env.DB);
    const extraMap = await listUserExtraPermissionsMap(env.DB);
    return jsonResponse({
      ok: true,
      users: users.map((user) => {
        const extras = extraMap.get(user.id) ?? [];
        return serializeUser(
          user,
          locale,
          teacherLinkMap.get(user.id) ?? null,
          detectTeacherModules(user.role, extras)
        );
      }),
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

    let body: {
      username?: unknown;
      password?: unknown;
      role?: unknown;
      teacher_modules?: unknown;
      jp_lesson_teacher_id?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const modulesInput = parseTeacherModulesInput(body.teacher_modules);
    const resolved = modulesInput
      ? teacherModulesToRoleAndExtras(modulesInput)
      : {
          role: String(body.role ?? "user").trim() as EtrUserRole,
          extra_permissions: [] as string[],
        };
    const role = resolved.role;
    const teacherParsed = parseTeacherIdInput(body.jp_lesson_teacher_id);
    if (!teacherParsed.ok) {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

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

    await setUserExtraPermissions(
      env.DB,
      result.user.id,
      resolved.extra_permissions
    );

    let teacherLink: { teacher_id: number; teacher_name: string } | null = null;
    if (teacherParsed.value != null) {
      const linkResult = await setUserJpLessonTeacherLink(
        env.DB,
        result.user.id,
        teacherParsed.value
      );
      if (!linkResult.ok) {
        return jsonResponse(
          { ok: false, error: errMsg(linkResult.error, locale) },
          400
        );
      }
      teacherLink = {
        teacher_id: linkResult.teacher_id!,
        teacher_name: linkResult.teacher_name ?? "",
      };
    }

    return jsonResponse({
      ok: true,
      user: serializeUser(
        result.user,
        locale,
        teacherLink,
        modulesInput ?? teacherModulesFromRole(role)
      ),
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

    let body: {
      user_id?: unknown;
      disabled?: unknown;
      never_disable?: unknown;
      allow_multi_device?: unknown;
      username?: unknown;
      password?: unknown;
      role?: unknown;
      teacher_modules?: unknown;
      jp_lesson_teacher_id?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const userId = Number(body.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const teacherParsed = parseTeacherIdInput(body.jp_lesson_teacher_id);
    if (!teacherParsed.ok) {
      return jsonResponse({ ok: false, error: errMsg("payload_invalid", locale) }, 400);
    }

    const modulesInput = parseTeacherModulesInput(body.teacher_modules);
    const modulesResolved = modulesInput
      ? teacherModulesToRoleAndExtras(modulesInput)
      : null;

    const hasEdit =
      body.username !== undefined ||
      body.password !== undefined ||
      body.role !== undefined ||
      modulesResolved != null ||
      teacherParsed.value !== undefined;

    if (hasEdit) {
      const hasProfileEdit =
        body.username !== undefined ||
        body.password !== undefined ||
        body.role !== undefined ||
        modulesResolved != null;

      let baseUser = await findUserById(env.DB, userId);
      if (!baseUser) {
        return jsonResponse(
          { ok: false, error: errMsg("user_not_found", locale) },
          400
        );
      }

      if (hasProfileEdit) {
        const input: {
          username?: string;
          password?: string;
          role?: EtrUserRole;
        } = {};
        if (body.username !== undefined) {
          input.username = String(body.username).trim();
        }
        if (body.password !== undefined) {
          input.password = String(body.password);
        }
        if (modulesResolved) {
          input.role = modulesResolved.role;
        } else if (body.role !== undefined) {
          input.role = String(body.role).trim() as EtrUserRole;
        }
        const result = await updateUserByAdmin(env, userId, input);
        if (!result.ok) {
          return jsonResponse(
            { ok: false, error: errMsg(result.error, locale) },
            400
          );
        }
        baseUser = result.user;
        if (modulesResolved) {
          await setUserExtraPermissions(
            env.DB,
            userId,
            modulesResolved.extra_permissions
          );
        }
      }

      let teacherLink: { teacher_id: number; teacher_name: string } | null = null;
      if (teacherParsed.value !== undefined) {
        const linkResult = await setUserJpLessonTeacherLink(
          env.DB,
          userId,
          teacherParsed.value
        );
        if (!linkResult.ok) {
          return jsonResponse(
            { ok: false, error: errMsg(linkResult.error, locale) },
            400
          );
        }
        if (linkResult.teacher_id != null) {
          teacherLink = {
            teacher_id: linkResult.teacher_id,
            teacher_name: linkResult.teacher_name ?? "",
          };
        }
      } else {
        const linkMap = await listJpLessonTeacherLinkMapByUserId(env.DB);
        teacherLink = linkMap.get(userId) ?? null;
      }

      const extras = await listUserExtraPermissionsMap(env.DB);
      const userExtras = extras.get(userId) ?? [];
      const modules =
        modulesInput ?? detectTeacherModules(baseUser.role, userExtras);

      return jsonResponse({
        ok: true,
        user: serializeUser(baseUser, locale, teacherLink, modules),
      });
    }

    if (typeof body.never_disable === "boolean") {
      const result = await setUserNeverDisable(
        env.DB,
        userId,
        body.never_disable
      );
      if (!result.ok) {
        return jsonResponse(
          { ok: false, error: errMsg(result.error, locale) },
          400
        );
      }

      const linkMap = await listJpLessonTeacherLinkMapByUserId(env.DB);
      const extras = await listUserExtraPermissionsMap(env.DB);
      const userExtras = extras.get(userId) ?? [];
      return jsonResponse({
        ok: true,
        user: serializeUser(
          result.user,
          locale,
          linkMap.get(userId) ?? null,
          detectTeacherModules(result.user.role, userExtras)
        ),
      });
    }

    if (typeof body.allow_multi_device === "boolean") {
      const result = await setUserAllowMultiDevice(
        env.DB,
        userId,
        body.allow_multi_device
      );
      if (!result.ok) {
        return jsonResponse(
          { ok: false, error: errMsg(result.error, locale) },
          400
        );
      }

      const linkMap = await listJpLessonTeacherLinkMapByUserId(env.DB);
      const extras = await listUserExtraPermissionsMap(env.DB);
      const userExtras = extras.get(userId) ?? [];
      return jsonResponse({
        ok: true,
        user: serializeUser(
          result.user,
          locale,
          linkMap.get(userId) ?? null,
          detectTeacherModules(result.user.role, userExtras)
        ),
      });
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

    const linkMap = await listJpLessonTeacherLinkMapByUserId(env.DB);
    const extras = await listUserExtraPermissionsMap(env.DB);
    const userExtras = extras.get(userId) ?? [];
    return jsonResponse({
      ok: true,
      user: serializeUser(
        result.user,
        locale,
        linkMap.get(userId) ?? null,
        detectTeacherModules(result.user.role, userExtras)
      ),
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
