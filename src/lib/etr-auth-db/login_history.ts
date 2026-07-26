import "server-only";

import { ipKey } from "@/lib/client-ip";
import {
  ensureEtrIpGeoCacheSchema,
  getCachedIpGeo,
  type EtrIpGeoCacheRow,
} from "./ip_geo_cache";
import { etrAuthDbState, nowIso } from "./state";

export type EtrUserLoginHistoryRow = {
  id: number;
  user_id: number;
  login_at: string;
  login_ip: string | null;
  /** 登录时从缓存抄上的归属地；新 IP 为空，等 30s 队列查完再回填 */
  geo_region_label?: string | null;
  geo_area?: string | null;
  geo_isp?: string | null;
};

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;

let loginHistorySchemaReady = false;

async function addHistoryColumnIfMissing(
  db: D1Database,
  cols: Set<string>,
  name: string,
  sqlType: string
): Promise<void> {
  if (cols.has(name)) return;
  try {
    await db.prepare(`ALTER TABLE etr_user_login_history ADD COLUMN ${name} ${sqlType}`).run();
    cols.add(name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate column name/i.test(msg)) {
      cols.add(name);
      return;
    }
    throw err;
  }
}

export async function ensureEtrUserLoginHistorySchema(
  db: D1Database
): Promise<void> {
  if (etrAuthDbState.devAuthEnabled || loginHistorySchemaReady) return;

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_user_login_history (
         id                INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id           INTEGER NOT NULL,
         login_at          TEXT    NOT NULL,
         login_ip          TEXT,
         geo_region_label  TEXT,
         geo_area          TEXT,
         geo_isp           TEXT,
         FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE
       )`
    )
    .run();

  const info = await db
    .prepare(`PRAGMA table_info(etr_user_login_history)`)
    .all<{ name: string }>();
  const cols = new Set((info.results ?? []).map((row) => row.name));
  await addHistoryColumnIfMissing(db, cols, "geo_region_label", "TEXT");
  await addHistoryColumnIfMissing(db, cols, "geo_area", "TEXT");
  await addHistoryColumnIfMissing(db, cols, "geo_isp", "TEXT");

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_user_login_history_user_at
       ON etr_user_login_history (user_id, login_at DESC, id DESC)`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_user_login_history_ip
       ON etr_user_login_history (login_ip)`
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_ip_geo_queue (
         ip           TEXT NOT NULL PRIMARY KEY,
         enqueued_at  TEXT NOT NULL
       )`
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

/** 新 IP 入队：等 Mac/定时每 30s 查一次 ip9；已在队或已有成功缓存则不动 */
export async function enqueueLoginIpGeoLookup(
  db: D1Database,
  rawIp: string | null | undefined
): Promise<void> {
  const key = ipKey(rawIp);
  if (!key) return;

  if (etrAuthDbState.devAuthEnabled) {
    if (!etrAuthDbState.devIpGeoQueue.includes(key)) {
      etrAuthDbState.devIpGeoQueue.push(key);
    }
    return;
  }

  await ensureEtrUserLoginHistorySchema(db);
  const cached = await getCachedIpGeo(db, key);
  if (cached?.ok) return;

  await db
    .prepare(
      `INSERT OR IGNORE INTO etr_ip_geo_queue (ip, enqueued_at) VALUES (?1, ?2)`
    )
    .bind(key, nowIso())
    .run();
}

export async function listQueuedLoginIpGeo(
  db: D1Database
): Promise<string[]> {
  if (etrAuthDbState.devAuthEnabled) {
    return [...etrAuthDbState.devIpGeoQueue];
  }
  await ensureEtrUserLoginHistorySchema(db);
  const result = await db
    .prepare(
      `SELECT ip FROM etr_ip_geo_queue ORDER BY enqueued_at ASC, ip ASC`
    )
    .all<{ ip: string }>();
  return (result.results ?? [])
    .map((row) => ipKey(row.ip))
    .filter(Boolean) as string[];
}

export async function dequeueLoginIpGeo(
  db: D1Database,
  rawIp: string
): Promise<void> {
  const key = ipKey(rawIp);
  if (!key) return;
  if (etrAuthDbState.devAuthEnabled) {
    etrAuthDbState.devIpGeoQueue = etrAuthDbState.devIpGeoQueue.filter(
      (ip) => ip !== key
    );
    return;
  }
  await ensureEtrUserLoginHistorySchema(db);
  await db
    .prepare(`DELETE FROM etr_ip_geo_queue WHERE ip = ?1`)
    .bind(key)
    .run();
}

/** 把已查到的归属地抄到该 IP 的所有历史登录行（同 IP 不重复打接口） */
export async function copyIpGeoOntoLoginHistory(
  db: D1Database,
  rawIp: string,
  geo: Pick<EtrIpGeoCacheRow, "region_label" | "area" | "isp" | "ok">
): Promise<number> {
  const key = ipKey(rawIp);
  if (!key || !geo.ok) return 0;
  const label = (geo.region_label || "").trim() || null;
  const area = geo.area?.trim() || null;
  const isp = geo.isp?.trim() || null;

  if (etrAuthDbState.devAuthEnabled) {
    let n = 0;
    for (const row of etrAuthDbState.devLoginHistory) {
      if (ipKey(row.login_ip) !== key) continue;
      row.geo_region_label = label;
      row.geo_area = area;
      row.geo_isp = isp;
      n += 1;
    }
    return n;
  }

  await ensureEtrUserLoginHistorySchema(db);
  // 同时匹配库里可能未 normalize 的同址写法：用 normalize 后的 key 与原文都更新太难；
  // 写入时 login_ip 已尽量用 normalize；再扫一遍 TRIM 相等。
  const result = await db
    .prepare(
      `UPDATE etr_user_login_history
       SET geo_region_label = ?1, geo_area = ?2, geo_isp = ?3
       WHERE login_ip IS NOT NULL
         AND (
           login_ip = ?4
           OR TRIM(login_ip) = ?4
         )`
    )
    .bind(label, area, isp, key)
    .run();
  return Number(result.meta?.changes ?? 0);
}

/**
 * 每次成功登录追加一条。
 * - 该 IP 已有归属地缓存 → 直接抄到本行，不调 ip9
 * - 没有 → 入队，等定时任务 30s 一次去查
 */
export async function recordUserLoginHistory(
  db: D1Database,
  userId: number,
  loginAt: string,
  loginIp: string | null
): Promise<void> {
  const key = ipKey(loginIp);
  const at = loginAt || nowIso();
  let label: string | null = null;
  let area: string | null = null;
  let isp: string | null = null;

  if (key) {
    const cached = await getCachedIpGeo(db, key);
    if (cached?.ok) {
      label = (cached.region_label || "").trim() || null;
      area = cached.area?.trim() || null;
      isp = cached.isp?.trim() || null;
    } else {
      await enqueueLoginIpGeoLookup(db, key);
    }
  }

  if (etrAuthDbState.devAuthEnabled) {
    const id = etrAuthDbState.devLoginHistoryIdSeq++;
    etrAuthDbState.devLoginHistory.push({
      id,
      user_id: userId,
      login_at: at,
      login_ip: key || loginIp,
      geo_region_label: label,
      geo_area: area,
      geo_isp: isp,
    });
    return;
  }

  await ensureEtrUserLoginHistorySchema(db);
  await db
    .prepare(
      `INSERT INTO etr_user_login_history
         (user_id, login_at, login_ip, geo_region_label, geo_area, geo_isp)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    )
    .bind(userId, at, key || loginIp, label, area, isp)
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
      .slice(0, capped)
      .map((row) => ({ ...row }));
  }

  await ensureEtrUserLoginHistorySchema(db);
  const result = await db
    .prepare(
      `SELECT id, user_id, login_at, login_ip,
              geo_region_label, geo_area, geo_isp
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
    geo_region_label: row.geo_region_label ?? null,
    geo_area: row.geo_area ?? null,
    geo_isp: row.geo_isp ?? null,
  }));
}

/** 供 ensureEtrIpGeoCacheSchema 等调用时避免循环：保证 queue 表存在 */
export async function ensureEtrIpGeoQueueSchema(db: D1Database): Promise<void> {
  await ensureEtrUserLoginHistorySchema(db);
  await ensureEtrIpGeoCacheSchema(db);
}
