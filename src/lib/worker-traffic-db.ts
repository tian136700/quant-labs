import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { WorkerTrafficKind } from "@/lib/worker-traffic-path";
import { WORKER_DAILY_REQUEST_LIMIT } from "@/lib/worker-traffic-path";

let devStoreEnabled = false;
let schemaReady = false;

type DevHitKey = string;

const devHits = new Map<DevHitKey, number>();

export type WorkerDailyHitInput = {
  statDate: string;
  routeKey: string;
  username: string;
  kind: WorkerTrafficKind;
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

export type WorkerTrafficDailySummary = {
  stat_date: string;
  total_hits: number;
  quota_limit: number;
  anonymous_hits: number;
  top_routes: WorkerTrafficRouteRow[];
  top_users: WorkerTrafficUserRow[];
  top_pairs: WorkerTrafficPairRow[];
};

export const WORKER_TRAFFIC_RETENTION_DAYS = 30;

function nowIso(): string {
  return new Date().toISOString();
}

function devHitKey(input: WorkerDailyHitInput): DevHitKey {
  return `${input.statDate}\0${input.routeKey}\0${input.username}\0${input.kind}`;
}

export function enableWorkerTrafficDevStore() {
  devStoreEnabled = true;
}

async function ensureWorkerDailyHitsSchema(db: D1Database): Promise<void> {
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
  schemaReady = true;
}

export async function incrementWorkerDailyHit(
  db: D1Database,
  input: WorkerDailyHitInput
): Promise<void> {
  const statDate = input.statDate.trim() || beijingDateString();
  const routeKey = input.routeKey.trim() || "/";
  const username = input.username.trim();
  const kind = input.kind;
  const updatedAt = nowIso();

  if (devStoreEnabled) {
    const key = devHitKey({ statDate, routeKey, username, kind });
    devHits.set(key, (devHits.get(key) ?? 0) + 1);
    return;
  }

  await ensureWorkerDailyHitsSchema(db);
  await db
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
    .bind(statDate, routeKey, username, kind, updatedAt)
    .run();
}

function retentionCutoffDate(
  retentionDays = WORKER_TRAFFIC_RETENTION_DAYS
): string {
  const days = Math.max(1, Math.floor(retentionDays));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return beijingDateString(cutoff);
}

export async function purgeWorkerDailyHitsOlderThan(
  db: D1Database,
  retentionDays = WORKER_TRAFFIC_RETENTION_DAYS
): Promise<number> {
  const cutoff = retentionCutoffDate(retentionDays);

  if (devStoreEnabled) {
    let removed = 0;
    for (const key of devHits.keys()) {
      const statDate = key.split("\0")[0] ?? "";
      if (statDate < cutoff) {
        devHits.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  await ensureWorkerDailyHitsSchema(db);
  const result = await db
    .prepare(`DELETE FROM worker_daily_hits WHERE stat_date < ?1`)
    .bind(cutoff)
    .run();
  return Number(result.meta?.changes ?? 0);
}

export async function getWorkerTrafficDailySummary(
  db: D1Database,
  statDate = beijingDateString()
): Promise<WorkerTrafficDailySummary> {
  const date = statDate.trim() || beijingDateString();

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
    };
  }

  await ensureWorkerDailyHitsSchema(db);

  const totalRow = await db
    .prepare(
      `SELECT COALESCE(SUM(hit_count), 0) AS total
       FROM worker_daily_hits
       WHERE stat_date = ?1`
    )
    .bind(date)
    .first<{ total: number }>();

  const anonymousRow = await db
    .prepare(
      `SELECT COALESCE(SUM(hit_count), 0) AS total
       FROM worker_daily_hits
       WHERE stat_date = ?1 AND username = ''`
    )
    .bind(date)
    .first<{ total: number }>();

  const { results: routeRows } = await db
    .prepare(
      `SELECT route_key, kind, SUM(hit_count) AS hit_count
       FROM worker_daily_hits
       WHERE stat_date = ?1
       GROUP BY route_key, kind
       ORDER BY hit_count DESC
       LIMIT 40`
    )
    .bind(date)
    .all<WorkerTrafficRouteRow>();

  const { results: userRows } = await db
    .prepare(
      `SELECT username, SUM(hit_count) AS hit_count
       FROM worker_daily_hits
       WHERE stat_date = ?1 AND username != ''
       GROUP BY username
       ORDER BY hit_count DESC
       LIMIT 20`
    )
    .bind(date)
    .all<WorkerTrafficUserRow>();

  const { results: pairRows } = await db
    .prepare(
      `SELECT username, route_key, kind, hit_count
       FROM worker_daily_hits
       WHERE stat_date = ?1
       ORDER BY hit_count DESC
       LIMIT 40`
    )
    .bind(date)
    .all<WorkerTrafficPairRow>();

  return {
    stat_date: date,
    total_hits: Number(totalRow?.total ?? 0),
    quota_limit: WORKER_DAILY_REQUEST_LIMIT,
    anonymous_hits: Number(anonymousRow?.total ?? 0),
    top_routes: routeRows ?? [],
    top_users: userRows ?? [],
    top_pairs: pairRows ?? [],
  };
}
