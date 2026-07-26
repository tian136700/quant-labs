import "server-only";

import { ipKey } from "@/lib/client-ip";
import {
  copyIpGeoOntoLoginHistory,
  dequeueLoginIpGeo,
  enqueueLoginIpGeoLookup,
  ensureEtrUserLoginHistorySchema,
  listQueuedLoginIpGeo,
} from "./login_history";
import {
  ensureEtrIpGeoCacheSchema,
  getCachedIpGeoMap,
  resolveIpGeoCached,
  type EtrIpGeoCacheRow,
} from "./ip_geo_cache";
import { etrAuthDbState } from "./state";

export type LoginIpGeoBackfillStatus = {
  total_unique: number;
  done_count: number;
  pending_count: number;
  failed_recent_count: number;
  queued_count: number;
  pending_ips: string[];
  done_ips_sample: string[];
};

export type LoginIpGeoBackfillStepResult = {
  idle: boolean;
  ip: string | null;
  geo: EtrIpGeoCacheRow | null;
  history_rows_updated: number;
  status: LoginIpGeoBackfillStatus;
};

/** 历史登录 + 用户表最后登录里的唯一 IP（已 normalize） */
export async function listDistinctLoginIps(db: D1Database): Promise<string[]> {
  const raw: string[] = [];

  if (etrAuthDbState.devAuthEnabled) {
    for (const row of etrAuthDbState.devLoginHistory) {
      if (row.login_ip) raw.push(row.login_ip);
    }
    for (const user of etrAuthDbState.devUsers) {
      if (user.last_login_ip) raw.push(user.last_login_ip);
    }
  } else {
    await ensureEtrUserLoginHistorySchema(db);
    const history = await db
      .prepare(
        `SELECT DISTINCT login_ip AS ip
         FROM etr_user_login_history
         WHERE login_ip IS NOT NULL AND TRIM(login_ip) != ''`
      )
      .all<{ ip: string }>();
    for (const row of history.results ?? []) {
      if (row.ip) raw.push(row.ip);
    }
    const users = await db
      .prepare(
        `SELECT DISTINCT last_login_ip AS ip
         FROM etr_users
         WHERE last_login_ip IS NOT NULL AND TRIM(last_login_ip) != ''`
      )
      .all<{ ip: string }>();
    for (const row of users.results ?? []) {
      if (row.ip) raw.push(row.ip);
    }
  }

  const uniq = new Set<string>();
  for (const ip of raw) {
    const key = ipKey(ip);
    if (key) uniq.add(key);
  }
  return [...uniq].sort();
}

/**
 * pending = 队列里的 IP ∪ 历史里尚未成功缓存的 IP（旧数据回填）。
 * 已成功缓存的不算 pending，也不会再打 ip9。
 */
export async function getLoginIpGeoBackfillStatus(
  db: D1Database
): Promise<LoginIpGeoBackfillStatus> {
  const ips = await listDistinctLoginIps(db);
  const queued = await listQueuedLoginIpGeo(db);
  const map = await getCachedIpGeoMap(db, [...ips, ...queued]);
  const pendingSet = new Set<string>();
  const done_ips: string[] = [];
  let failed_recent_count = 0;

  for (const ip of queued) {
    const hit = map.get(ip);
    if (hit?.ok) continue;
    if (hit && !hit.ok) {
      failed_recent_count += 1;
      continue;
    }
    pendingSet.add(ip);
  }

  for (const ip of ips) {
    const hit = map.get(ip);
    if (!hit) {
      pendingSet.add(ip);
      continue;
    }
    if (hit.ok) {
      done_ips.push(ip);
      continue;
    }
    failed_recent_count += 1;
  }

  const pending_ips = [...pendingSet].sort();
  return {
    total_unique: ips.length,
    done_count: done_ips.length,
    pending_count: pending_ips.length,
    failed_recent_count,
    queued_count: queued.length,
    pending_ips,
    done_ips_sample: done_ips.slice(0, 8),
  };
}

/**
 * 清空登录相关 IP 的归属地缓存 + 重入队（整批用 ip9 重跑）。
 */
export async function requeueLoginIpGeoBackfill(
  db: D1Database
): Promise<{ cleared: number; status: LoginIpGeoBackfillStatus }> {
  const ips = await listDistinctLoginIps(db);
  if (ips.length === 0) {
    return { cleared: 0, status: await getLoginIpGeoBackfillStatus(db) };
  }

  if (etrAuthDbState.devAuthEnabled) {
    const set = new Set(ips);
    etrAuthDbState.devIpGeoCache = etrAuthDbState.devIpGeoCache.filter(
      (row) => !set.has(row.ip)
    );
    for (const row of etrAuthDbState.devLoginHistory) {
      if (row.login_ip && set.has(ipKey(row.login_ip) || "")) {
        row.geo_region_label = null;
        row.geo_area = null;
        row.geo_isp = null;
      }
    }
    etrAuthDbState.devIpGeoQueue = [...ips];
    return { cleared: ips.length, status: await getLoginIpGeoBackfillStatus(db) };
  }

  await ensureEtrIpGeoCacheSchema(db);
  await ensureEtrUserLoginHistorySchema(db);
  let cleared = 0;
  const chunkSize = 40;
  for (let i = 0; i < ips.length; i += chunkSize) {
    const chunk = ips.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, idx) => `?${idx + 1}`).join(", ");
    const result = await db
      .prepare(`DELETE FROM etr_ip_geo_cache WHERE ip IN (${placeholders})`)
      .bind(...chunk)
      .run();
    cleared += Number(result.meta?.changes ?? 0);
    await db
      .prepare(
        `UPDATE etr_user_login_history
         SET geo_region_label = NULL, geo_area = NULL, geo_isp = NULL
         WHERE login_ip IN (${placeholders})`
      )
      .bind(...chunk)
      .run();
    for (const ip of chunk) {
      await enqueueLoginIpGeoLookup(db, ip);
    }
  }

  return { cleared, status: await getLoginIpGeoBackfillStatus(db) };
}

/**
 * 处理队列下一个唯一 IP：打一次 ip9 → 写缓存 → 抄到该 IP 所有登录历史行 → 出队。
 * 禁止在登录热路径 / 弹窗里调用。
 */
export async function stepLoginIpGeoBackfill(
  db: D1Database
): Promise<LoginIpGeoBackfillStepResult> {
  const before = await getLoginIpGeoBackfillStatus(db);
  const nextIp = before.pending_ips[0] ?? null;
  if (!nextIp) {
    return {
      idle: true,
      ip: null,
      geo: null,
      history_rows_updated: 0,
      status: before,
    };
  }

  const geo = await resolveIpGeoCached(db, nextIp, { force: true });
  let history_rows_updated = 0;
  if (geo?.ok) {
    history_rows_updated = await copyIpGeoOntoLoginHistory(db, nextIp, geo);
  }
  await dequeueLoginIpGeo(db, nextIp);
  const status = await getLoginIpGeoBackfillStatus(db);
  return {
    idle: false,
    ip: nextIp,
    geo,
    history_rows_updated,
    status,
  };
}
