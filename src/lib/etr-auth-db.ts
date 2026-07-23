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
import { teacherNameToUsername } from "./teacher-name-username";
import type { CloudflareEnv } from "./types";

type DevUser = EtrUser & { password_hash: string };
type DevSession = { token: string; user_id: number; expires_at: string; created_at: string };
type LoginAuditMeta = { loginIp?: string | null };

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
  return new Date().toISOString();
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
  const cols = new Set((info.results ?? []).map((row) => row.name));
  const addColumnIfMissing = async (name: string, sqlType: string) => {
    if (cols.has(name)) return;
    try {
      await db.prepare(`ALTER TABLE etr_users ADD COLUMN ${name} ${sqlType}`).run();
      cols.add(name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate column name/i.test(msg)) {
        cols.add(name);
        return;
      }
      throw err;
    }
  };
  await addColumnIfMissing("disabled", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing("last_login_at", "TEXT");
  await addColumnIfMissing("last_login_ip", "TEXT");
  await addColumnIfMissing("never_disable", "INTEGER NOT NULL DEFAULT 0");
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_users_last_login_at
       ON etr_users (last_login_at DESC, id DESC)`
    )
    .run();
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
      last_login_at: null,
      last_login_ip: null,
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
      last_login_at: null,
      last_login_ip: null,
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
        `SELECT id, username, password_hash, role, disabled, never_disable, created_at
         , last_login_at, last_login_ip
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
        `SELECT id, username, role, disabled, never_disable, created_at, last_login_at, last_login_ip
         FROM etr_users WHERE id = ?1 LIMIT 1`
      )
      .bind(userId)
      .first<EtrUser>()) ?? null
  );
}

async function ensureUserEnabledById(
  db: D1Database,
  userId: number
): Promise<EtrUser | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;

  if (devAuthEnabled) {
    const row = devUsers.find((u) => u.id === userId);
    if (!row) return null;
    row.disabled = 0;
    const { password_hash: _, ...publicUser } = row;
    return publicUser;
  }

  await ensureEtrUsersSchema(db);
  await db
    .prepare(`UPDATE etr_users SET disabled = 0 WHERE id = ?1`)
    .bind(userId)
    .run();
  return findUserById(db, userId);
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
  password: string,
  loginMeta?: LoginAuditMeta
): Promise<AuthResult> {
  await ensureBootstrapUsers(env);

  let user = await findUserByUsername(env.DB, username);
  if (!user) return { ok: false, error: "invalid_credentials" };

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return { ok: false, error: "invalid_credentials" };

  user = await ensureJpVocabTeacherRoleOnLogin(env, user);
  if (isUserDisabled(user)) return { ok: false, error: "maintenance" };
  const { password_hash: _ph, ...publicUser } = user;
  return createSession(env.DB, publicUser, undefined, loginMeta);
}

export async function registerUser(
  env: CloudflareEnv,
  username: string,
  password: string,
  loginMeta?: LoginAuditMeta
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
      last_login_at: null,
      last_login_ip: null,
      created_at: ts,
    };
    devUsers.push(created);
    const { password_hash: _, ...user } = created;
    return createSession(env.DB, user, undefined, loginMeta);
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

  return createSession(env.DB, user, undefined, loginMeta);
}

async function recordUserLogin(
  db: D1Database,
  userId: number,
  loginMeta?: LoginAuditMeta
): Promise<void> {
  const loginAt = nowIso();
  const loginIp = loginMeta?.loginIp?.trim() || null;

  if (devAuthEnabled) {
    const row = devUsers.find((item) => item.id === userId);
    if (!row) return;
    row.last_login_at = loginAt;
    row.last_login_ip = loginIp;
    return;
  }

  await ensureEtrUsersSchema(db);
  await db
    .prepare(
      `UPDATE etr_users
       SET last_login_at = ?1, last_login_ip = ?2
       WHERE id = ?3`
    )
    .bind(loginAt, loginIp, userId)
    .run();
}

async function createSession(
  db: D1Database,
  user: EtrUser,
  ttlMs?: number,
  loginMeta?: LoginAuditMeta
): Promise<AuthResult> {
  const token = newSessionToken();
  const expiresAt = expiresIso(
    ttlMs ?? sessionTtlMs(user.role as EtrUserRole)
  );
  const ts = nowIso();
  await recordUserLogin(db, user.id, loginMeta);

  if (devAuthEnabled) {
    const currentUser = devUsers.find((item) => item.id === user.id);
    devSessions.push({
      token,
      user_id: user.id,
      expires_at: expiresAt,
      created_at: ts,
    });
    return { ok: true, user: currentUser ?? user, token, expires_at: expiresAt };
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
  ttlMs: number,
  loginMeta?: LoginAuditMeta
): Promise<AuthResult> {
  await ensureBootstrapUsers(env);

  const user = await findUserById(env.DB, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (isUserDisabled(user)) return { ok: false, error: "maintenance" };

  return createSession(env.DB, user, ttlMs, loginMeta);
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

/** 同一 Worker isolate 内缓存 session 查询，减轻高频轮询对 D1 的压力 */
const SESSION_LOOKUP_CACHE_MS = 10_000;
const sessionLookupCache = new Map<
  string,
  { at: number; result: SessionLookupResult }
>();

function invalidateSessionLookupCache(token: string) {
  sessionLookupCache.delete(token);
}

async function lookupSession(
  env: CloudflareEnv,
  token: string
): Promise<SessionLookupResult> {
  if (!token) return { kind: "missing" };

  const now = Date.now();
  const cached = sessionLookupCache.get(token);
  if (cached && now - cached.at < SESSION_LOOKUP_CACHE_MS) {
    if (
      cached.result.kind === "valid" &&
      isExpired(cached.result.user.expires_at)
    ) {
      sessionLookupCache.delete(token);
    } else {
      return cached.result;
    }
  }

  const result = await lookupSessionFromDb(env, token);
  if (result.kind === "valid" || result.kind === "maintenance") {
    sessionLookupCache.set(token, { at: now, result });
  } else {
    sessionLookupCache.delete(token);
  }
  return result;
}

async function lookupSessionFromDb(
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
        last_login_at: user.last_login_at ?? null,
        last_login_ip: user.last_login_ip ?? null,
        expires_at: session.expires_at,
      },
    };
  }

  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.role, u.disabled, u.created_at, s.expires_at
         , u.last_login_at, u.last_login_ip
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
      last_login_at: row.last_login_at ?? null,
      last_login_ip: row.last_login_ip ?? null,
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
      `SELECT id, username, role, disabled, never_disable, created_at
         , last_login_at, last_login_ip
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

  if (devAuthEnabled) {
    const row = devUsers.find((u) => u.id === userId);
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
  invalidateSessionLookupCache(token);

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

  if (devAuthEnabled) {
    const created: DevUser = {
      id: devUserIdSeq++,
      username: name,
      password_hash: encodePasswordStorage(salt, hash),
      role,
      disabled: disabledFlag,
      last_login_at: null,
      last_login_ip: null,
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

let userTeacherLinkSchemaEnsured = false;

async function ensureUserTeacherLinkSchema(db: D1Database): Promise<void> {
  if (devAuthEnabled || userTeacherLinkSchemaEnsured) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_user_jp_lesson_teacher_link (
         user_id INTEGER PRIMARY KEY,
         teacher_id INTEGER NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now')),
         FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE,
         FOREIGN KEY (teacher_id) REFERENCES jp_lesson_teacher(id) ON DELETE CASCADE
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_user_jp_lesson_teacher_link_teacher
       ON etr_user_jp_lesson_teacher_link (teacher_id)`
    )
    .run();
  userTeacherLinkSchemaEnsured = true;
}

async function linkUserToJpLessonTeacher(
  db: D1Database,
  userId: number,
  teacherId: number
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  if (!Number.isInteger(teacherId) || teacherId <= 0) return;
  if (devAuthEnabled) return;
  await ensureUserTeacherLinkSchema(db);
  const ts = nowIso();
  // 一位老师只对应一个登录账号：先清掉该老师的其它关联
  await db
    .prepare(
      `DELETE FROM etr_user_jp_lesson_teacher_link
       WHERE teacher_id = ?1 AND user_id != ?2`
    )
    .bind(teacherId, userId)
    .run();
  await db
    .prepare(
      `INSERT INTO etr_user_jp_lesson_teacher_link (user_id, teacher_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(user_id) DO UPDATE SET teacher_id = excluded.teacher_id, updated_at = excluded.updated_at`
    )
    .bind(userId, teacherId, ts)
    .run();
}

export type JpLessonTeacherLinkByUser = {
  teacher_id: number;
  teacher_name: string;
};

export async function listJpLessonTeacherLinkMapByUserId(
  db: D1Database
): Promise<Map<number, JpLessonTeacherLinkByUser>> {
  if (devAuthEnabled) return new Map();
  await ensureUserTeacherLinkSchema(db);
  const result = await db
    .prepare(
      `SELECT link.user_id AS user_id, link.teacher_id AS teacher_id, teacher.name AS teacher_name
       FROM etr_user_jp_lesson_teacher_link link
       JOIN jp_lesson_teacher teacher ON teacher.id = link.teacher_id`
    )
    .all<{ user_id: number; teacher_id: number; teacher_name: string }>();
  const map = new Map<number, JpLessonTeacherLinkByUser>();
  for (const row of result.results ?? []) {
    const userId = Number(row.user_id);
    const teacherId = Number(row.teacher_id);
    if (!Number.isInteger(userId) || userId <= 0) continue;
    if (!Number.isInteger(teacherId) || teacherId <= 0) continue;
    map.set(userId, {
      teacher_id: teacherId,
      teacher_name: String(row.teacher_name ?? "").trim(),
    });
  }
  return map;
}

export async function listJpLessonTeacherNameMapByUserId(
  db: D1Database
): Promise<Map<number, string>> {
  const linkMap = await listJpLessonTeacherLinkMapByUserId(db);
  const map = new Map<number, string>();
  for (const [userId, link] of linkMap) {
    map.set(userId, link.teacher_name);
  }
  return map;
}

export type SetUserJpLessonTeacherLinkResult =
  | { ok: true; teacher_id: number | null; teacher_name: string | null }
  | { ok: false; error: "user_not_found" | "teacher_not_found" };

/** 设置/清除用户与日语上课老师的关联（一位老师最多对应一个账号）。 */
export async function setUserJpLessonTeacherLink(
  db: D1Database,
  userId: number,
  teacherId: number | null
): Promise<SetUserJpLessonTeacherLinkResult> {
  if (!Number.isInteger(userId) || userId <= 0) {
    return { ok: false, error: "user_not_found" };
  }
  if (devAuthEnabled) {
    return { ok: true, teacher_id: teacherId, teacher_name: null };
  }

  const user = await findUserById(db, userId);
  if (!user) return { ok: false, error: "user_not_found" };

  await ensureUserTeacherLinkSchema(db);

  if (teacherId == null) {
    await db
      .prepare(`DELETE FROM etr_user_jp_lesson_teacher_link WHERE user_id = ?1`)
      .bind(userId)
      .run();
    return { ok: true, teacher_id: null, teacher_name: null };
  }

  if (!Number.isInteger(teacherId) || teacherId <= 0) {
    return { ok: false, error: "teacher_not_found" };
  }

  const teacher = await db
    .prepare(`SELECT id, name FROM jp_lesson_teacher WHERE id = ?1 LIMIT 1`)
    .bind(teacherId)
    .first<{ id: number; name: string }>();
  if (!teacher) return { ok: false, error: "teacher_not_found" };

  await linkUserToJpLessonTeacher(db, userId, teacherId);
  return {
    ok: true,
    teacher_id: Number(teacher.id),
    teacher_name: String(teacher.name ?? "").trim() || null,
  };
}

export type JpLessonTeacherUserLink = {
  user_id: number;
  username: string;
};

export async function findJpLessonTeacherUserLink(
  db: D1Database,
  teacherId: number
): Promise<JpLessonTeacherUserLink | null> {
  if (!Number.isInteger(teacherId) || teacherId <= 0) return null;
  if (devAuthEnabled) return null;
  await ensureUserTeacherLinkSchema(db);
  const row = await db
    .prepare(
      `SELECT link.user_id AS user_id, u.username AS username
       FROM etr_user_jp_lesson_teacher_link link
       JOIN etr_users u ON u.id = link.user_id
       WHERE link.teacher_id = ?1
       LIMIT 1`
    )
    .bind(teacherId)
    .first<{ user_id: number; username: string }>();
  if (!row) return null;
  const userId = Number(row.user_id);
  const username = String(row.username ?? "").trim();
  if (!Number.isInteger(userId) || userId <= 0 || !username) return null;
  return { user_id: userId, username };
}

export async function listJpLessonTeacherUserLinkMapByTeacherId(
  db: D1Database
): Promise<Map<number, JpLessonTeacherUserLink>> {
  if (devAuthEnabled) return new Map();
  await ensureUserTeacherLinkSchema(db);
  const result = await db
    .prepare(
      `SELECT link.teacher_id AS teacher_id, link.user_id AS user_id, u.username AS username
       FROM etr_user_jp_lesson_teacher_link link
       JOIN etr_users u ON u.id = link.user_id`
    )
    .all<{ teacher_id: number; user_id: number; username: string }>();
  const map = new Map<number, JpLessonTeacherUserLink>();
  for (const row of result.results ?? []) {
    const teacherId = Number(row.teacher_id);
    const userId = Number(row.user_id);
    const username = String(row.username ?? "").trim();
    if (!Number.isInteger(teacherId) || teacherId <= 0) continue;
    if (!Number.isInteger(userId) || userId <= 0 || !username) continue;
    map.set(teacherId, { user_id: userId, username });
  }
  return map;
}

export type EnsureJpLessonTeacherUserAccountResult =
  | { ok: true; created: boolean; user: EtrUser; password?: string }
  | { ok: false; error: string };

/** 一键为日语上课老师创建/关联 jp_vocab 账号（用户名拼音 + 易记密码） */
export async function ensureJpLessonTeacherUserAccount(
  env: CloudflareEnv,
  teacherId: number,
  teacherName: string
): Promise<EnsureJpLessonTeacherUserAccountResult> {
  const existingLink = await findJpLessonTeacherUserLink(env.DB, teacherId);
  if (existingLink) {
    const user = await ensureUserEnabledById(env.DB, existingLink.user_id);
    if (user) return { ok: true, created: false, user };
  }

  const provision = await createJpLessonTeacherUserByReview(
    env,
    teacherId,
    teacherName
  );
  if (provision.ok && provision.created) {
    return {
      ok: true,
      created: true,
      user: provision.user,
      password: provision.password,
    };
  }
  if (!provision.ok) {
    return { ok: false, error: provision.error };
  }

  if (provision.reason === "user_exists") {
    const baseUsername = normalizeUsername(teacherNameToUsername(teacherName));
    if (!baseUsername) return { ok: false, error: "username_invalid" };
    const existing = await findUserByUsername(env.DB, baseUsername);
    if (!existing) return { ok: false, error: "user_exists" };
    if (existing.role !== "jp_vocab") {
      return { ok: false, error: "username_taken" };
    }
    await linkUserToJpLessonTeacher(env.DB, existing.id, teacherId);
    const enabled = await ensureUserEnabledById(env.DB, existing.id);
    if (!enabled) return { ok: false, error: "user_not_found" };
    return { ok: true, created: false, user: enabled };
  }

  return { ok: false, error: provision.reason ?? "username_unavailable" };
}

/** 添加日语上课老师时，自动创建禁用的 jp_vocab 账号（用户名取自横杠前的称呼拼音） */
export async function provisionJpLessonTeacherUser(
  env: CloudflareEnv,
  teacherName: string
): Promise<ProvisionJpLessonTeacherUserResult> {
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
    disabled: false,
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

function generateMemorableTeacherPassword(minLength: number): string {
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

export type CreateJpLessonTeacherUserByReviewResult =
  | { ok: true; created: true; user: EtrUser; password: string }
  | { ok: true; created: false; reason: "user_exists" | "username_unavailable" }
  | { ok: false; error: string };

/** 老师打分后按勾选创建日语账号，并写入老师-用户映射 */
export async function createJpLessonTeacherUserByReview(
  env: CloudflareEnv,
  teacherId: number,
  teacherName: string
): Promise<CreateJpLessonTeacherUserByReviewResult> {
  let baseUsername: string;
  try {
    baseUsername = teacherNameToUsername(teacherName);
  } catch {
    return { ok: false, error: "username_invalid" };
  }
  if (!baseUsername) return { ok: false, error: "username_invalid" };

  await ensureBootstrapUsers(env);

  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;

  const candidates = [baseUsername];
  for (let i = 2; i <= 99; i += 1) candidates.push(`${baseUsername}${i}`);

  let chosen: string | null = null;
  for (const candidate of candidates) {
    const username = normalizeUsername(candidate);
    if (!isValidUsername(username)) continue;
    if (isReservedUsername(username, adminName, jpVocabName, jpVocabUser1Name)) continue;
    const existing = await findUserByUsername(env.DB, username);
    if (existing) {
      if (candidate === baseUsername) return { ok: true, created: false, reason: "user_exists" };
      continue;
    }
    chosen = username;
    break;
  }

  if (!chosen) return { ok: true, created: false, reason: "username_unavailable" };

  const password = generateMemorableTeacherPassword(10);
  const created = await createUserByAdmin(env, chosen, password, "jp_vocab");
  if (!created.ok) {
    if (created.error === "username_taken") {
      return { ok: true, created: false, reason: "user_exists" };
    }
    return { ok: false, error: created.error };
  }

  await linkUserToJpLessonTeacher(env.DB, created.user.id, teacherId);
  const enabled = await ensureUserEnabledById(env.DB, created.user.id);
  if (!enabled) return { ok: false, error: "user_not_found" };
  return { ok: true, created: true, user: enabled, password };
}

let userKoTeacherLinkSchemaEnsured = false;

async function ensureUserKoTeacherLinkSchema(db: D1Database): Promise<void> {
  if (devAuthEnabled || userKoTeacherLinkSchemaEnsured) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_user_ko_lesson_teacher_link (
         user_id INTEGER PRIMARY KEY,
         teacher_id INTEGER NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now')),
         FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_user_ko_lesson_teacher_link_teacher
       ON etr_user_ko_lesson_teacher_link (teacher_id)`
    )
    .run();
  userKoTeacherLinkSchemaEnsured = true;
}

async function linkUserToKoLessonTeacher(
  db: D1Database,
  userId: number,
  teacherId: number
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  if (!Number.isInteger(teacherId) || teacherId <= 0) return;
  if (devAuthEnabled) return;
  await ensureUserKoTeacherLinkSchema(db);
  const ts = nowIso();
  await db
    .prepare(
      `DELETE FROM etr_user_ko_lesson_teacher_link
       WHERE teacher_id = ?1 AND user_id != ?2`
    )
    .bind(teacherId, userId)
    .run();
  await db
    .prepare(
      `INSERT INTO etr_user_ko_lesson_teacher_link (user_id, teacher_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(user_id) DO UPDATE SET teacher_id = excluded.teacher_id, updated_at = excluded.updated_at`
    )
    .bind(userId, teacherId, ts)
    .run();
}

export type KoLessonTeacherUserLink = {
  user_id: number;
  username: string;
  teacher_id: number;
};

export async function findKoLessonTeacherUserLink(
  db: D1Database,
  teacherId: number
): Promise<KoLessonTeacherUserLink | null> {
  if (devAuthEnabled) return null;
  if (!Number.isInteger(teacherId) || teacherId <= 0) return null;
  await ensureUserKoTeacherLinkSchema(db);
  const row = await db
    .prepare(
      `SELECT link.user_id AS user_id, u.username AS username, link.teacher_id AS teacher_id
       FROM etr_user_ko_lesson_teacher_link link
       INNER JOIN etr_users u ON u.id = link.user_id
       WHERE link.teacher_id = ?1`
    )
    .bind(teacherId)
    .first<KoLessonTeacherUserLink>();
  return row ?? null;
}

export async function listKoLessonTeacherUserLinkMapByTeacherId(
  db: D1Database
): Promise<Map<number, KoLessonTeacherUserLink>> {
  if (devAuthEnabled) return new Map();
  await ensureUserKoTeacherLinkSchema(db);
  const result = await db
    .prepare(
      `SELECT link.user_id AS user_id, u.username AS username, link.teacher_id AS teacher_id
       FROM etr_user_ko_lesson_teacher_link link
       INNER JOIN etr_users u ON u.id = link.user_id`
    )
    .all<KoLessonTeacherUserLink>();
  const map = new Map<number, KoLessonTeacherUserLink>();
  for (const row of result.results ?? []) {
    const teacherId = Number(row.teacher_id);
    if (!Number.isInteger(teacherId) || teacherId <= 0) continue;
    map.set(teacherId, row);
  }
  return map;
}

export type EnsureKoLessonTeacherUserAccountResult =
  | { ok: true; created: boolean; user: EtrUser; password?: string }
  | { ok: false; error: string };

/** 一键为韩语上课老师创建/关联 ko_pron 账号 */
export async function ensureKoLessonTeacherUserAccount(
  env: CloudflareEnv,
  teacherId: number,
  teacherName: string
): Promise<EnsureKoLessonTeacherUserAccountResult> {
  const existingLink = await findKoLessonTeacherUserLink(env.DB, teacherId);
  if (existingLink) {
    const user = await ensureUserEnabledById(env.DB, existingLink.user_id);
    if (user) return { ok: true, created: false, user };
  }

  const provision = await createKoLessonTeacherUserByReview(
    env,
    teacherId,
    teacherName
  );
  if (provision.ok && provision.created) {
    return {
      ok: true,
      created: true,
      user: provision.user,
      password: provision.password,
    };
  }
  if (!provision.ok) {
    return { ok: false, error: provision.error };
  }

  if (provision.reason === "user_exists") {
    const baseUsername = normalizeUsername(teacherNameToUsername(teacherName));
    if (!baseUsername) return { ok: false, error: "username_invalid" };
    const existing = await findUserByUsername(env.DB, baseUsername);
    if (!existing) return { ok: false, error: "user_exists" };
    if (existing.role !== "ko_pron") {
      return { ok: false, error: "username_taken" };
    }
    await linkUserToKoLessonTeacher(env.DB, existing.id, teacherId);
    const enabled = await ensureUserEnabledById(env.DB, existing.id);
    if (!enabled) return { ok: false, error: "user_not_found" };
    return { ok: true, created: false, user: enabled };
  }

  return { ok: false, error: provision.reason ?? "username_unavailable" };
}

export type CreateKoLessonTeacherUserByReviewResult =
  | { ok: true; created: true; user: EtrUser; password: string }
  | { ok: true; created: false; reason: "user_exists" | "username_unavailable" }
  | { ok: false; error: string };

/** 为韩语老师创建 ko_pron 账号并写入老师-用户映射 */
export async function createKoLessonTeacherUserByReview(
  env: CloudflareEnv,
  teacherId: number,
  teacherName: string
): Promise<CreateKoLessonTeacherUserByReviewResult> {
  let baseUsername: string;
  try {
    baseUsername = teacherNameToUsername(teacherName);
  } catch {
    return { ok: false, error: "username_invalid" };
  }
  if (!baseUsername) return { ok: false, error: "username_invalid" };

  await ensureBootstrapUsers(env);

  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;

  const candidates = [baseUsername];
  for (let i = 2; i <= 99; i += 1) candidates.push(`${baseUsername}${i}`);

  let chosen: string | null = null;
  for (const candidate of candidates) {
    const username = normalizeUsername(candidate);
    if (!isValidUsername(username)) continue;
    if (isReservedUsername(username, adminName, jpVocabName, jpVocabUser1Name)) continue;
    const existing = await findUserByUsername(env.DB, username);
    if (existing) {
      if (candidate === baseUsername) return { ok: true, created: false, reason: "user_exists" };
      continue;
    }
    chosen = username;
    break;
  }

  if (!chosen) return { ok: true, created: false, reason: "username_unavailable" };

  const password = generateMemorableTeacherPassword(10);
  const created = await createUserByAdmin(env, chosen, password, "ko_pron");
  if (!created.ok) {
    if (created.error === "username_taken") {
      return { ok: true, created: false, reason: "user_exists" };
    }
    return { ok: false, error: created.error };
  }

  await linkUserToKoLessonTeacher(env.DB, created.user.id, teacherId);
  const enabled = await ensureUserEnabledById(env.DB, created.user.id);
  if (!enabled) return { ok: false, error: "user_not_found" };
  return { ok: true, created: true, user: enabled, password };
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

/** 将环境变量 / Secret 中的 bootstrap 账号写入 D1（仅补建缺失账号，绝不覆盖已有密码） */
export async function syncBootstrapUsersFromEnv(env: CloudflareEnv): Promise<void> {
  await ensureBootstrapUsers(env);
}
