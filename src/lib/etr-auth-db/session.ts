import "server-only";

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
  type EtrSessionUser,
  type EtrUser,
  type EtrUserRole,
} from "../etr-auth";
import type { CloudflareEnv } from "../types";
import { ensureBootstrapUsers } from "./bootstrap";
import { recordUserLoginHistory } from "./login_history";
import { ensureEtrUsersSchema } from "./schema";
import {
  etrAuthDbState,
  expiresIso,
  isExpired,
  isUserDisabled,
  nowIso,
  type AuthSessionResolve,
  type DevUser,
  type LoginAuditMeta,
} from "./state";

export type AuthResult =
  | { ok: true; user: EtrUser; token: string; expires_at: string }
  | { ok: false; error: string };

export async function findUserByUsername(
  db: D1Database,
  username: string
): Promise<(EtrUser & { password_hash: string }) | null> {
  const name = normalizeUsername(username);
  if (!name) return null;

  if (etrAuthDbState.devAuthEnabled) {
    const u = etrAuthDbState.devUsers.find(
      (x) => x.username.toLowerCase() === name.toLowerCase()
    );
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
  if (etrAuthDbState.devAuthEnabled) {
    const u = etrAuthDbState.devUsers.find((x) => x.id === userId);
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

export async function ensureUserEnabledById(
  db: D1Database,
  userId: number
): Promise<EtrUser | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;

  if (etrAuthDbState.devAuthEnabled) {
    const row = etrAuthDbState.devUsers.find((u) => u.id === userId);
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

async function ensureJpVocabTeacherRoleOnLogin(
  env: CloudflareEnv,
  user: EtrUser & { password_hash: string }
): Promise<EtrUser & { password_hash: string }> {
  const jpName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  if (user.username.toLowerCase() !== jpName.toLowerCase()) return user;
  if (user.role === "jp_vocab") return user;

  if (etrAuthDbState.devAuthEnabled) {
    const row = etrAuthDbState.devUsers.find((u) => u.id === user.id);
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

  if (etrAuthDbState.devAuthEnabled) {
    const created: DevUser = {
      id: etrAuthDbState.devUserIdSeq++,
      username: name,
      password_hash: encodePasswordStorage(salt, hash),
      role: "user",
      disabled: 0,
      last_login_at: null,
      last_login_ip: null,
      created_at: ts,
    };
    etrAuthDbState.devUsers.push(created);
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

  if (etrAuthDbState.devAuthEnabled) {
    const row = etrAuthDbState.devUsers.find((item) => item.id === userId);
    if (!row) return;
    row.last_login_at = loginAt;
    row.last_login_ip = loginIp;
    await recordUserLoginHistory(db, userId, loginAt, loginIp);
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
  await recordUserLoginHistory(db, userId, loginAt, loginIp);
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

  if (etrAuthDbState.devAuthEnabled) {
    const currentUser = etrAuthDbState.devUsers.find((item) => item.id === user.id);
    etrAuthDbState.devSessions.push({
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

  if (etrAuthDbState.devAuthEnabled) {
    const session = etrAuthDbState.devSessions.find((s) => s.token === token);
    if (!session) return { kind: "missing" };
    if (isExpired(session.expires_at)) {
      const idx = etrAuthDbState.devSessions.indexOf(session);
      if (idx >= 0) etrAuthDbState.devSessions.splice(idx, 1);
      return { kind: "expired" };
    }
    const user = etrAuthDbState.devUsers.find((u) => u.id === session.user_id);
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

export async function logoutSession(
  env: CloudflareEnv,
  token: string | null | undefined
): Promise<void> {
  if (!token) return;
  invalidateSessionLookupCache(token);

  if (etrAuthDbState.devAuthEnabled) {
    const idx = etrAuthDbState.devSessions.findIndex((s) => s.token === token);
    if (idx >= 0) etrAuthDbState.devSessions.splice(idx, 1);
    return;
  }

  await env.DB.prepare(`DELETE FROM etr_sessions WHERE token = ?1`).bind(token).run();
}
