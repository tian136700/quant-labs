import {
  ETR_LOGIN_LINK_PERMANENT_EXPIRES_AT,
  ETR_LOGIN_LINK_SESSION_MS,
} from "./etr-auth";
import {
  createSessionForUser,
  findUserById,
  revokeUserSessions,
  type AuthResult,
} from "./etr-auth-db";
import {
  newLoginLinkSlug,
  normalizeLoginLinkToken,
} from "./login-link-slug";
import type { CloudflareEnv } from "./types";

type LoginLinkRow = {
  token: string;
  user_id: number;
  link_expires_at: string;
  consumed_at: string | null;
  created_by_admin_id: number;
  created_at: string;
};

let devEnabled = false;
const devLinks: LoginLinkRow[] = [];

export function enableEtrLoginLinkDevStore() {
  devEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function ensureLoginLinkSchema(db: D1Database): Promise<void> {
  if (devEnabled) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_login_links (
        token TEXT NOT NULL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        link_expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_by_admin_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_login_links_user ON etr_login_links (user_id)`
    )
    .run();
}

export type CreateLoginLinkResult =
  | {
      ok: true;
      token: string;
      role: string;
      link_expires_at: string;
      session_days: number;
    }
  | { ok: false; error: string };

async function loginLinkExists(db: D1Database, token: string): Promise<boolean> {
  if (devEnabled) {
    return devLinks.some((item) => item.token === token);
  }
  const row = await db
    .prepare(`SELECT token FROM etr_login_links WHERE token = ?1 LIMIT 1`)
    .bind(token)
    .first<{ token: string }>();
  return Boolean(row?.token);
}

async function allocateLoginLinkToken(db: D1Database): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = newLoginLinkSlug();
    if (!(await loginLinkExists(db, token))) return token;
  }
  return newLoginLinkSlug();
}

export async function createLoginLink(
  db: D1Database,
  userId: number,
  createdByAdminId: number
): Promise<CreateLoginLinkResult> {
  await ensureLoginLinkSchema(db);

  const user = await findUserById(db, userId);
  if (!user) {
    return { ok: false, error: "user_not_found" };
  }
  if ((user.disabled ?? 0) !== 0) {
    return { ok: false, error: "user_disabled" };
  }

  // 每次生成新链接：旧链接与该用户全部会话立即失效（便于换人试用同一账号）
  await deleteUserLoginLinks(db, userId);
  await revokeUserSessions(db, userId);

  const token = await allocateLoginLinkToken(db);
  const linkExpiresAt = ETR_LOGIN_LINK_PERMANENT_EXPIRES_AT;
  const ts = nowIso();

  if (devEnabled) {
    devLinks.push({
      token,
      user_id: userId,
      link_expires_at: linkExpiresAt,
      consumed_at: null,
      created_by_admin_id: createdByAdminId,
      created_at: ts,
    });
  } else {
    await db
      .prepare(
        `INSERT INTO etr_login_links (token, user_id, link_expires_at, created_by_admin_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .bind(token, userId, linkExpiresAt, createdByAdminId, ts)
      .run();
  }

  return {
    ok: true,
    token,
    role: user.role,
    link_expires_at: linkExpiresAt,
    session_days: Math.round(ETR_LOGIN_LINK_SESSION_MS / (24 * 60 * 60 * 1000)),
  };
}

/** 通过永久登录链接创建会话（可重复使用；停用账号后失效） */
export async function consumeLoginLink(
  env: CloudflareEnv,
  token: string,
  loginIp?: string | null
): Promise<AuthResult> {
  const trimmed = normalizeLoginLinkToken(token);
  if (!trimmed) return { ok: false, error: "link_invalid" };

  await ensureLoginLinkSchema(env.DB);

  if (devEnabled) {
    const row = devLinks.find((item) => item.token === trimmed);
    if (!row) return { ok: false, error: "link_invalid" };
    return createSessionForUser(env, row.user_id, ETR_LOGIN_LINK_SESSION_MS, { loginIp });
  }

  const row = await env.DB
    .prepare(
      `SELECT user_id
       FROM etr_login_links
       WHERE token = ?1
       LIMIT 1`
    )
    .bind(trimmed)
    .first<{ user_id: number }>();

  if (!row) return { ok: false, error: "link_invalid" };

  return createSessionForUser(env, row.user_id, ETR_LOGIN_LINK_SESSION_MS, { loginIp });
}

export async function deleteUserLoginLinks(
  db: D1Database,
  userId: number
): Promise<void> {
  if (devEnabled) {
    for (let i = devLinks.length - 1; i >= 0; i -= 1) {
      if (devLinks[i].user_id === userId) devLinks.splice(i, 1);
    }
    return;
  }
  await db.prepare(`DELETE FROM etr_login_links WHERE user_id = ?1`).bind(userId).run();
}
