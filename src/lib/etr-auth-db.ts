import {
  encodePasswordStorage,
  hashPassword,
  isReservedUsername,
  isValidUsername,
  newSessionToken,
  normalizeUsername,
  resolveAdminBootstrap,
  resolveJpVocabBootstrap,
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

let devAuthEnabled = false;
const devUsers: DevUser[] = [];
const devSessions: DevSession[] = [];
let devUserIdSeq = 1;

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
      created_at: nowIso(),
    });
    return;
  }

  const row = await db
    .prepare(
      `SELECT id FROM etr_users WHERE username = ?1 COLLATE NOCASE LIMIT 1`
    )
    .bind(username)
    .first<{ id: number }>();

  if (row?.id) {
    const existing = await findUserByUsername(db, username);
    if (existing) {
      const valid = await verifyPassword(password, existing.password_hash);
      if (!valid) {
        const { salt, hash } = await hashPassword(password);
        await db
          .prepare(`UPDATE etr_users SET password_hash = ?1 WHERE id = ?2`)
          .bind(encodePasswordStorage(salt, hash), existing.id)
          .run();
      }
    }
    return;
  }

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
  const bootstrap = resolveJpVocabBootstrap(env);
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
      created_at: nowIso(),
    });
    return;
  }

  const row = await db
    .prepare(
      `SELECT id, role FROM etr_users WHERE username = ?1 COLLATE NOCASE LIMIT 1`
    )
    .bind(username)
    .first<{ id: number; role: string }>();

  if (row?.id) {
    const existing = await findUserByUsername(db, username);
    if (existing) {
      if (existing.role !== "jp_vocab") {
        await db
          .prepare(`UPDATE etr_users SET role = 'jp_vocab' WHERE id = ?1`)
          .bind(existing.id)
          .run();
      }
      const valid = await verifyPassword(password, existing.password_hash);
      if (!valid) {
        const { salt, hash } = await hashPassword(password);
        await db
          .prepare(`UPDATE etr_users SET password_hash = ?1 WHERE id = ?2`)
          .bind(encodePasswordStorage(salt, hash), existing.id)
          .run();
      }
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
  await ensureDefaultAdminUser(env);
  await ensureJpVocabTeacherUser(env);
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
        `SELECT id, username, password_hash, role, created_at
         FROM etr_users WHERE username = ?1 COLLATE NOCASE LIMIT 1`
      )
      .bind(name)
      .first<EtrUser & { password_hash: string }>()) ?? null
  );
}

async function findUserById(db: D1Database, userId: number): Promise<EtrUser | null> {
  if (devAuthEnabled) {
    const u = devUsers.find((x) => x.id === userId);
    if (!u) return null;
    const { password_hash: _, ...rest } = u;
    return rest;
  }

  return (
    (await db
      .prepare(
        `SELECT id, username, role, created_at FROM etr_users WHERE id = ?1 LIMIT 1`
      )
      .bind(userId)
      .first<EtrUser>()) ?? null
  );
}

export type AuthResult =
  | { ok: true; user: EtrUser; token: string; expires_at: string }
  | { ok: false; error: string };

export async function loginUser(
  env: CloudflareEnv,
  username: string,
  password: string
): Promise<AuthResult> {
  await ensureBootstrapUsers(env);

  const user = await findUserByUsername(env.DB, username);
  if (!user) return { ok: false, error: "invalid_credentials" };

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return { ok: false, error: "invalid_credentials" };

  return createSession(env.DB, user);
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
  if (!isValidUsername(name)) return { ok: false, error: "username_invalid" };
  if (isReservedUsername(name, adminName, jpVocabName))
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
      created_at: ts,
    };
    devUsers.push(created);
    const { password_hash: _, ...user } = created;
    return createSession(env.DB, { ...user, password_hash: created.password_hash });
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

  return createSession(env.DB, { ...user, password_hash: encodePasswordStorage(salt, hash) });
}

async function createSession(
  db: D1Database,
  user: EtrUser & { password_hash: string }
): Promise<AuthResult> {
  const token = newSessionToken();
  const expiresAt = expiresIso(sessionTtlMs(user.role as EtrUserRole));
  const ts = nowIso();
  const { password_hash: _, ...publicUser } = user;

  if (devAuthEnabled) {
    devSessions.push({
      token,
      user_id: user.id,
      expires_at: expiresAt,
      created_at: ts,
    });
    return { ok: true, user: publicUser, token, expires_at: expiresAt };
  }

  await db
    .prepare(
      `INSERT INTO etr_sessions (token, user_id, expires_at, created_at)
       VALUES (?1, ?2, ?3, ?4)`
    )
    .bind(token, user.id, expiresAt, ts)
    .run();

  return { ok: true, user: publicUser, token, expires_at: expiresAt };
}

export async function getSessionUser(
  env: CloudflareEnv,
  token: string | null | undefined
): Promise<EtrSessionUser | null> {
  if (!token) return null;
  await ensureBootstrapUsers(env);

  const db = env.DB;

  if (devAuthEnabled) {
    const session = devSessions.find((s) => s.token === token);
    if (!session || isExpired(session.expires_at)) {
      if (session) {
        const idx = devSessions.indexOf(session);
        if (idx >= 0) devSessions.splice(idx, 1);
      }
      return null;
    }
    const user = devUsers.find((u) => u.id === session.user_id);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      created_at: user.created_at,
      expires_at: session.expires_at,
    };
  }

  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.role, u.created_at, s.expires_at
       FROM etr_sessions s
       JOIN etr_users u ON u.id = s.user_id
       WHERE s.token = ?1
       LIMIT 1`
    )
    .bind(token)
    .first<EtrSessionUser>();

  if (!row || isExpired(row.expires_at)) {
    if (row) {
      await db.prepare(`DELETE FROM etr_sessions WHERE token = ?1`).bind(token).run();
    }
    return null;
  }

  return row;
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
