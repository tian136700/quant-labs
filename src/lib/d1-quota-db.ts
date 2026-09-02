/**
 * D1 日配额诊断（免费档 500 万读 / 10 万写）。
 * CF 不提供精确已用量 API；看板靠：
 * 1) 轻量探活 SELECT 1（打开看板时）
 * 2) 热路径 catch 到配额错误时聚合计数（waitUntil，不挡响应）
 */

import {
  D1_FREE_ROW_READ_LIMIT,
  D1_FREE_ROW_WRITE_LIMIT,
  classifyD1QuotaError,
  d1QuotaProbeStatusFromError,
  type D1QuotaProbeStatus,
  type D1QuotaSignalKind,
} from "@/lib/d1-quota";
import {
  buildD1ReadBurdenEstimate,
  type D1QuotaReadBurdenSummary,
} from "@/lib/d1-quota-estimate";
import { ensureWorkerDailyHitsSchema } from "@/lib/worker-traffic-db";
import { workerQuotaDateString } from "@/lib/worker-traffic-rate";

let schemaReady = false;
let devStoreEnabled = false;

type DevKey = string;
const devSignals = new Map<
  DevKey,
  { hit_count: number; last_message: string; updated_at: string }
>();

export type D1QuotaSignalRow = {
  route_key: string;
  signal: D1QuotaSignalKind;
  hit_count: number;
  last_message: string;
  updated_at: string;
};

export type D1QuotaRiskLevel = "ok" | "warn" | "critical";

export type D1QuotaDiagnosticSummary = {
  ok: true;
  generated_at: string;
  quota_stat_date: string;
  row_read_limit: number;
  row_write_limit: number;
  probe_status: D1QuotaProbeStatus;
  probe_message: string;
  probe_at: string;
  risk_level: D1QuotaRiskLevel;
  risk_notes: string[];
  total_read_limit_hits: number;
  total_write_limit_hits: number;
  signals: D1QuotaSignalRow[];
  read_burden: D1QuotaReadBurdenSummary;
  guardrails: Array<{ id: string; ok: boolean; detail: string }>;
};

export function enableD1QuotaDevStore(): void {
  devStoreEnabled = true;
}

export async function ensureD1QuotaSignalsSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled || schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS d1_quota_signals (
         stat_date       TEXT    NOT NULL,
         route_key       TEXT    NOT NULL,
         signal          TEXT    NOT NULL,
         hit_count       INTEGER NOT NULL DEFAULT 0,
         last_message    TEXT,
         updated_at      TEXT    NOT NULL,
         PRIMARY KEY (stat_date, route_key, signal)
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_d1_quota_signals_date
       ON d1_quota_signals (stat_date)`
    )
    .run();
  schemaReady = true;
}

export async function incrementD1QuotaSignal(
  db: D1Database,
  input: {
    statDate: string;
    routeKey: string;
    signal: D1QuotaSignalKind;
    message?: string;
  }
): Promise<void> {
  const routeKey = (input.routeKey || "/").slice(0, 256);
  const message = (input.message ?? "").slice(0, 512);
  const now = new Date().toISOString();

  if (devStoreEnabled) {
    const key = `${input.statDate}\0${routeKey}\0${input.signal}`;
    const prev = devSignals.get(key) ?? {
      hit_count: 0,
      last_message: "",
      updated_at: now,
    };
    prev.hit_count += 1;
    if (message) prev.last_message = message;
    prev.updated_at = now;
    devSignals.set(key, prev);
    return;
  }

  await ensureD1QuotaSignalsSchema(db);
  await db
    .prepare(
      `INSERT INTO d1_quota_signals
         (stat_date, route_key, signal, hit_count, last_message, updated_at)
       VALUES (?1, ?2, ?3, 1, ?4, ?5)
       ON CONFLICT(stat_date, route_key, signal) DO UPDATE SET
         hit_count = hit_count + 1,
         last_message = CASE
           WHEN excluded.last_message != '' THEN excluded.last_message
           ELSE d1_quota_signals.last_message
         END,
         updated_at = excluded.updated_at`
    )
    .bind(input.statDate, routeKey, input.signal, message, now)
    .run();
}

export async function recordD1QuotaErrorIfMatch(
  db: D1Database,
  input: { routeKey: string; err: unknown; statDate?: string }
): Promise<boolean> {
  const signal = classifyD1QuotaError(input.err);
  if (!signal) return false;
  const message = input.err instanceof Error ? input.err.message : String(input.err);
  await incrementD1QuotaSignal(db, {
    statDate: input.statDate ?? workerQuotaDateString(),
    routeKey: input.routeKey,
    signal,
    message,
  });
  return true;
}

export async function listD1QuotaSignals(
  db: D1Database,
  statDate: string
): Promise<D1QuotaSignalRow[]> {
  if (devStoreEnabled) {
    const rows: D1QuotaSignalRow[] = [];
    for (const [key, v] of devSignals) {
      const [d, route, signal] = key.split("\0");
      if (d !== statDate) continue;
      rows.push({
        route_key: route,
        signal: signal as D1QuotaSignalKind,
        hit_count: v.hit_count,
        last_message: v.last_message,
        updated_at: v.updated_at,
      });
    }
    return rows.sort(
      (a, b) =>
        b.hit_count - a.hit_count || a.route_key.localeCompare(b.route_key)
    );
  }

  await ensureD1QuotaSignalsSchema(db);
  const result = await db
    .prepare(
      `SELECT route_key, signal, hit_count, last_message, updated_at
       FROM d1_quota_signals
       WHERE stat_date = ?1
       ORDER BY hit_count DESC, route_key ASC
       LIMIT 40`
    )
    .bind(statDate)
    .all<{
      route_key: string;
      signal: string;
      hit_count: number;
      last_message: string | null;
      updated_at: string;
    }>();

  return (result.results ?? []).map((row) => ({
    route_key: String(row.route_key),
    signal: row.signal as D1QuotaSignalKind,
    hit_count: Math.max(0, Number(row.hit_count) || 0),
    last_message: String(row.last_message ?? ""),
    updated_at: String(row.updated_at ?? ""),
  }));
}

async function probeD1(db: D1Database): Promise<{
  status: D1QuotaProbeStatus;
  message: string;
  at: string;
}> {
  const at = new Date().toISOString();
  try {
    await db.prepare("SELECT 1 AS ok").first();
    return { status: "ok", message: "SELECT 1 成功", at };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: d1QuotaProbeStatusFromError(err),
      message: message.slice(0, 512),
      at,
    };
  }
}

function buildRiskNotes(input: {
  probeStatus: D1QuotaProbeStatus;
  probeMessage: string;
  readHits: number;
  writeHits: number;
  signals: D1QuotaSignalRow[];
  estimatedReadPct?: number;
}): { level: D1QuotaRiskLevel; notes: string[] } {
  const notes: string[] = [];
  let level: D1QuotaRiskLevel = "ok";

  const bump = (next: D1QuotaRiskLevel, msg: string) => {
    notes.push(msg);
    if (next === "critical") level = "critical";
    else if (next === "warn" && level === "ok") level = "warn";
  };

  notes.push(
    "CF 不提供 D1 已用行数百分比；本看板靠探活 + 热路径捕获配额错误。配额日 = 北京 08:00→次日 08:00（与 Worker 流量看板一致）。"
  );

  if (input.probeStatus === "row_read_limited") {
    bump(
      "critical",
      `探活失败：日读行数已顶满（免费档约 ${D1_FREE_ROW_READ_LIMIT.toLocaleString()} 行/日）。站点 D1 查询会普遍失败，约次日北京 08:00 重置。`
    );
  } else if (input.probeStatus === "row_write_limited") {
    bump(
      "critical",
      `探活失败：日写行数已顶满（免费档约 ${D1_FREE_ROW_WRITE_LIMIT.toLocaleString()} 行/日）。`
    );
  } else if (input.probeStatus === "error") {
    bump("warn", `探活异常（非配额文案）：${input.probeMessage}`);
  } else {
    notes.push("探活 SELECT 1 成功：当前这一刻 D1 可读（不代表未接近配额上限）。");
  }

  if (input.readHits >= 20) {
    bump(
      "critical",
      `本配额日已观测到 ${input.readHits} 次「日读行数顶满」错误（按路由聚合）。`
    );
  } else if (input.readHits >= 3) {
    bump("warn", `本配额日已观测到 ${input.readHits} 次读配额错误。`);
  }

  if (input.writeHits >= 10) {
    bump(
      "critical",
      `本配额日已观测到 ${input.writeHits} 次「日写行数顶满」错误。`
    );
  } else if (input.writeHits >= 2) {
    bump("warn", `本配额日已观测到 ${input.writeHits} 次写配额错误。`);
  }

  const top = input.signals[0];
  if (top && top.hit_count >= 5) {
    bump(
      "warn",
      `热点路由 ${top.route_key}（${top.signal}）累计 ${top.hit_count} 次，优先减轮询/全表扫。`
    );
  }

  if (typeof input.estimatedReadPct === "number" && input.estimatedReadPct >= 70) {
    bump(
      input.estimatedReadPct >= 90 ? "critical" : "warn",
      `流量启发式估算本配额日 D1 读行约 ${input.estimatedReadPct}%（见下方读行负担表）；与 CF 邮件对照。`
    );
  }

  if (notes.length <= 1) {
    notes.push(
      "本配额日暂无配额错误记录；若用户仍报错，对照 Worker 流量看板是否 Error 1027（日请求）或 1102 看板（单次 CPU）。"
    );
  }

  return { level, notes };
}

function guardrails(): D1QuotaDiagnosticSummary["guardrails"] {
  return [
    {
      id: "no_exact_usage_api",
      ok: true,
      detail: "Cloudflare 无 D1 已用行数 API；禁止为估算用量加高频 COUNT 扫表",
    },
    {
      id: "observe_wait_until",
      ok: true,
      detail: "热路径 catch 配额错误后 waitUntil 写入，不挡用户响应",
    },
    {
      id: "probe_lightweight",
      ok: true,
      detail: "看板探活仅 SELECT 1；打开看板时跑一次",
    },
    {
      id: "shared_sync_hooks",
      ok: true,
      detail: "jp/en shared + sync 的 catch 已接 observeD1QuotaError",
    },
  ];
}

export async function getD1QuotaDiagnosticSummary(
  db: D1Database,
  opts?: { quotaStatDate?: string }
): Promise<D1QuotaDiagnosticSummary> {
  const quotaStatDate = opts?.quotaStatDate ?? workerQuotaDateString();
  await ensureWorkerDailyHitsSchema(db);
  const [probe, signals, routeHitsResult] = await Promise.all([
    probeD1(db),
    listD1QuotaSignals(db, quotaStatDate),
    db
      .prepare(
        `SELECT route_key, SUM(hit_count) AS hit_count
         FROM worker_daily_hits
         WHERE stat_date = ?1
         GROUP BY route_key
         ORDER BY hit_count DESC
         LIMIT 80`
      )
      .bind(quotaStatDate)
      .all<{ route_key: string; hit_count: number }>(),
  ]);

  const read_burden = buildD1ReadBurdenEstimate(
    (routeHitsResult.results ?? []).map((row) => ({
      route_key: String(row.route_key),
      hit_count: Math.max(0, Number(row.hit_count) || 0),
    }))
  );

  const total_read_limit_hits = signals
    .filter((r) => r.signal === "row_read_limit")
    .reduce((a, b) => a + b.hit_count, 0);
  const total_write_limit_hits = signals
    .filter((r) => r.signal === "row_write_limit")
    .reduce((a, b) => a + b.hit_count, 0);

  const { level, notes } = buildRiskNotes({
    probeStatus: probe.status,
    probeMessage: probe.message,
    readHits: total_read_limit_hits,
    writeHits: total_write_limit_hits,
    signals,
    estimatedReadPct: read_burden.estimated_pct_of_limit,
  });

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    quota_stat_date: quotaStatDate,
    row_read_limit: D1_FREE_ROW_READ_LIMIT,
    row_write_limit: D1_FREE_ROW_WRITE_LIMIT,
    probe_status: probe.status,
    probe_message: probe.message,
    probe_at: probe.at,
    risk_level: level,
    risk_notes: notes,
    total_read_limit_hits,
    total_write_limit_hits,
    signals,
    read_burden,
    guardrails: guardrails(),
  };
}

export async function purgeD1QuotaSignalsOlderThan(
  db: D1Database,
  keepDays = 30
): Promise<void> {
  if (devStoreEnabled) return;
  await ensureD1QuotaSignalsSchema(db);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  await db
    .prepare(`DELETE FROM d1_quota_signals WHERE stat_date < ?1`)
    .bind(cutoffDate)
    .run();
}
