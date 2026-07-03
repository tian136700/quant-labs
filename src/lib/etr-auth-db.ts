import {
  ETR_DEFAULT_JP_VOCAB_USER1_USERNAME,
  ETR_DEFAULT_JP_VOCAB_USERNAME,
  encodePasswordStorage,
  hashPassword,
  isReservedUsername,
  isValidUsername,
  newSessionToken,
  normalizeUsername,
  parseAllSessionCookies,
  resolveAdminBootstrap,
  resolveJpVocabBootstrap,
  resolveJpVocabUser1Bootstrap,
  sessionTtlMs,
  verifyPassword,
  type AdminBootstrap,
  type EtrSessionUser,
  type EtrUser,
  type EtrUserRole,
} from "./etr-auth";
import type { CloudflareEnv } from "./types";

type DevUser = EtrUser & { password_hash: string };
type DevSession = { token: string; user_id: number; expires_at: string; created_at: string };

export type AuthSessionResolve =
  | { status: "authenticated"; user: EtrSessionUser }
  | { status: "maintenance" }
  | { status: "anonymous"; staleCookie: boolean };

function isUserDisabled(user: Pick<EtrUser, "disabled"> | null | undefined): boolean {
  return (user?.disabled ?? 0) !== 0;
}

let devAuthEnabled = false;
const devUsers: DevUser[] = [];
const devSessions: DevSession[] = [];
let devUserIdSeq = 1;
/** 同一 Worker 实例内只 bootstrap 一次，避免每次鉴权都跑 PBKDF2 */
let bootstrapUsersDone = false;

export function enableEtrAuthDevStore() {
  devAuthEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function expiresIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

async function ensureEtrUsersSchema(db: D1Database): Promise<void> {
  if (devAuthEnabled) return;
  const info = await db.prepare(`PRAGMA table_info(etr_users)`).all<{ name: string }>();
  const hasDisabled = (info.results ?? []).some((row) => row.name === "disabled");
  if (!hasDisabled) {
    await db
      .prepare(
        `ALTER TABLE etr_users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0`
      )
      .run();
  }
}

export async function ensureDefaultAdminUser(env: CloudflareEnv): Promise<void> {
  const bootstrap = resolveAdminBootstrap(env);
  if (!bootstrap) return;

  const db = env.DB;
  const { username, password } = bootstrap;

  if (devAuthEnabled) {
    const exists = devUsers.some(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    if (exists) return;
    const { salt, hash } = await hashPassword(password);
    devUsers.push({
      id: devUserIdSeq++,
      username,
      password_hash: encodePasswordStorage(salt, hash),
      role: "admin",
      disabled: 0,
      created_at: nowIso(),
    });
    return;
  }

  const row = await db
    .prepare(
      `SELECT id FROM etr_users WHERE username = ?1 LIMIT 1`
    )
    .bind(username)
    .first<{ id: number }>();

  if (row?.id) return;

  const { salt, hash } = await hashPassword(password);
  await db
    .prepare(
      `INSERT INTO etr_users (username, password_hash, role, created_at)
       VALUES (?1, ?2, 'admin', ?3)`
    )
    .bind(username, encodePasswordStorage(salt, hash), nowIso())
    .run();
}

export async function ensureJpVocabTeacherUser(env: CloudflareEnv): Promise<void> {
  await ensureJpVocabRoleUser(env, resolveJpVocabBootstrap(env));
}

export async function ensureJpVocabUser1(env: CloudflareEnv): Promise<void> {
  await ensureJpVocabRoleUser(env, resolveJpVocabUser1Bootstrap(env));
}

async function ensureJpVocabRoleUser(
  env: CloudflareEnv,
  bootstrap: AdminBootstrap | null
): Promise<void> {
  if (!bootstrap) return;

  const db = env.DB;
  const { username, password } = bootstrap;

  if (devAuthEnabled) {
    const existing = devUsers.find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    if (existing) {
      if (existing.role !== "jp_vocab") {
        existing.role = "jp_vocab";
      }
      const valid = await verifyPassword(password, existing.password_hash);
      if (!valid) {
        const { salt, hash } = await hashPassword(password);
        existing.password_hash = encodePasswordStorage(salt, hash);
      }
      return;
    }
    const { salt, hash } = await hashPassword(password);
    devUsers.push({
      id: devUserIdSeq++,
      username,
      password_hash: encodePasswordStorage(salt, hash),
      role: "jp_vocab",
      disabled: 0,
      created_at: nowIso(),
    });
    return;
  }

  const row = await db
    .prepare(
      `SELECT id, role FROM etr_users WHERE username = ?1 LIMIT 1`
    )
    .bind(username)
    .first<{ id: number; role: string }>();

  if (row?.id) {
    if (row.role !== "jp_vocab") {
      await db
        .prepare(`UPDATE etr_users SET role = 'jp_vocab' WHERE id = ?1`)
        .bind(row.id)
        .run();
    }
    return;
  }

  const { salt, hash } = await hashPassword(password);
  await db
    .prepare(
      `INSERT INTO etr_users (username, password_hash, role, created_at)
       VALUES (?1, ?2, 'jp_vocab', ?3)`
    )
    .bind(username, encodePasswordStorage(salt, hash), nowIso())
    .run();
}

async function ensureBootstrapUsers(env: CloudflareEnv): Promise<void> {
  if (bootstrapUsersDone) return;
  if (!devAuthEnabled) {
    await ensureEtrUsersSchema(env.DB);
  }
  await ensureDefaultAdminUser(env);
  await ensureJpVocabTeacherUser(env);
  await ensureJpVocabUser1(env);
  bootstrapUsersDone = true;
}

async function findUserByUsername(
  db: D1Database,
  username: string
): Promise<(EtrUser & { password_hash: string }) | null> {
  const name = normalizeUsername(username);
  if (!name) return null;

  if (devAuthEnabled) {
    const u = devUsers.find((x) => x.username.toLowerCase() === name.toLowerCase());
    return u ?? null;
  }

  return (
    (await db
      .prepare(
        `SELECT id, username, password_hash, role, disabled, created_at
         FROM etr_users WHERE username = ?1 LIMIT 1`
      )
      .bind(name)
      .first<EtrUser & { password_hash: string }>()) ?? null
  );
}

export async function findUserById(db: D1Database, userId: number): Promise<EtrUser | null> {
  if (devAuthEnabled) {
    const u = devUsers.find((x) => x.id === userId);
    if (!u) return null;
    const { password_hash: _, ...rest } = u;
    return rest;
  }

  return (
    (await db
      .prepare(
        `SELECT id, username, role, disabled, created_at FROM etr_users WHERE id = ?1 LIMIT 1`
      )
      .bind(userId)
      .first<EtrUser>()) ?? null
  );
}

export type AuthResult =
  | { ok: true; user: EtrUser; token: string; expires_at: string }
  | { ok: false; error: string };

async function ensureJpVocabTeacherRoleOnLogin(
  env: CloudflareEnv,
  user: EtrUser & { password_hash: string }
): Promise<EtrUser & { password_hash: string }> {
  const jpName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  if (user.username.toLowerCase() !== jpName.toLowerCase()) return user;
  if (user.role === "jp_vocab") return user;

  if (devAuthEnabled) {
    const row = devUsers.find((u) => u.id === user.id);
    if (row) row.role = "jp_vocab";
    return { ...user, role: "jp_vocab" };
  }

  await env.DB
    .prepare(`UPDATE etr_users SET role = 'jp_vocab' WHERE id = ?1`)
    .bind(user.id)
    .run();
  return { ...user, role: "jp_vocab" };
}

export async function loginUser(
  env: CloudflareEnv,
  username: string,
  password: string
): Promise<AuthResult> {
  await ensureBootstrapUsers(env);

  let user = await findUserByUsername(env.DB, username);
  if (!user) return { ok: false, error: "invalid_credentials" };

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return { ok: false, error: "invalid_credentials" };

  user = await ensureJpVocabTeacherRoleOnLogin(env, user);
  if (isUserDisabled(user)) return { ok: false, error: "maintenance" };
  const { password_hash: _ph, ...publicUser } = user;
  return createSession(env.DB, publicUser);
}

export async function registerUser(
  env: CloudflareEnv,
  username: string,
  password: string
): Promise<AuthResult> {
  await ensureBootstrapUsers(env);

  const name = normalizeUsername(username);
  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? "LiLaoshi";
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;
  if (!isValidUsername(name)) return { ok: false, error: "username_invalid" };
  if (isReservedUsername(name, adminName, jpVocabName, jpVocabUser1Name))
    return { ok: false, error: "username_reserved" };
  if (password.length < 6) return { ok: false, error: "password_too_short" };

  const existing = await findUserByUsername(env.DB, name);
  if (existing) return { ok: false, error: "username_taken" };

  const { salt, hash } = await hashPassword(password);
  const ts = nowIso();

  if (devAuthEnabled) {
    const created: DevUser = {
      id: devUserIdSeq++,
      username: name,
      password_hash: encodePasswordStorage(salt, hash),
      role: "user",
      disabled: 0,
      created_at: ts,
    };
    devUsers.push(created);
    const { password_hash: _, ...user } = created;
    return createSession(env.DB, user);
  }

  const result = await env.DB
    .prepare(
      `INSERT INTO etr_users (username, password_hash, role, created_at)
       VALUES (?1, ?2, 'user', ?3)`
    )
    .bind(name, encodePasswordStorage(salt, hash), ts)
    .run();

  const userId = Number(result.meta?.last_row_id ?? 0);
  if (!userId) return { ok: false, error: "register_failed" };

  const user = await findUserById(env.DB, userId);
  if (!user) return { ok: false, error: "register_failed" };

  return createSession(env.DB, user);
}

async function createSession(
  db: D1Database,
  user: EtrUser,
  ttlMs?: number
): Promise<AuthResult> {
  const token = newSessionToken();
  const expiresAt = expiresIso(
    ttlMs ?? sessionTtlMs(user.role as EtrUserRole)
  );
  const ts = nowIso();

  if (devAuthEnabled) {
    devSessions.push({
      token,
      user_id: user.id,
      expires_at: expiresAt,
      created_at: ts,
    });
    return { ok: true, user, token, expires_at: expiresAt };
  }

  await db
    .prepare(
      `INSERT INTO etr_sessions (token, user_id, expires_at, created_at)
       VALUES (?1, ?2, ?3, ?4)`
    )
    .bind(token, user.id, expiresAt, ts)
    .run();

  return { ok: true, user, token, expires_at: expiresAt };
}

export async function createSessionForUser(
  env: CloudflareEnv,
  userId: number,
  ttlMs: number
): Promise<AuthResult> {
  await ensureBootstrapUsers(env);

  const user = await findUserById(env.DB, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (isUserDisabled(user)) return { ok: false, error: "maintenance" };

  return createSession(env.DB, user, ttlMs);
}

export async function getSessionUserFromRequest(
  env: CloudflareEnv,
  cookieHeader: string | null | undefined
): Promise<EtrSessionUser | null> {
  const resolved = await resolveAuthSession(env, cookieHeader);
  if (resolved.status === "authenticated") return resolved.user;
  return null;
}

export async function resolveAuthSession(
  env: CloudflareEnv,
  cookieHeader: string | null | undefined
): Promise<AuthSessionResolve> {
  const tokens = parseAllSessionCookies(cookieHeader ?? null);
  if (!tokens.length) {
    return { status: "anonymous", staleCookie: false };
  }

  let staleCookie = false;
  for (const token of tokens) {
    const result = await lookupSession(env, token);
    if (result.kind === "valid") {
      return { status: "authenticated", user: result.user };
    }
    if (result.kind === "maintenance") {
      return { status: "maintenance" };
    }
    if (result.kind === "expired") staleCookie = true;
  }

  return { status: "anonymous", staleCookie };
}

type SessionLookupResult =
  | { kind: "valid"; user: EtrSessionUser }
  | { kind: "maintenance" }
  | { kind: "expired" }
  | { kind: "missing" };

async function lookupSession(
  env: CloudflareEnv,
  token: string
): Promise<SessionLookupResult> {
  if (!token) return { kind: "missing" };

  const db = env.DB;

  if (devAuthEnabled) {
    const session = devSessions.find((s) => s.token === token);
    if (!session) return { kind: "missing" };
    if (isExpired(session.expires_at)) {
      const idx = devSessions.indexOf(session);
      if (idx >= 0) devSessions.splice(idx, 1);
      return { kind: "expired" };
    }
    const user = devUsers.find((u) => u.id === session.user_id);
    if (!user) return { kind: "missing" };
    if (isUserDisabled(user)) {
      return { kind: "maintenance" };
    }
    return {
      kind: "valid",
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        disabled: user.disabled ?? 0,
        created_at: user.created_at,
        expires_at: session.expires_at,
      },
    };
  }

  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.role, u.disabled, u.created_at, s.expires_at
       FROM etr_sessions s
       JOIN etr_users u ON u.id = s.user_id
       WHERE s.token = ?1
       LIMIT 1`
    )
    .bind(token)
    .first<EtrSessionUser & { disabled: number }>();

  if (!row) return { kind: "missing" };

  if (isExpired(row.expires_at)) {
    await db.prepare(`DELETE FROM etr_sessions WHERE token = ?1`).bind(token).run();
    return { kind: "expired" };
  }

  if (isUserDisabled(row)) {
    return { kind: "maintenance" };
  }

  return {
    kind: "valid",
    user: {
      id: row.id,
      username: row.username,
      role: row.role,
      disabled: row.disabled ?? 0,
      created_at: row.created_at,
      expires_at: row.expires_at,
    },
  };
}

export async function getSessionUser(
  env: CloudflareEnv,
  token: string | null | undefined
): Promise<EtrSessionUser | null> {
  if (!token) return null;
  const result = await lookupSession(env, token);
  if (result.kind === "valid") return result.user;
  return null;
}

export async function listEtrUsers(db: D1Database): Promise<EtrUser[]> {
  if (devAuthEnabled) {
    return devUsers
      .map(({ password_hash: _, ...user }) => user)
      .sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" }));
  }

  await ensureEtrUsersSchema(db);

  const result = await db
    .prepare(
      `SELECT id, username, role, disabled, created_at
       FROM etr_users
       ORDER BY role ASC, username COLLATE NOCASE ASC`
    )
    .all<EtrUser>();

  return result.results ?? [];
}

export async function revokeUserSessions(db: D1Database, userId: number): Promise<void> {
  if (devAuthEnabled) {
    for (let i = devSessions.length - 1; i >= 0; i -= 1) {
      if (devSessions[i].user_id === userId) devSessions.splice(i, 1);
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

  if (devAuthEnabled) {
    const row = devUsers.find((u) => u.id === userId);
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
  const { deleteUserLoginLinks } = await import("./etr-login-link-db");

  if (devAuthEnabled) {
    const idx = devUsers.findIndex((u) => u.id === userId);
    if (idx < 0) return { ok: false, error: "user_not_found" };
    await revokeUserSessions(db, userId);
    await deleteUserLoginLinks(db, userId);
    devUsers.splice(idx, 1);
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

export async function logoutSession(
  env: CloudflareEnv,
  token: string | null | undefined
): Promise<void> {
  if (!token) return;

  if (devAuthEnabled) {
    const idx = devSessions.findIndex((s) => s.token === token);
    if (idx >= 0) devSessions.splice(idx, 1);
    return;
  }

  await env.DB.prepare(`DELETE FROM etr_sessions WHERE token = ?1`).bind(token).run();
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
  if (role !== "user" && role !== "jp_vocab") {
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
  if (role === "jp_vocab" && password.length < 10) {
    return { ok: false, error: "password_too_weak" };
  }

  const existing = await findUserByUsername(env.DB, name);
  if (existing) return { ok: false, error: "username_taken" };

  const { salt, hash } = await hashPassword(password);
  const ts = nowIso();
  const disabledFlag = options?.disabled ? 1 : 0;

  if (devAuthEnabled) {
    const created: DevUser = {
      id: devUserIdSeq++,
      username: name,
      password_hash: encodePasswordStorage(salt, hash),
      role,
      disabled: disabledFlag,
      created_at: ts,
    };
    devUsers.push(created);
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

export type ProvisionJpLessonTeacherUserResult =
  | { ok: true; created: true; user: EtrUser; password: string }
  | { ok: true; created: false; reason: "user_exists" | "username_unavailable" }
  | { ok: false; error: string };

/** 添加日语上课老师时，自动创建禁用的 jp_vocab 账号（用户名取自横杠前的称呼拼音） */
export async function provisionJpLessonTeacherUser(
  env: CloudflareEnv,
  teacherName: string
): Promise<ProvisionJpLessonTeacherUserResult> {
  const { teacherNameToUsername } = await import("./teacher-name-username");
  const baseUsername = teacherNameToUsername(teacherName);
  if (!baseUsername) {
    return { ok: false, error: "username_invalid" };
  }

  await ensureBootstrapUsers(env);

  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;

  const candidates = [baseUsername];
  for (let i = 2; i <= 99; i += 1) {
    candidates.push(`${baseUsername}${i}`);
  }

  let username: string | null = null;
  for (const candidate of candidates) {
    const name = normalizeUsername(candidate);
    if (!isValidUsername(name)) continue;
    if (isReservedUsername(name, adminName, jpVocabName, jpVocabUser1Name)) {
      continue;
    }
    const existing = await findUserByUsername(env.DB, name);
    if (existing) {
      if (candidate === baseUsername) {
        return { ok: true, created: false, reason: "user_exists" };
      }
      continue;
    }
    username = name;
    break;
  }

  if (!username) {
    return { ok: true, created: false, reason: "username_unavailable" };
  }

  const password = generateAdminResetPassword(10);
  const result = await createUserByAdmin(env, username, password, "jp_vocab", {
    disabled: true,
  });
  if (!result.ok) {
    if (result.error === "username_taken") {
      return { ok: true, created: false, reason: "user_exists" };
    }
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    created: true,
    user: result.user,
    password,
  };
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
  if (nextRole !== "user" && nextRole !== "jp_vocab") {
    return { ok: false, error: "role_invalid" };
  }

  const name = hasUsername ? normalizeUsername(input.username!) : user.username;
  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;

  if (!isValidUsername(name)) return { ok: false, error: "username_invalid" };
  if (isReservedUsername(name, adminName, jpVocabName, jpVocabUser1Name)) {
    return { ok: false, error: "username_reserved" };
  }

  if (name.toLowerCase() !== user.username.toLowerCase()) {
    const existing = await findUserByUsername(env.DB, name);
    if (existing && existing.id !== userId) {
      return { ok: false, error: "username_taken" };
    }
  }

  let passwordHash: string | undefined;
  if (hasPassword) {
    const password = input.password!;
    if (password.length < 6) return { ok: false, error: "password_too_short" };
    if (nextRole === "jp_vocab" && password.length < 10) {
      return { ok: false, error: "password_too_weak" };
    }
    const { salt, hash } = await hashPassword(password);
    passwordHash = encodePasswordStorage(salt, hash);
    await revokeUserSessions(env.DB, userId);
  }

  if (devAuthEnabled) {
    const row = devUsers.find((u) => u.id === userId);
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

function generateAdminResetPassword(minLength: number): string {
  const chars =
    "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const length = Math.max(minLength, 12);
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
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

  const minLength = user.role === "jp_vocab" ? 10 : 6;
  const password = generateAdminResetPassword(minLength);
  const { salt, hash } = await hashPassword(password);
  const passwordHash = encodePasswordStorage(salt, hash);

  if (devAuthEnabled) {
    const row = devUsers.find((u) => u.id === userId);
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

/** 将环境变量 / Secret 中的 bootstrap 账号写入 D1（已存在则同步密码） */
export async function syncBootstrapUsersFromEnv(env: CloudflareEnv): Promise<void> {
  await ensureBootstrapUsers(env);
}
