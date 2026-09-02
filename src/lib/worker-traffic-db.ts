import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { WorkerTrafficKind } from "@/lib/worker-traffic-path";
import { WORKER_DAILY_REQUEST_LIMIT } from "@/lib/worker-traffic-path";
import {
  avgHitsPerSecond,
  beijingSecondsInQuotaWindow,
  peakHourHitsPerSecond,
  workerQuotaDateString,
} from "@/lib/worker-traffic-rate";

let devStoreEnabled = false;
let schemaReady = false;

type DevHitKey = string;
type DevHourKey = string;
type DevIpKey = string;

const devHits = new Map<DevHitKey, number>();
const devHourlyHits = new Map<DevHourKey, number>();
const devIpHits = new Map<DevIpKey, number>();

export type WorkerDailyHitInput = {
  statDate: string;
  routeKey: string;
  username: string;
  kind: WorkerTrafficKind;
  /** 北京小时 0–23；写入配额日 key；缺省不写分时（仅测试） */
  hour?: number;
  /** 客户端 IP（聚合 Top，非逐条日志） */
  ip?: string | null;
};

export type WorkerTrafficRouteRow = {
  route_key: string;
  kind: WorkerTrafficKind;
  hit_count: number;
};

export type WorkerTrafficUserRow = {
  username: string;
  hit_count: number;
};

export type WorkerTrafficPairRow = {
  username: string;
  route_key: string;
  kind: WorkerTrafficKind;
  hit_count: number;
};

export type WorkerTrafficHourlyPoint = {
  hour: number;
  hit_count: number;
};

export type WorkerTrafficDailyTrendPoint = {
  stat_date: string;
  hit_count: number;
};

export type WorkerTrafficIpRow = {
  ip: string;
  hit_count: number;
};

export type WorkerTrafficDailySummary = {
  stat_date: string;
  total_hits: number;
  quota_limit: number;
  anonymous_hits: number;
  top_routes: WorkerTrafficRouteRow[];
  top_users: WorkerTrafficUserRow[];
  top_pairs: WorkerTrafficPairRow[];
  /** 配额日内北京小时 0–23 请求数（08→次日 07；部署后才有分时） */
  hourly: WorkerTrafficHourlyPoint[];
  /** 近 N 个配额日合计（含 0），看跨日高峰 */
  daily_trend: WorkerTrafficDailyTrendPoint[];
  /** 该配额日已过秒数（当前日=距 08:00；过去日=86400） */
  quota_elapsed_sec: number;
  /** 配额窗口内平均每秒请求 */
  avg_hits_per_sec: number;
  /** 配额日高峰小时折合每秒 */
  peak_hour_hits_per_sec: number;
  peak_hour: number | null;
};

export const WORKER_TRAFFIC_RETENTION_DAYS = 30;
export const WORKER_TRAFFIC_TREND_DAYS = 14;

function nowIso(): string {
  return new Date().toISOString();
}

function clampHour(hour: number | undefined): number | null {
  if (hour == null || !Number.isFinite(hour)) return null;
  const h = Math.floor(hour);
  if (h < 0 || h > 23) return null;
  return h;
}

function devHitKey(input: WorkerDailyHitInput): DevHitKey {
  return `${input.statDate}\0${input.routeKey}\0${input.username}\0${input.kind}`;
}

function devHourKey(statDate: string, hour: number): DevHourKey {
  return `${statDate}\0${hour}`;
}

function devIpKey(statDate: string, routeKey: string, ip: string): DevIpKey {
  return `${statDate}\0${routeKey}\0${ip}`;
}

function normalizeHitIp(ip: string | null | undefined): string | null {
  const trimmed = (ip || "").trim().slice(0, 128);
  return trimmed || null;
}

function attachRateFields(
  totalHits: number,
  hourly: WorkerTrafficHourlyPoint[],
  statDate: string
): Pick<
  WorkerTrafficDailySummary,
  | "quota_elapsed_sec"
  | "avg_hits_per_sec"
  | "peak_hour_hits_per_sec"
  | "peak_hour"
> {
  const elapsed = beijingSecondsInQuotaWindow(statDate);
  let peakHour: number | null = null;
  let peakHits = 0;
  for (const row of hourly) {
    if (row.hit_count > peakHits) {
      peakHits = row.hit_count;
      peakHour = row.hour;
    }
  }
  return {
    quota_elapsed_sec: elapsed,
    avg_hits_per_sec: avgHitsPerSecond(totalHits, elapsed),
    peak_hour_hits_per_sec: peakHourHitsPerSecond(peakHits),
    peak_hour: peakHits > 0 ? peakHour : null,
  };
}

export function enableWorkerTrafficDevStore() {
  devStoreEnabled = true;
}

export async function ensureWorkerDailyHitsSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled || schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS worker_daily_hits (
         stat_date TEXT NOT NULL,
         route_key TEXT NOT NULL,
         username TEXT NOT NULL DEFAULT '',
         kind TEXT NOT NULL,
         hit_count INTEGER NOT NULL DEFAULT 0,
         updated_at TEXT NOT NULL,
         PRIMARY KEY (stat_date, route_key, username, kind)
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_worker_daily_hits_date
       ON worker_daily_hits (stat_date)`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS worker_hourly_hits (
         stat_date TEXT NOT NULL,
         hour INTEGER NOT NULL,
         hit_count INTEGER NOT NULL DEFAULT 0,
         updated_at TEXT NOT NULL,
         PRIMARY KEY (stat_date, hour)
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_worker_hourly_hits_date
       ON worker_hourly_hits (stat_date)`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS worker_route_ip_hits (
         stat_date TEXT NOT NULL,
         route_key TEXT NOT NULL,
         ip TEXT NOT NULL,
         hit_count INTEGER NOT NULL DEFAULT 0,
         updated_at TEXT NOT NULL,
         PRIMARY KEY (stat_date, route_key, ip)
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_worker_route_ip_hits_route
       ON worker_route_ip_hits (stat_date, route_key)`
    )
    .run();
  schemaReady = true;
}

export async function incrementWorkerDailyHit(
  db: D1Database,
  input: WorkerDailyHitInput
): Promise<void> {
  const statDate = input.statDate.trim() || workerQuotaDateString();
  const routeKey = input.routeKey.trim() || "/";
  const username = input.username.trim();
  const kind = input.kind;
  const hour = clampHour(input.hour);
  const ip = normalizeHitIp(input.ip);
  const updatedAt = nowIso();

  if (devStoreEnabled) {
    const key = devHitKey({ statDate, routeKey, username, kind });
    devHits.set(key, (devHits.get(key) ?? 0) + 1);
    if (hour != null) {
      const hk = devHourKey(statDate, hour);
      devHourlyHits.set(hk, (devHourlyHits.get(hk) ?? 0) + 1);
    }
    if (ip) {
      const ik = devIpKey(statDate, routeKey, ip);
      devIpHits.set(ik, (devIpHits.get(ik) ?? 0) + 1);
    }
    return;
  }

  await ensureWorkerDailyHitsSchema(db);
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO worker_daily_hits (
           stat_date, route_key, username, kind, hit_count, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, 1, ?5)
         ON CONFLICT(stat_date, route_key, username, kind)
         DO UPDATE SET
           hit_count = hit_count + 1,
           updated_at = excluded.updated_at`
      )
      .bind(statDate, routeKey, username, kind, updatedAt),
  ];

  if (hour != null) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO worker_hourly_hits (stat_date, hour, hit_count, updated_at)
           VALUES (?1, ?2, 1, ?3)
           ON CONFLICT(stat_date, hour)
           DO UPDATE SET
             hit_count = hit_count + 1,
             updated_at = excluded.updated_at`
        )
        .bind(statDate, hour, updatedAt)
    );
  }

  if (ip) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO worker_route_ip_hits (
             stat_date, route_key, ip, hit_count, updated_at
           )
           VALUES (?1, ?2, ?3, 1, ?4)
           ON CONFLICT(stat_date, route_key, ip)
           DO UPDATE SET
             hit_count = hit_count + 1,
             updated_at = excluded.updated_at`
        )
        .bind(statDate, routeKey, ip, updatedAt)
    );
  }

  await db.batch(stmts);
}

function retentionCutoffDate(
  retentionDays = WORKER_TRAFFIC_RETENTION_DAYS
): string {
  const days = Math.max(1, Math.floor(retentionDays));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return beijingDateString(cutoff);
}

function emptyHourlySeries(): WorkerTrafficHourlyPoint[] {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, hit_count: 0 }));
}

export async function purgeWorkerDailyHitsOlderThan(
  db: D1Database,
  retentionDays = WORKER_TRAFFIC_RETENTION_DAYS
): Promise<number> {
  const cutoff = retentionCutoffDate(retentionDays);

  if (devStoreEnabled) {
    let removed = 0;
    for (const key of [...devHits.keys()]) {
      const statDate = key.split("\0")[0] ?? "";
      if (statDate < cutoff) {
        devHits.delete(key);
        removed += 1;
      }
    }
    for (const key of [...devHourlyHits.keys()]) {
      const statDate = key.split("\0")[0] ?? "";
      if (statDate < cutoff) {
        devHourlyHits.delete(key);
        removed += 1;
      }
    }
    for (const key of [...devIpHits.keys()]) {
      const statDate = key.split("\0")[0] ?? "";
      if (statDate < cutoff) {
        devIpHits.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  await ensureWorkerDailyHitsSchema(db);
  const results = await db.batch([
    db.prepare(`DELETE FROM worker_daily_hits WHERE stat_date < ?1`).bind(cutoff),
    db.prepare(`DELETE FROM worker_hourly_hits WHERE stat_date < ?1`).bind(cutoff),
    db
      .prepare(`DELETE FROM worker_route_ip_hits WHERE stat_date < ?1`)
      .bind(cutoff),
  ]);
  return results.reduce(
    (sum, result) => sum + Number(result.meta?.changes ?? 0),
    0
  );
}

export async function getWorkerTrafficHourlySeries(
  db: D1Database,
  statDate = workerQuotaDateString()
): Promise<WorkerTrafficHourlyPoint[]> {
  const date = statDate.trim() || workerQuotaDateString();
  const series = emptyHourlySeries();

  if (devStoreEnabled) {
    for (const [key, count] of devHourlyHits.entries()) {
      const [rowDate, hourRaw] = key.split("\0");
      if (rowDate !== date) continue;
      const hour = Number(hourRaw);
      if (hour >= 0 && hour <= 23) series[hour].hit_count += count;
    }
    return series;
  }

  await ensureWorkerDailyHitsSchema(db);
  const { results } = await db
    .prepare(
      `SELECT hour, hit_count
       FROM worker_hourly_hits
       WHERE stat_date = ?1`
    )
    .bind(date)
    .all<{ hour: number; hit_count: number }>();

  for (const row of results ?? []) {
    const hour = Number(row.hour);
    if (hour >= 0 && hour <= 23) {
      series[hour].hit_count = Number(row.hit_count ?? 0);
    }
  }
  return series;
}

export async function getWorkerTrafficDailyTrend(
  db: D1Database,
  endDate = workerQuotaDateString(),
  trendDays = WORKER_TRAFFIC_TREND_DAYS
): Promise<WorkerTrafficDailyTrendPoint[]> {
  const end = endDate.trim() || workerQuotaDateString();
  const days = Math.max(1, Math.floor(trendDays));
  const windowStart = beijingDateString(
    new Date(
      new Date(`${end}T12:00:00+08:00`).getTime() - (days - 1) * 24 * 60 * 60 * 1000
    )
  );
  const dates: string[] = [];
  const startMs = new Date(`${windowStart}T12:00:00+08:00`).getTime();
  const endMs = new Date(`${end}T12:00:00+08:00`).getTime();
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
    for (let t = startMs; t <= endMs; t += 24 * 60 * 60 * 1000) {
      dates.push(beijingDateString(new Date(t)));
    }
  }
  if (dates.length === 0) dates.push(end);

  const counts = new Map<string, number>();

  if (devStoreEnabled) {
    for (const [key, count] of devHits.entries()) {
      const rowDate = key.split("\0")[0] ?? "";
      if (rowDate < windowStart || rowDate > end) continue;
      counts.set(rowDate, (counts.get(rowDate) ?? 0) + count);
    }
    return dates.map((stat_date) => ({
      stat_date,
      hit_count: counts.get(stat_date) ?? 0,
    }));
  }

  await ensureWorkerDailyHitsSchema(db);
  const { results } = await db
    .prepare(
      `SELECT stat_date, COALESCE(SUM(hit_count), 0) AS hit_count
       FROM worker_daily_hits
       WHERE stat_date >= ?1 AND stat_date <= ?2
       GROUP BY stat_date`
    )
    .bind(windowStart, end)
    .all<{ stat_date: string; hit_count: number }>();

  for (const row of results ?? []) {
    counts.set(row.stat_date, Number(row.hit_count ?? 0));
  }
  return dates.map((stat_date) => ({
    stat_date,
    hit_count: counts.get(stat_date) ?? 0,
  }));
}

export async function getWorkerTrafficDailySummary(
  db: D1Database,
  statDate = workerQuotaDateString()
): Promise<WorkerTrafficDailySummary> {
  const date = statDate.trim() || workerQuotaDateString();

  if (devStoreEnabled) {
    const routeMap = new Map<string, WorkerTrafficRouteRow>();
    const userMap = new Map<string, number>();
    const pairRows: WorkerTrafficPairRow[] = [];
    let total = 0;
    let anonymousHits = 0;

    for (const [key, count] of devHits.entries()) {
      const [rowDate, routeKey, username, kind] = key.split("\0");
      if (rowDate !== date) continue;
      total += count;
      if (!username) anonymousHits += count;
      const routeId = `${kind}\0${routeKey}`;
      const routeRow = routeMap.get(routeId);
      if (routeRow) routeRow.hit_count += count;
      else {
        routeMap.set(routeId, {
          route_key: routeKey,
          kind: kind as WorkerTrafficKind,
          hit_count: count,
        });
      }
      if (username) {
        userMap.set(username, (userMap.get(username) ?? 0) + count);
      }
      pairRows.push({
        username: username ?? "",
        route_key: routeKey ?? "/",
        kind: kind as WorkerTrafficKind,
        hit_count: count,
      });
    }

    const [hourly, daily_trend] = await Promise.all([
      getWorkerTrafficHourlySeries(db, date),
      getWorkerTrafficDailyTrend(db, date),
    ]);

    return {
      stat_date: date,
      total_hits: total,
      quota_limit: WORKER_DAILY_REQUEST_LIMIT,
      anonymous_hits: anonymousHits,
      top_routes: [...routeMap.values()]
        .sort((a, b) => b.hit_count - a.hit_count)
        .slice(0, 40),
      top_users: [...userMap.entries()]
        .map(([username, hit_count]) => ({ username, hit_count }))
        .sort((a, b) => b.hit_count - a.hit_count)
        .slice(0, 20),
      top_pairs: pairRows
        .sort((a, b) => b.hit_count - a.hit_count)
        .slice(0, 40),
      hourly,
      daily_trend,
      ...attachRateFields(total, hourly, date),
    };
  }

  await ensureWorkerDailyHitsSchema(db);

  const [
    totalRow,
    anonymousRow,
    routeResult,
    userResult,
    pairResult,
    hourly,
    daily_trend,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT COALESCE(SUM(hit_count), 0) AS total
         FROM worker_daily_hits
         WHERE stat_date = ?1`
      )
      .bind(date)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(hit_count), 0) AS total
         FROM worker_daily_hits
         WHERE stat_date = ?1 AND username = ''`
      )
      .bind(date)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT route_key, kind, SUM(hit_count) AS hit_count
         FROM worker_daily_hits
         WHERE stat_date = ?1
         GROUP BY route_key, kind
         ORDER BY hit_count DESC
         LIMIT 40`
      )
      .bind(date)
      .all<WorkerTrafficRouteRow>(),
    db
      .prepare(
        `SELECT username, SUM(hit_count) AS hit_count
         FROM worker_daily_hits
         WHERE stat_date = ?1 AND username != ''
         GROUP BY username
         ORDER BY hit_count DESC
         LIMIT 20`
      )
      .bind(date)
      .all<WorkerTrafficUserRow>(),
    db
      .prepare(
        `SELECT username, route_key, kind, hit_count
         FROM worker_daily_hits
         WHERE stat_date = ?1
         ORDER BY hit_count DESC
         LIMIT 40`
      )
      .bind(date)
      .all<WorkerTrafficPairRow>(),
    getWorkerTrafficHourlySeries(db, date),
    getWorkerTrafficDailyTrend(db, date),
  ]);

  return {
    stat_date: date,
    total_hits: Number(totalRow?.total ?? 0),
    quota_limit: WORKER_DAILY_REQUEST_LIMIT,
    anonymous_hits: Number(anonymousRow?.total ?? 0),
    top_routes: routeResult.results ?? [],
    top_users: userResult.results ?? [],
    top_pairs: pairResult.results ?? [],
    hourly,
    daily_trend,
    ...attachRateFields(Number(totalRow?.total ?? 0), hourly, date),
  };
}

export async function getWorkerTrafficRouteIps(
  db: D1Database,
  opts: { statDate?: string; routeKey: string; limit?: number }
): Promise<WorkerTrafficIpRow[]> {
  const date = (opts.statDate || "").trim() || workerQuotaDateString();
  const routeKey = opts.routeKey.trim() || "/";
  const limit = Math.min(
    40,
    Math.max(1, Math.floor(opts.limit && opts.limit > 0 ? opts.limit : 20))
  );

  if (devStoreEnabled) {
    const rows: WorkerTrafficIpRow[] = [];
    for (const [key, count] of devIpHits.entries()) {
      const [rowDate, rowRoute, ip] = key.split("\0");
      if (rowDate !== date || rowRoute !== routeKey) continue;
      rows.push({ ip: ip || "unknown", hit_count: count });
    }
    return rows.sort((a, b) => b.hit_count - a.hit_count).slice(0, limit);
  }

  await ensureWorkerDailyHitsSchema(db);
  const { results } = await db
    .prepare(
      `SELECT ip, hit_count
       FROM worker_route_ip_hits
       WHERE stat_date = ?1 AND route_key = ?2
       ORDER BY hit_count DESC
       LIMIT ?3`
    )
    .bind(date, routeKey, limit)
    .all<WorkerTrafficIpRow>();

  return (results ?? []).map((row) => ({
    ip: row.ip || "unknown",
    hit_count: Number(row.hit_count ?? 0),
  }));
}
