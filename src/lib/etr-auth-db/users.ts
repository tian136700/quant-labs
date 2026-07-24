import "server-only";

import {
  ETR_DEFAULT_JP_VOCAB_USER1_USERNAME,
  ETR_DEFAULT_JP_VOCAB_USERNAME,
  encodePasswordStorage,
  hashPassword,
  isReservedUsername,
  isValidUsername,
  normalizeUsername,
  resolveAdminBootstrap,
  resolveJpVocabBootstrap,
  resolveJpVocabUser1Bootstrap,
  type EtrUser,
  type EtrUserRole,
} from "../etr-auth";
import type { CloudflareEnv } from "../types";
import { ensureBootstrapUsers } from "./bootstrap";
import { ensureEtrUsersSchema } from "./schema";
import { findUserById, findUserByUsername } from "./session";
import { etrAuthDbState, nowIso, type DevUser } from "./state";

export async function listEtrUsers(db: D1Database): Promise<EtrUser[]> {
  if (etrAuthDbState.devAuthEnabled) {
    return etrAuthDbState.devUsers
      .map(({ password_hash: _, ...user }) => user)
      .sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" }));
  }

  await ensureEtrUsersSchema(db);

  const result = await db
    .prepare(
      `SELECT id, username, role, disabled, never_disable, created_at
         , last_login_at, last_login_ip
       FROM etr_users
       ORDER BY role ASC, username COLLATE NOCASE ASC`
    )
    .all<EtrUser>();

  return result.results ?? [];
}

export async function revokeUserSessions(db: D1Database, userId: number): Promise<void> {
  if (etrAuthDbState.devAuthEnabled) {
    for (let i = etrAuthDbState.devSessions.length - 1; i >= 0; i -= 1) {
      if (etrAuthDbState.devSessions[i].user_id === userId) {
        etrAuthDbState.devSessions.splice(i, 1);
      }
    }
    return;
  }

  await db.prepare(`DELETE FROM etr_sessions WHERE user_id = ?1`).bind(userId).run();
}

export type SetUserDisabledResult =
  | { ok: true; user: EtrUser }
  | { ok: false; error: string };

export async function setUserDisabled(
  db: D1Database,
  userId: number,
  disabled: boolean,
  actorUserId: number
): Promise<SetUserDisabledResult> {
  if (userId === actorUserId) {
    return { ok: false, error: "cannot_disable_self" };
  }

  const user = await findUserById(db, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.role === "admin") return { ok: false, error: "cannot_disable_admin" };

  const flag = disabled ? 1 : 0;

  if (etrAuthDbState.devAuthEnabled) {
    const row = etrAuthDbState.devUsers.find((u) => u.id === userId);
    if (!row) return { ok: false, error: "user_not_found" };
    row.disabled = flag;
    const { password_hash: _, ...publicUser } = row;
    return { ok: true, user: publicUser };
  }

  await ensureEtrUsersSchema(db);
  await db
    .prepare(`UPDATE etr_users SET disabled = ?1 WHERE id = ?2`)
    .bind(flag, userId)
    .run();

  const updated = await findUserById(db, userId);
  if (!updated) return { ok: false, error: "user_not_found" };
  return { ok: true, user: updated };
}

export type SetUserNeverDisableResult =
  | { ok: true; user: EtrUser }
  | { ok: false; error: string };

/**
 * 管理员开关「永不禁用」：课表/抽完等定时启禁跳过该账号。
 * 管理员账号本身已硬排除，此处仍禁止改（避免误操作）。
 */
export async function setUserNeverDisable(
  db: D1Database,
  userId: number,
  neverDisable: boolean
): Promise<SetUserNeverDisableResult> {
  const user = await findUserById(db, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.role === "admin") return { ok: false, error: "cannot_edit_admin" };

  const flag = neverDisable ? 1 : 0;

  if (etrAuthDbState.devAuthEnabled) {
    const row = etrAuthDbState.devUsers.find((u) => u.id === userId);
    if (!row) return { ok: false, error: "user_not_found" };
    row.never_disable = flag;
    const { password_hash: _, ...publicUser } = row;
    return { ok: true, user: publicUser };
  }

  await ensureEtrUsersSchema(db);
  await db
    .prepare(`UPDATE etr_users SET never_disable = ?1 WHERE id = ?2`)
    .bind(flag, userId)
    .run();

  const updated = await findUserById(db, userId);
  if (!updated) return { ok: false, error: "user_not_found" };
  return { ok: true, user: updated };
}

export type DeleteUserByAdminResult =
  | { ok: true; username: string }
  | { ok: false; error: string };

/** 管理员删除用户（同时清除会话与登录链接） */
export async function deleteUserByAdmin(
  db: D1Database,
  userId: number,
  actorUserId: number
): Promise<DeleteUserByAdminResult> {
  if (userId === actorUserId) {
    return { ok: false, error: "cannot_delete_self" };
  }

  const user = await findUserById(db, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.role === "admin") return { ok: false, error: "cannot_delete_admin" };

  const username = user.username;
  const { deleteUserLoginLinks } = await import("../etr-login-link-db");

  if (etrAuthDbState.devAuthEnabled) {
    const idx = etrAuthDbState.devUsers.findIndex((u) => u.id === userId);
    if (idx < 0) return { ok: false, error: "user_not_found" };
    await revokeUserSessions(db, userId);
    await deleteUserLoginLinks(db, userId);
    etrAuthDbState.devUsers.splice(idx, 1);
    return { ok: true, username };
  }

  await revokeUserSessions(db, userId);
  await deleteUserLoginLinks(db, userId);
  const result = await db
    .prepare(`DELETE FROM etr_users WHERE id = ?1`)
    .bind(userId)
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "user_not_found" };
  }

  return { ok: true, username };
}

export type CreateUserByAdminResult =
  | { ok: true; user: EtrUser }
  | { ok: false; error: string };

export type CreateUserByAdminOptions = {
  /** 1 = 已禁用，默认 0 */
  disabled?: boolean;
};

/** 管理员在后台创建用户（不自动登录） */
export async function createUserByAdmin(
  env: CloudflareEnv,
  username: string,
  password: string,
  role: EtrUserRole,
  options?: CreateUserByAdminOptions
): Promise<CreateUserByAdminResult> {
  await ensureBootstrapUsers(env);

  if (role === "admin") return { ok: false, error: "cannot_create_admin" };
  if (
    role !== "user" &&
    role !== "jp_vocab" &&
    role !== "en_vocab" &&
    role !== "ko_pron"
  ) {
    return { ok: false, error: "role_invalid" };
  }

  const name = normalizeUsername(username);
  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;

  if (!isValidUsername(name)) return { ok: false, error: "username_invalid" };
  if (isReservedUsername(name, adminName, jpVocabName, jpVocabUser1Name)) {
    return { ok: false, error: "username_reserved" };
  }
  if (password.length < 6) return { ok: false, error: "password_too_short" };

  const existing = await findUserByUsername(env.DB, name);
  if (existing) return { ok: false, error: "username_taken" };

  const { salt, hash } = await hashPassword(password);
  const ts = nowIso();
  const disabledFlag = options?.disabled ? 1 : 0;

  if (etrAuthDbState.devAuthEnabled) {
    const created: DevUser = {
      id: etrAuthDbState.devUserIdSeq++,
      username: name,
      password_hash: encodePasswordStorage(salt, hash),
      role,
      disabled: disabledFlag,
      last_login_at: null,
      last_login_ip: null,
      created_at: ts,
    };
    etrAuthDbState.devUsers.push(created);
    const { password_hash: _, ...user } = created;
    return { ok: true, user };
  }

  await ensureEtrUsersSchema(env.DB);

  const result = await env.DB
    .prepare(
      `INSERT INTO etr_users (username, password_hash, role, disabled, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
    .bind(name, encodePasswordStorage(salt, hash), role, disabledFlag, ts)
    .run();

  const userId = Number(result.meta?.last_row_id ?? 0);
  if (!userId) return { ok: false, error: "create_failed" };

  const user = await findUserById(env.DB, userId);
  if (!user) return { ok: false, error: "create_failed" };
  return { ok: true, user };
}

export type UpdateUserByAdminInput = {
  username?: string;
  password?: string;
  role?: EtrUserRole;
};

export type UpdateUserByAdminResult = CreateUserByAdminResult;

/** 管理员编辑用户（用户名 / 密码 / 角色） */
export async function updateUserByAdmin(
  env: CloudflareEnv,
  userId: number,
  input: UpdateUserByAdminInput
): Promise<UpdateUserByAdminResult> {
  await ensureBootstrapUsers(env);

  const user = await findUserById(env.DB, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.role === "admin") return { ok: false, error: "cannot_edit_admin" };

  const hasUsername = input.username !== undefined;
  const hasPassword =
    typeof input.password === "string" && input.password.length > 0;
  const hasRole = input.role !== undefined;

  if (!hasUsername && !hasPassword && !hasRole) {
    return { ok: true, user };
  }

  const nextRole = (hasRole ? input.role : user.role) as EtrUserRole;
  if (nextRole === "admin") return { ok: false, error: "cannot_create_admin" };
  if (
    nextRole !== "user" &&
    nextRole !== "jp_vocab" &&
    nextRole !== "en_vocab" &&
    nextRole !== "ko_pron"
  ) {
    return { ok: false, error: "role_invalid" };
  }

  const name = hasUsername ? normalizeUsername(input.username!) : user.username;
  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;

  if (!isValidUsername(name)) return { ok: false, error: "username_invalid" };

  const currentIsBootstrap = isReservedUsername(
    user.username,
    adminName,
    jpVocabName,
    jpVocabUser1Name
  );
  const nameLower = name.toLowerCase();
  const currentLower = user.username.toLowerCase();
  // 保留账号（Admin/LiLaoshi/user1）可改密码/角色，不可改用户名；也不可把别人改成保留名
  if (currentIsBootstrap && nameLower !== currentLower) {
    return { ok: false, error: "cannot_rename_bootstrap" };
  }
  if (!currentIsBootstrap && isReservedUsername(name, adminName, jpVocabName, jpVocabUser1Name)) {
    return { ok: false, error: "username_reserved" };
  }

  if (nameLower !== currentLower) {
    const existing = await findUserByUsername(env.DB, name);
    if (existing && existing.id !== userId) {
      return { ok: false, error: "username_taken" };
    }
  }

  let passwordHash: string | undefined;
  if (hasPassword) {
    const password = input.password!;
    if (password.length < 6) return { ok: false, error: "password_too_short" };
    const { salt, hash } = await hashPassword(password);
    passwordHash = encodePasswordStorage(salt, hash);
    await revokeUserSessions(env.DB, userId);
  }

  if (etrAuthDbState.devAuthEnabled) {
    const row = etrAuthDbState.devUsers.find((u) => u.id === userId);
    if (!row) return { ok: false, error: "user_not_found" };
    row.username = name;
    row.role = nextRole;
    if (passwordHash) row.password_hash = passwordHash;
    const { password_hash: _, ...publicUser } = row;
    return { ok: true, user: publicUser };
  }

  if (passwordHash) {
    await env.DB
      .prepare(
        `UPDATE etr_users SET username = ?1, role = ?2, password_hash = ?3 WHERE id = ?4`
      )
      .bind(name, nextRole, passwordHash, userId)
      .run();
  } else {
    await env.DB
      .prepare(`UPDATE etr_users SET username = ?1, role = ?2 WHERE id = ?3`)
      .bind(name, nextRole, userId)
      .run();
  }

  const updated = await findUserById(env.DB, userId);
  if (!updated) return { ok: false, error: "user_not_found" };
  return { ok: true, user: updated };
}

export function generateAdminResetPassword(minLength: number): string {
  const chars =
    "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const length = Math.max(minLength, 12);
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function generateMemorableTeacherPassword(minLength: number): string {
  const wordsA = [
    "sun",
    "rain",
    "lake",
    "star",
    "moon",
    "leaf",
    "wind",
    "snow",
  ];
  const wordsB = [
    "class",
    "study",
    "note",
    "speak",
    "learn",
    "focus",
    "review",
    "lesson",
  ];
  const pick = (items: string[]) => items[Math.floor(Math.random() * items.length)];
  const digits = String(Math.floor(Math.random() * 90) + 10);
  const base = `${pick(wordsA)}${pick(wordsB)}${digits}`;
  if (base.length >= minLength) return base;
  return `${base}${"x".repeat(minLength - base.length)}`;
}

export type ResetUserPasswordByAdminResult =
  | { ok: true; user: EtrUser; password: string }
  | { ok: false; error: string };

/** 管理员重置用户密码并返回明文（仅本次响应，供复制账号密码） */
export async function resetUserPasswordByAdmin(
  env: CloudflareEnv,
  userId: number
): Promise<ResetUserPasswordByAdminResult> {
  await ensureBootstrapUsers(env);

  const user = await findUserById(env.DB, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.role === "admin") return { ok: false, error: "cannot_edit_admin" };

  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;
  // 李老师 / user1 等 bootstrap 账号禁止一键随机重置（否则别人一直用的密码会失效）
  if (isReservedUsername(user.username, adminName, jpVocabName, jpVocabUser1Name)) {
    return { ok: false, error: "cannot_reset_bootstrap" };
  }

  const password = generateAdminResetPassword(6);
  const { salt, hash } = await hashPassword(password);
  const passwordHash = encodePasswordStorage(salt, hash);

  if (etrAuthDbState.devAuthEnabled) {
    const row = etrAuthDbState.devUsers.find((u) => u.id === userId);
    if (!row) return { ok: false, error: "user_not_found" };
    row.password_hash = passwordHash;
    const { password_hash: _, ...publicUser } = row;
    return { ok: true, user: publicUser, password };
  }

  await revokeUserSessions(env.DB, userId);
  await env.DB
    .prepare(`UPDATE etr_users SET password_hash = ?1 WHERE id = ?2`)
    .bind(passwordHash, userId)
    .run();

  const updated = await findUserById(env.DB, userId);
  if (!updated) return { ok: false, error: "user_not_found" };
  return { ok: true, user: updated, password };
}
