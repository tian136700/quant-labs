/**
 * 客户端上报的 1102 相关事件（样本 + 聚合）。
 * 整页 Error 1102 时 Cloudflare 不跑我们的 Worker，只能靠仍存活的标签页 /
 * 软导航 fetch 看到 CF HTML 后 beacon。
 */

import { workerQuotaDateString } from "@/lib/worker-traffic-rate";
import { normalizeWorkerTrafficRoute } from "@/lib/worker-traffic-path";
import type { Worker1102ClientEventKind } from "@/lib/worker-1102-client-shared";

export type { Worker1102ClientEventKind } from "@/lib/worker-1102-client-shared";
export { parseCf1102FromText } from "@/lib/worker-1102-client-shared";

let schemaReady = false;
let devStoreEnabled = false;

const MAX_DETAIL_CHARS = 1800;
const MAX_SAMPLES_PER_DAY = 80;
const LIST_LIMIT = 40;

export type Worker1102ClientEventInput = {
  eventKind: Worker1102ClientEventKind;
  pagePath: string;
  pageHref?: string;
  failedUrl?: string;
  httpStatus?: number | null;
  durationMs?: number | null;
  cfRay?: string | null;
  username?: string;
  ip?: string | null;
  detail?: Record<string, unknown> | null;
};

export type Worker1102ClientEventSample = {
  id: number;
  created_at: string;
  event_kind: Worker1102ClientEventKind;
  page_path: string;
  failed_url: string;
  http_status: number | null;
  duration_ms: number | null;
  cf_ray: string;
  username: string;
  detail_json: string;
};

export type Worker1102ClientAggRow = {
  event_kind: Worker1102ClientEventKind;
  page_path: string;
  hit_count: number;
};

type DevSample = Worker1102ClientEventSample;
const devSamples: DevSample[] = [];
const devAgg = new Map<string, number>();
let devId = 1;

export function enableWorker1102ClientEventsDevStore(): void {
  devStoreEnabled = true;
}

export async function ensureWorker1102ClientEventsSchema(
  db: D1Database
): Promise<void> {
  if (devStoreEnabled || schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS worker_1102_client_events (
         id          INTEGER PRIMARY KEY AUTOINCREMENT,
         created_at  TEXT    NOT NULL,
         stat_date   TEXT    NOT NULL,
         event_kind  TEXT    NOT NULL,
         page_path   TEXT    NOT NULL,
         failed_url  TEXT    NOT NULL DEFAULT '',
         http_status INTEGER,
         duration_ms INTEGER,
         cf_ray      TEXT    NOT NULL DEFAULT '',
         username    TEXT    NOT NULL DEFAULT '',
         ip          TEXT    NOT NULL DEFAULT '',
         detail_json TEXT    NOT NULL DEFAULT ''
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_worker_1102_client_events_date
       ON worker_1102_client_events (stat_date, created_at DESC)`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS worker_1102_client_agg (
         stat_date   TEXT    NOT NULL,
         event_kind  TEXT    NOT NULL,
         page_path   TEXT    NOT NULL,
         hit_count   INTEGER NOT NULL DEFAULT 0,
         updated_at  TEXT    NOT NULL,
         PRIMARY KEY (stat_date, event_kind, page_path)
       )`
    )
    .run();
  schemaReady = true;
}

function clipDetail(detail: Record<string, unknown> | null | undefined): string {
  if (!detail) return "";
  try {
    const raw = JSON.stringify(detail);
    if (raw.length <= MAX_DETAIL_CHARS) return raw;
    return `${raw.slice(0, MAX_DETAIL_CHARS)}…`;
  } catch {
    return "";
  }
}

function normalizePath(raw: string): string {
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return normalizeWorkerTrafficRoute(new URL(raw).pathname);
    }
  } catch {
    /* ignore */
  }
  const path = (raw.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  return normalizeWorkerTrafficRoute(path).slice(0, 256);
}

export async function recordWorker1102ClientEvent(
  db: D1Database,
  input: Worker1102ClientEventInput
): Promise<void> {
  const statDate = workerQuotaDateString();
  const createdAt = new Date().toISOString();
  const pagePath = normalizePath(input.pagePath || "/");
  const failedUrl = (input.failedUrl || "").slice(0, 512);
  const cfRay = (input.cfRay || "").slice(0, 64);
  const username = (input.username || "").slice(0, 64);
  const ip = (input.ip || "").slice(0, 64);
  const detailJson = clipDetail(input.detail ?? null);
  const httpStatus =
    input.httpStatus != null && Number.isFinite(input.httpStatus)
      ? Math.floor(input.httpStatus)
      : null;
  const durationMs =
    input.durationMs != null && Number.isFinite(input.durationMs)
      ? Math.max(0, Math.floor(input.durationMs))
      : null;

  if (devStoreEnabled) {
    const id = devId++;
    devSamples.unshift({
      id,
      created_at: createdAt,
      event_kind: input.eventKind,
      page_path: pagePath,
      failed_url: failedUrl,
      http_status: httpStatus,
      duration_ms: durationMs,
      cf_ray: cfRay,
      username,
      detail_json: detailJson,
    });
    if (devSamples.length > MAX_SAMPLES_PER_DAY) devSamples.length = MAX_SAMPLES_PER_DAY;
    const key = `${statDate}\0${input.eventKind}\0${pagePath}`;
    devAgg.set(key, (devAgg.get(key) ?? 0) + 1);
    return;
  }

  await ensureWorker1102ClientEventsSchema(db);

  await db.batch([
    db
      .prepare(
        `INSERT INTO worker_1102_client_events
           (created_at, stat_date, event_kind, page_path, failed_url,
            http_status, duration_ms, cf_ray, username, ip, detail_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
      )
      .bind(
        createdAt,
        statDate,
        input.eventKind,
        pagePath,
        failedUrl,
        httpStatus,
        durationMs,
        cfRay,
        username,
        ip,
        detailJson
      ),
    db
      .prepare(
        `INSERT INTO worker_1102_client_agg
           (stat_date, event_kind, page_path, hit_count, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4)
         ON CONFLICT(stat_date, event_kind, page_path) DO UPDATE SET
           hit_count = hit_count + 1,
           updated_at = excluded.updated_at`
      )
      .bind(statDate, input.eventKind, pagePath, createdAt),
  ]);

  // 同日样本封顶：删掉更旧的
  await db
    .prepare(
      `DELETE FROM worker_1102_client_events
       WHERE stat_date = ?1
         AND id NOT IN (
           SELECT id FROM worker_1102_client_events
           WHERE stat_date = ?1
           ORDER BY created_at DESC, id DESC
           LIMIT ?2
         )`
    )
    .bind(statDate, MAX_SAMPLES_PER_DAY)
    .run();
}

export async function listWorker1102ClientEventSamples(
  db: D1Database,
  statDate: string
): Promise<Worker1102ClientEventSample[]> {
  if (devStoreEnabled) {
    return devSamples.filter((s) => true).slice(0, LIST_LIMIT);
  }
  await ensureWorker1102ClientEventsSchema(db);
  const result = await db
    .prepare(
      `SELECT id, created_at, event_kind, page_path, failed_url,
              http_status, duration_ms, cf_ray, username, detail_json
       FROM worker_1102_client_events
       WHERE stat_date = ?1
       ORDER BY created_at DESC, id DESC
       LIMIT ?2`
    )
    .bind(statDate, LIST_LIMIT)
    .all<Worker1102ClientEventSample>();
  return (result.results ?? []).map((row) => ({
    id: Number(row.id),
    created_at: String(row.created_at),
    event_kind: row.event_kind as Worker1102ClientEventKind,
    page_path: String(row.page_path),
    failed_url: String(row.failed_url ?? ""),
    http_status: row.http_status == null ? null : Number(row.http_status),
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    cf_ray: String(row.cf_ray ?? ""),
    username: String(row.username ?? ""),
    detail_json: String(row.detail_json ?? ""),
  }));
}

export async function listWorker1102ClientAgg(
  db: D1Database,
  statDate: string
): Promise<Worker1102ClientAggRow[]> {
  if (devStoreEnabled) {
    const rows: Worker1102ClientAggRow[] = [];
    for (const [key, hit_count] of devAgg) {
      const [d, event_kind, page_path] = key.split("\0");
      if (d !== statDate) continue;
      rows.push({
        event_kind: event_kind as Worker1102ClientEventKind,
        page_path,
        hit_count,
      });
    }
    return rows.sort((a, b) => b.hit_count - a.hit_count);
  }
  await ensureWorker1102ClientEventsSchema(db);
  const result = await db
    .prepare(
      `SELECT event_kind, page_path, hit_count
       FROM worker_1102_client_agg
       WHERE stat_date = ?1
       ORDER BY hit_count DESC
       LIMIT 40`
    )
    .bind(statDate)
    .all<Worker1102ClientAggRow>();
  return (result.results ?? []).map((row) => ({
    event_kind: row.event_kind as Worker1102ClientEventKind,
    page_path: String(row.page_path),
    hit_count: Math.max(0, Number(row.hit_count) || 0),
  }));
}

export async function purgeWorker1102ClientEventsOlderThan(
  db: D1Database,
  keepDays = 14
): Promise<void> {
  if (devStoreEnabled) return;
  await ensureWorker1102ClientEventsSchema(db);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  await db.batch([
    db
      .prepare(`DELETE FROM worker_1102_client_events WHERE stat_date < ?1`)
      .bind(cutoffDate),
    db
      .prepare(`DELETE FROM worker_1102_client_agg WHERE stat_date < ?1`)
      .bind(cutoffDate),
  ]);
}
