/**
 * Error 1102 诊断数据（聚合 + 风险快照）。
 * CF 1102 在 Worker 被杀时本进程记不到那一次；看板靠：
 * 1) 客户端现场（CF 1102 HTML / page_ok / shared_fail）——主信号
 * 2) 热路径慢/大/5xx 聚合 + 今日 shared 列表字段合计
 * 3) 备注体积仅次要对照（英语常无备注仍可 1102）
 */

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { getWorkerTrafficDailySummary } from "@/lib/worker-traffic-db";
import { workerQuotaDateString } from "@/lib/worker-traffic-rate";
import { PAGE_HTML_TRAFFIC_SKIP_PATHS } from "@/lib/worker-traffic-path";
import {
  listWorker1102ClientAgg,
  listWorker1102ClientEventSamples,
  purgeWorker1102ClientEventsOlderThan,
  type Worker1102ClientAggRow,
  type Worker1102ClientEventSample,
} from "@/lib/worker-1102-client-events";

let schemaReady = false;
let devStoreEnabled = false;

type DevKey = string;
const devHeavy = new Map<
  DevKey,
  { hit_count: number; max_duration_ms: number; max_bytes: number }
>();

export type WorkerHeavySignalKind = "slow" | "large" | "http5xx";

export type WorkerHeavySignalRow = {
  route_key: string;
  signal: WorkerHeavySignalKind;
  hit_count: number;
  max_duration_ms: number;
  max_bytes: number;
};

export type Worker1102SubjectRisk = {
  subject: "jp" | "en";
  word_count: number;
  notes_count: number;
  max_notes_bytes: number;
  avg_notes_bytes: number;
  notes_with_image_hint: number;
  today_shared_count: number;
  today_shared_max_notes_bytes: number;
  today_shared_sum_list_bytes: number;
  today_shared_max_list_bytes: number;
};

export type Worker1102HeavyWord = {
  subject: "jp" | "en";
  id: number;
  word: string;
  notes_bytes: number;
  has_image_hint: boolean;
};

export type Worker1102RiskLevel = "ok" | "warn" | "critical";

export type Worker1102DiagnosticSummary = {
  ok: true;
  generated_at: string;
  /** 共享列表用的北京日历日 */
  share_date: string;
  /** 流量/重信号用的配额日 */
  quota_stat_date: string;
  risk_level: Worker1102RiskLevel;
  risk_notes: string[];
  subjects: Worker1102SubjectRisk[];
  heaviest_notes: Worker1102HeavyWord[];
  heavy_signals: WorkerHeavySignalRow[];
  /** 与 1102 相关的热路径今日命中（来自流量表） */
  related_traffic_routes: Array<{
    route_key: string;
    kind: string;
    hit_count: number;
  }>;
  traffic_total_hits: number;
  traffic_quota_limit: number;
  guardrails: Array<{ id: string; ok: boolean; detail: string }>;
  client_event_agg: Worker1102ClientAggRow[];
  client_event_samples: Worker1102ClientEventSample[];
};

export function enableWorker1102DevStore(): void {
  devStoreEnabled = true;
}

export async function ensureWorkerHeavySignalsSchema(
  db: D1Database
): Promise<void> {
  if (devStoreEnabled || schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS worker_heavy_signals (
         stat_date         TEXT    NOT NULL,
         route_key         TEXT    NOT NULL,
         signal            TEXT    NOT NULL,
         hit_count         INTEGER NOT NULL DEFAULT 0,
         max_duration_ms   INTEGER NOT NULL DEFAULT 0,
         max_bytes         INTEGER NOT NULL DEFAULT 0,
         updated_at        TEXT    NOT NULL,
         PRIMARY KEY (stat_date, route_key, signal)
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_worker_heavy_signals_date
       ON worker_heavy_signals (stat_date)`
    )
    .run();
  schemaReady = true;
}

export async function incrementWorkerHeavySignal(
  db: D1Database,
  input: {
    statDate: string;
    routeKey: string;
    signal: WorkerHeavySignalKind;
    durationMs?: number;
    bodyBytes?: number;
  }
): Promise<void> {
  const routeKey = (input.routeKey || "/").slice(0, 256);
  const durationMs = Math.max(0, Math.floor(input.durationMs ?? 0));
  const bodyBytes = Math.max(0, Math.floor(input.bodyBytes ?? 0));
  const now = new Date().toISOString();

  if (devStoreEnabled) {
    const key = `${input.statDate}\0${routeKey}\0${input.signal}`;
    const prev = devHeavy.get(key) ?? {
      hit_count: 0,
      max_duration_ms: 0,
      max_bytes: 0,
    };
    prev.hit_count += 1;
    prev.max_duration_ms = Math.max(prev.max_duration_ms, durationMs);
    prev.max_bytes = Math.max(prev.max_bytes, bodyBytes);
    devHeavy.set(key, prev);
    return;
  }

  await ensureWorkerHeavySignalsSchema(db);
  await db
    .prepare(
      `INSERT INTO worker_heavy_signals
         (stat_date, route_key, signal, hit_count, max_duration_ms, max_bytes, updated_at)
       VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6)
       ON CONFLICT(stat_date, route_key, signal) DO UPDATE SET
         hit_count = hit_count + 1,
         max_duration_ms = MAX(max_duration_ms, excluded.max_duration_ms),
         max_bytes = MAX(max_bytes, excluded.max_bytes),
         updated_at = excluded.updated_at`
    )
    .bind(
      input.statDate,
      routeKey,
      input.signal,
      durationMs,
      bodyBytes,
      now
    )
    .run();
}

export async function listWorkerHeavySignals(
  db: D1Database,
  statDate: string
): Promise<WorkerHeavySignalRow[]> {
  if (devStoreEnabled) {
    const rows: WorkerHeavySignalRow[] = [];
    for (const [key, v] of devHeavy) {
      const [d, route, signal] = key.split("\0");
      if (d !== statDate) continue;
      rows.push({
        route_key: route,
        signal: signal as WorkerHeavySignalKind,
        hit_count: v.hit_count,
        max_duration_ms: v.max_duration_ms,
        max_bytes: v.max_bytes,
      });
    }
    return rows.sort(
      (a, b) =>
        b.hit_count - a.hit_count || a.route_key.localeCompare(b.route_key)
    );
  }

  await ensureWorkerHeavySignalsSchema(db);
  const result = await db
    .prepare(
      `SELECT route_key, signal, hit_count, max_duration_ms, max_bytes
       FROM worker_heavy_signals
       WHERE stat_date = ?1
       ORDER BY hit_count DESC, route_key ASC
       LIMIT 40`
    )
    .bind(statDate)
    .all<{
      route_key: string;
      signal: string;
      hit_count: number;
      max_duration_ms: number;
      max_bytes: number;
    }>();

  return (result.results ?? []).map((row) => ({
    route_key: String(row.route_key),
    signal: row.signal as WorkerHeavySignalKind,
    hit_count: Math.max(0, Number(row.hit_count) || 0),
    max_duration_ms: Math.max(0, Number(row.max_duration_ms) || 0),
    max_bytes: Math.max(0, Number(row.max_bytes) || 0),
  }));
}

async function subjectRisk(
  db: D1Database,
  subject: "jp" | "en",
  shareDate: string
): Promise<Worker1102SubjectRisk> {
  const wordTable = subject === "jp" ? "jp_vocab_word" : "en_vocab_word";
  const sharedTable = subject === "jp" ? "jp_vocab_shared" : "en_vocab_shared";
  const imageLike =
    subject === "jp"
      ? `class_notes LIKE '%![](%' OR class_notes LIKE '%/api/jp-vocab/ref/%'`
      : `class_notes LIKE '%![](%' OR class_notes LIKE '%/api/en-vocab/ref/%'`;

  const wordRow = await db
    .prepare(
      `SELECT COUNT(*) AS word_count,
              SUM(CASE WHEN class_notes IS NOT NULL THEN 1 ELSE 0 END) AS notes_count,
              MAX(LENGTH(COALESCE(class_notes, ''))) AS max_notes,
              AVG(LENGTH(COALESCE(class_notes, ''))) AS avg_notes,
              SUM(CASE WHEN class_notes IS NOT NULL AND (${imageLike}) THEN 1 ELSE 0 END) AS img_hints
       FROM ${wordTable}`
    )
    .first<{
      word_count: number;
      notes_count: number;
      max_notes: number;
      avg_notes: number;
      img_hints: number;
    }>();

  const sharedRow = await db
    .prepare(
      `SELECT COUNT(*) AS shared_count,
              MAX(LENGTH(COALESCE(w.class_notes, ''))) AS max_notes,
              SUM(
                LENGTH(COALESCE(w.example_sentences, '')) +
                LENGTH(COALESCE(w.usage, '')) +
                LENGTH(COALESCE(w.meaning, '')) +
                LENGTH(COALESCE(w.word, ''))
              ) AS sum_list,
              MAX(
                LENGTH(COALESCE(w.example_sentences, '')) +
                LENGTH(COALESCE(w.usage, '')) +
                LENGTH(COALESCE(w.meaning, '')) +
                LENGTH(COALESCE(w.word, ''))
              ) AS max_list
       FROM ${sharedTable} s
       INNER JOIN ${wordTable} w ON w.id = s.word_id
       WHERE s.share_date = ?1`
    )
    .bind(shareDate)
    .first<{
      shared_count: number;
      max_notes: number;
      sum_list: number;
      max_list: number;
    }>();

  return {
    subject,
    word_count: Math.max(0, Number(wordRow?.word_count) || 0),
    notes_count: Math.max(0, Number(wordRow?.notes_count) || 0),
    max_notes_bytes: Math.max(0, Number(wordRow?.max_notes) || 0),
    avg_notes_bytes: Math.max(0, Math.round(Number(wordRow?.avg_notes) || 0)),
    notes_with_image_hint: Math.max(0, Number(wordRow?.img_hints) || 0),
    today_shared_count: Math.max(0, Number(sharedRow?.shared_count) || 0),
    today_shared_max_notes_bytes: Math.max(
      0,
      Number(sharedRow?.max_notes) || 0
    ),
    today_shared_sum_list_bytes: Math.max(0, Number(sharedRow?.sum_list) || 0),
    today_shared_max_list_bytes: Math.max(0, Number(sharedRow?.max_list) || 0),
  };
}

async function heaviestNotes(
  db: D1Database,
  subject: "jp" | "en",
  limit = 5
): Promise<Worker1102HeavyWord[]> {
  const wordTable = subject === "jp" ? "jp_vocab_word" : "en_vocab_word";
  const imageLike =
    subject === "jp"
      ? `class_notes LIKE '%![](%' OR class_notes LIKE '%/api/jp-vocab/ref/%'`
      : `class_notes LIKE '%![](%' OR class_notes LIKE '%/api/en-vocab/ref/%'`;
  const result = await db
    .prepare(
      `SELECT id, word, LENGTH(class_notes) AS notes_bytes,
              CASE WHEN (${imageLike}) THEN 1 ELSE 0 END AS has_img
       FROM ${wordTable}
       WHERE class_notes IS NOT NULL
       ORDER BY LENGTH(class_notes) DESC
       LIMIT ?1`
    )
    .bind(limit)
    .all<{ id: number; word: string; notes_bytes: number; has_img: number }>();

  return (result.results ?? []).map((row) => ({
    subject,
    id: Number(row.id),
    word: String(row.word ?? ""),
    notes_bytes: Math.max(0, Number(row.notes_bytes) || 0),
    has_image_hint: Number(row.has_img) > 0,
  }));
}

const RELATED_ROUTE_NEEDLES = [
  "/api/jp-vocab/shared",
  "/api/en-vocab/shared",
  "/api/jp-vocab/class-notes",
  "/api/en-vocab/class-notes",
  "/api/jp-vocab/sync",
  "/api/en-vocab/sync",
  "/jp-vocab/study",
  "/en-vocab/study",
  "/api/jp-vocab",
  "/api/en-vocab",
];

function buildRiskNotes(
  subjects: Worker1102SubjectRisk[],
  heavy: WorkerHeavySignalRow[],
  clientAgg: Worker1102ClientAggRow[]
): { level: Worker1102RiskLevel; notes: string[] } {
  const notes: string[] = [];
  let level: Worker1102RiskLevel = "ok";

  const bump = (next: Worker1102RiskLevel, msg: string) => {
    notes.push(msg);
    if (next === "critical") level = "critical";
    else if (next === "warn" && level === "ok") level = "warn";
  };

  // 英语也可几乎无备注仍 1102：不要把「备注贴图」当成主因。
  notes.push(
    "提示：英语也可无备注仍 1102 → 优先看整页 Worker 冷启动、shared/列表载荷、客户端现场与慢/5xx，备注只是次要对照"
  );

  const client1102 = clientAgg
    .filter((r) => r.event_kind === "cf_1102_html")
    .reduce((a, b) => a + b.hit_count, 0);
  if (client1102 >= 3) {
    bump(
      "critical",
      `客户端已捕获 Cloudflare 1102 HTML ${client1102} 次（见「客户端现场」）`
    );
  } else if (client1102 >= 1) {
    bump("warn", `客户端已捕获 Cloudflare 1102 HTML ${client1102} 次`);
  }

  const slow = heavy.filter((h) => h.signal === "slow");
  const large = heavy.filter((h) => h.signal === "large");
  const err = heavy.filter((h) => h.signal === "http5xx");
  if (err.reduce((a, b) => a + b.hit_count, 0) >= 5) {
    bump("critical", `本配额日热路径 HTTP 5xx 累计偏多（见重信号表）`);
  } else if (err.length) {
    bump("warn", `本配额日热路径有 HTTP 5xx 记录`);
  }
  if (slow.reduce((a, b) => a + b.hit_count, 0) >= 10) {
    bump("warn", `本配额日慢请求（≥2s）较多`);
  }
  if (large.reduce((a, b) => a + b.hit_count, 0) >= 5) {
    bump("warn", `本配额日大响应（≥80KB）较多`);
  }

  for (const s of subjects) {
    const label = s.subject === "jp" ? "日语" : "英语";
    if (s.today_shared_count >= 80) {
      bump(
        "warn",
        `${label}今日共享 ${s.today_shared_count} 条（列表字段合计约 ${s.today_shared_sum_list_bytes} 字节；与是否有备注无关）`
      );
    }
    if (s.today_shared_sum_list_bytes >= 200_000) {
      bump(
        "critical",
        `${label}今日共享列表字段合计 ${s.today_shared_sum_list_bytes} 字节（过大）`
      );
    } else if (s.today_shared_sum_list_bytes >= 80_000) {
      bump(
        "warn",
        `${label}今日共享列表字段合计 ${s.today_shared_sum_list_bytes} 字节`
      );
    }
    // 备注：仅次要；阈值抬高，避免英语无备注时仍被误导成「备注问题」
    if (s.max_notes_bytes >= 200_000) {
      bump(
        "warn",
        `${label}词库最大备注 ${s.max_notes_bytes} 字节（次要：单次按需拉备注仍可能重）`
      );
    } else if (s.max_notes_bytes >= 80_000) {
      notes.push(
        `${label}词库最大备注 ${s.max_notes_bytes} 字节（次要对照，英语无备注也会 1102）`
      );
    }
  }

  if (notes.length <= 1) {
    notes.push(
      "当前快照未见明显红灯；整页偶发 1102 仍可能是 OpenNext 冷 isolate（与备注无关）。"
    );
  }
  return { level, notes };
}

function guardrails(): Worker1102DiagnosticSummary["guardrails"] {
  const skipOk = PAGE_HTML_TRAFFIC_SKIP_PATHS.every((p) =>
    ["/jp-vocab/study", "/en-vocab/study", "/ko-pron/study"].includes(p)
  );
  return [
    {
      id: "study_html_traffic_skip",
      ok: skipOk,
      detail:
        "今日单词 HTML 不写 worker 流量表（避免与冷启动抢 CPU）",
    },
    {
      id: "cf_1102_not_self_counted",
      ok: true,
      detail:
        "硬导航整页 1102 时 Worker 已被杀；靠客户端 fetch/软导航捕获 CF HTML + page_ok 对照",
    },
    {
      id: "client_1102_guard",
      ok: true,
      detail: "Providers 挂 Worker1102ClientGuard；上报 /api/analytics/worker-1102/client-report",
    },
    {
      id: "notes_not_primary_cause",
      ok: true,
      detail:
        "英语常无备注仍可 1102 → 勿把备注当主因；优先冷启动 / shared 列表 / 客户端现场；日语备注仍按词异步拉",
    },
  ];
}

export async function getWorker1102DiagnosticSummary(
  db: D1Database,
  opts?: { quotaStatDate?: string; shareDate?: string }
): Promise<Worker1102DiagnosticSummary> {
  const shareDate = opts?.shareDate ?? beijingDateString();
  const quotaStatDate = opts?.quotaStatDate ?? workerQuotaDateString();

  const [jp, en, jpHeavy, enHeavy, heavy_signals, traffic, client_event_agg, client_event_samples] =
    await Promise.all([
      subjectRisk(db, "jp", shareDate),
      subjectRisk(db, "en", shareDate),
      heaviestNotes(db, "jp", 5),
      heaviestNotes(db, "en", 5),
      listWorkerHeavySignals(db, quotaStatDate),
      getWorkerTrafficDailySummary(db, quotaStatDate).catch(() => null),
      listWorker1102ClientAgg(db, quotaStatDate),
      listWorker1102ClientEventSamples(db, quotaStatDate),
    ]);

  const subjects = [jp, en];
  const heaviest_notes = [...jpHeavy, ...enHeavy]
    .sort((a, b) => b.notes_bytes - a.notes_bytes)
    .slice(0, 10);

  const related_traffic_routes = (traffic?.top_routes ?? [])
    .filter((row) =>
      RELATED_ROUTE_NEEDLES.some(
        (n) => row.route_key === n || row.route_key.startsWith(`${n}/`)
      )
    )
    .slice(0, 20);

  const { level, notes } = buildRiskNotes(
    subjects,
    heavy_signals,
    client_event_agg
  );

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    share_date: shareDate,
    quota_stat_date: quotaStatDate,
    risk_level: level,
    risk_notes: notes,
    subjects,
    heaviest_notes,
    heavy_signals,
    related_traffic_routes,
    traffic_total_hits: traffic?.total_hits ?? 0,
    traffic_quota_limit: traffic?.quota_limit ?? 100_000,
    guardrails: guardrails(),
    client_event_agg,
    client_event_samples,
  };
}

export async function purgeWorkerHeavySignalsOlderThan(
  db: D1Database,
  keepDays = 30
): Promise<void> {
  if (devStoreEnabled) return;
  await ensureWorkerHeavySignalsSchema(db);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  await db
    .prepare(`DELETE FROM worker_heavy_signals WHERE stat_date < ?1`)
    .bind(cutoffDate)
    .run();
}
