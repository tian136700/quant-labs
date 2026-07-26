import "server-only";

import { etrAuthDbState, nowIso } from "./state";

export type EtrUserLoginHistoryRow = {
  id: number;
  user_id: number;
  login_at: string;
  login_ip: string | null;
};

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;

let loginHistorySchemaReady = false;

export async function ensureEtrUserLoginHistorySchema(
  db: D1Database
): Promise<void> {
  if (etrAuthDbState.devAuthEnabled || loginHistorySchemaReady) return;

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_user_login_history (
         id        INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id   INTEGER NOT NULL,
         login_at  TEXT    NOT NULL,
         login_ip  TEXT,
         FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_user_login_history_user_at
       ON etr_user_login_history (user_id, login_at DESC, id DESC)`
    )
    .run();

  // 已有 last_login_* 的用户补一条历史，避免上线后列表空白
  await db
    .prepare(
      `INSERT INTO etr_user_login_history (user_id, login_at, login_ip)
       SELECT u.id, u.last_login_at, u.last_login_ip
       FROM etr_users u
       WHERE u.last_login_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM etr_user_login_history h WHERE h.user_id = u.id
         )`
    )
    .run();

  loginHistorySchemaReady = true;
}

/** 每次成功登录追加一条（与 etr_users.last_login_* 同步写入） */
export async function recordUserLoginHistory(
  db: D1Database,
  userId: number,
  loginAt: string,
  loginIp: string | null
): Promise<void> {
  if (etrAuthDbState.devAuthEnabled) {
    const id = etrAuthDbState.devLoginHistoryIdSeq++;
    etrAuthDbState.devLoginHistory.push({
      id,
      user_id: userId,
      login_at: loginAt,
      login_ip: loginIp,
    });
    return;
  }

  await ensureEtrUserLoginHistorySchema(db);
  await db
    .prepare(
      `INSERT INTO etr_user_login_history (user_id, login_at, login_ip)
       VALUES (?1, ?2, ?3)`
    )
    .bind(userId, loginAt || nowIso(), loginIp)
    .run();
}

export async function listUserLoginHistory(
  db: D1Database,
  userId: number,
  limit = DEFAULT_LIST_LIMIT
): Promise<EtrUserLoginHistoryRow[]> {
  const capped = Math.min(
    MAX_LIST_LIMIT,
    Math.max(1, Math.floor(Number.isFinite(limit) ? limit : DEFAULT_LIST_LIMIT))
  );

  if (etrAuthDbState.devAuthEnabled) {
    return etrAuthDbState.devLoginHistory
      .filter((row) => row.user_id === userId)
      .sort((a, b) => {
        if (a.login_at === b.login_at) return b.id - a.id;
        return a.login_at < b.login_at ? 1 : -1;
      })
      .slice(0, capped);
  }

  await ensureEtrUserLoginHistorySchema(db);
  const result = await db
    .prepare(
      `SELECT id, user_id, login_at, login_ip
       FROM etr_user_login_history
       WHERE user_id = ?1
       ORDER BY login_at DESC, id DESC
       LIMIT ?2`
    )
    .bind(userId, capped)
    .all<EtrUserLoginHistoryRow>();

  return (result.results ?? []).map((row) => ({
    id: Number(row.id),
    user_id: Number(row.user_id),
    login_at: row.login_at,
    login_ip: row.login_ip ?? null,
  }));
}
