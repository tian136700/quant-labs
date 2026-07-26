import "server-only";

import { ipKey } from "@/lib/client-ip";
import { ensureEtrUserLoginHistorySchema } from "./login_history";
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
  pending_ips: string[];
  done_ips_sample: string[];
};

export type LoginIpGeoBackfillStepResult = {
  idle: boolean;
  ip: string | null;
  geo: EtrIpGeoCacheRow | null;
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

export async function getLoginIpGeoBackfillStatus(
  db: D1Database
): Promise<LoginIpGeoBackfillStatus> {
  const ips = await listDistinctLoginIps(db);
  const map = await getCachedIpGeoMap(db, ips);
  const pending_ips: string[] = [];
  const done_ips: string[] = [];
  let failed_recent_count = 0;

  for (const ip of ips) {
    const hit = map.get(ip);
    if (!hit) {
      pending_ips.push(ip);
      continue;
    }
    if (hit.ok) {
      done_ips.push(ip);
      continue;
    }
    // 近期失败（负缓存）：暂不重试，避免每 30s 打爆
    failed_recent_count += 1;
  }

  return {
    total_unique: ips.length,
    done_count: done_ips.length,
    pending_count: pending_ips.length,
    failed_recent_count,
    pending_ips,
    done_ips_sample: done_ips.slice(0, 8),
  };
}

/**
 * 清空登录相关 IP 的归属地缓存，全部重新进 pending（用于「线上地区不准、整批重跑」）。
 * 同一 IP 仍只查一次；不删登录历史。
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
    return { cleared: ips.length, status: await getLoginIpGeoBackfillStatus(db) };
  }

  await ensureEtrIpGeoCacheSchema(db);
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
  }

  return { cleared, status: await getLoginIpGeoBackfillStatus(db) };
}

/**
 * 处理队列里下一个「尚未成功缓存」的唯一 IP：打一次 ip9，写入缓存。
 * 同一 IP 全站登录记录共享这条缓存，无需按登录次数重复请求。
 */
export async function stepLoginIpGeoBackfill(
  db: D1Database
): Promise<LoginIpGeoBackfillStepResult> {
  const before = await getLoginIpGeoBackfillStatus(db);
  const nextIp = before.pending_ips[0] ?? null;
  if (!nextIp) {
    return { idle: true, ip: null, geo: null, status: before };
  }

  const geo = await resolveIpGeoCached(db, nextIp, { force: true });
  const status = await getLoginIpGeoBackfillStatus(db);
  return { idle: false, ip: nextIp, geo, status };
}
