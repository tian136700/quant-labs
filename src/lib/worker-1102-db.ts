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
import {
  classifyWorker1102FailureLane,
  isWorker1102FillRoute,
  isWorker1102RelatedTrafficRoute,
  prioritizeWorker1102ClientSamples,
  type Worker1102FailureLane,
} from "@/lib/worker-1102-triage";
import { worker1102PageHostFromHref } from "@/lib/worker-1102-client-shared";

let schemaReady = false;
let devStoreEnabled = false;

function parseWorker1102SampleDetail(detailJson: string): {
  fail_reason: string;
  host: string;
} {
  try {
    const d = JSON.parse(detailJson || "{}") as Record<string, unknown>;
    const reason = typeof d.reason === "string" ? d.reason.trim() : "";
    const hostRaw =
      (typeof d.host === "string" && d.host.trim()) ||
      worker1102PageHostFromHref(
        typeof d.page_href === "string" ? d.page_href : ""
      );
    const msg = typeof d.message === "string" ? d.message : "";
    const fallbackReason = /load failed/i.test(msg)
      ? "load_failed"
      : /failed to fetch/i.test(msg)
        ? "failed_to_fetch"
        : "";
    return {
      fail_reason: reason || fallbackReason,
      host: hostRaw,
    };
  } catch {
    return { fail_reason: "", host: "" };
  }
}

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

export type Worker1102BoardSample = Worker1102ClientEventSample & {
  /** 诊断车道：整页 HTML / shared / fill / 词表 API / 鉴权 */
  failure_lane: Worker1102FailureLane;
  /** 从 detail_json 解析：abort / load_failed / cf_1102_html … */
  fail_reason: string;
  /** 从 detail_json / page_href 解析：finance.info-quests.com 等 */
  host: string;
};

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
  /** 与 1102 相关的热路径今日命中（含 fill-* 争用；来自流量表） */
  related_traffic_routes: Array<{
    route_key: string;
    kind: string;
    hit_count: number;
  }>;
  /** fill-* 今日合计命中（与进页/HTML 抢 isolate 的主信号之一） */
  fill_contention_hits: number;
  traffic_total_hits: number;
  traffic_quota_limit: number;
  guardrails: Array<{ id: string; ok: boolean; detail: string }>;
  client_event_agg: Worker1102ClientAggRow[];
  client_event_samples: Worker1102BoardSample[];
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

/** 备注 Top 仅在体积够大时展示，避免 500B 级噪声误导 */
const HEAVIEST_NOTES_MIN_BYTES = 40_000;

function buildRiskNotes(input: {
  subjects: Worker1102SubjectRisk[];
  heavy: WorkerHeavySignalRow[];
  clientAgg: Worker1102ClientAggRow[];
  clientSamples: Worker1102BoardSample[];
  fillContentionHits: number;
  teacherQuizLiveHits?: number;
}): { level: Worker1102RiskLevel; notes: string[] } {
  const {
    subjects,
    heavy,
    clientAgg,
    clientSamples,
    fillContentionHits,
    teacherQuizLiveHits = 0,
  } = input;
  const notes: string[] = [];
  let level: Worker1102RiskLevel = "ok";

  const bump = (next: Worker1102RiskLevel, msg: string) => {
    notes.push(msg);
    if (next === "critical") level = "critical";
    else if (next === "warn" && level === "ok") level = "warn";
  };

  notes.push(
    "定位顺序：①失败车道（整页HTML / shared / fill）②有无 cf_1102_html（硬刷新整页常没有）③fill-* 争用④teacher-quiz-live（抽完末词卡是否仍在轮询）⑤shared 列表载荷；备注仅次要"
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

  const studyOrSharedFails = clientSamples.filter((s) => {
    if (s.event_kind === "page_ok" || s.event_kind === "cf_1102_html") {
      return false;
    }
    return (
      s.failure_lane === "shared_api" ||
      s.failure_lane === "html_document" ||
      /\/study/.test(s.page_path)
    );
  });
  if (studyOrSharedFails.length > 0 && client1102 === 0) {
    bump(
      "warn",
      `有 study/shared 失败但无 cf_1102_html → 常见是硬刷新「rendering the page」整页 1102（本页 JS 记不到）；对照同分钟 fill 流量与 shared 失败`
    );
  }

  const longFetch = clientSamples.find(
    (s) =>
      (s.event_kind === "fetch_network" || s.event_kind === "shared_fail") &&
      (s.duration_ms ?? 0) >= 8_000
  );
  if (longFetch) {
    bump(
      "warn",
      `客户端长耗时失败 ${longFetch.duration_ms}ms → ${longFetch.failed_url || longFetch.page_path}（isolate 忙或连接被掐）`
    );
  }

  const shortLoadFailed = clientSamples.filter(
    (s) =>
      /\/en-vocab\/study/.test(s.page_path) &&
      (s.event_kind === "fetch_network" || s.event_kind === "shared_fail") &&
      (s.fail_reason === "load_failed" ||
        /load failed/i.test(s.detail_json || "")) &&
      (s.duration_ms == null || s.duration_ms < 500)
  );
  if (shortLoadFailed.length >= 2) {
    bump(
      "warn",
      `英语今日单词有 ${shortLoadFailed.length} 次极短 Load failed（常与鉴权 API 同秒失败；页壳可成功）。优先看失败原因/主机列，勿先怪备注`
    );
  }

  const authFails = clientSamples.filter((s) => s.failure_lane === "auth_api");
  if (authFails.length >= 2) {
    bump(
      "warn",
      `鉴权 API（/api/english-teacher-review/auth）失败 ${authFails.length} 次；与 shared 同秒失败时多半是冷 isolate/连接被掐，不是备注体积`
    );
  }

  if (fillContentionHits >= 1_500) {
    bump(
      "critical",
      `词表补全 fill-* 今日合计 ${fillContentionHits} 次，易与进页 HTML/shared 抢同一 isolate`
    );
  } else if (fillContentionHits >= 500) {
    bump(
      "warn",
      `词表补全 fill-* 今日合计 ${fillContentionHits} 次（争用信号；见相关流量里的 fill-*）`
    );
  }

  if (teacherQuizLiveHits >= 2_000) {
    bump(
      "critical",
      `teacher-quiz-live 今日 ${teacherQuizLiveHits} 次：疑抽完后末词卡仍开着 peek/live 轮询（应抽完即停并清 live）`
    );
  } else if (teacherQuizLiveHits >= 400) {
    bump(
      "warn",
      `teacher-quiz-live 今日 ${teacherQuizLiveHits} 次：对照老师是否抽完仍挂末词卡；相关流量里看 /api/*/teacher-quiz-live`
    );
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
      id: "open_next_static_shell_cache",
      ok: true,
      detail:
        "open-next.config 须 staticAssetsIncrementalCache + enableCacheInterception（禁止 dummy：否则 study 永远 MISS）",
    },
    {
      id: "cf_1102_not_self_counted",
      ok: true,
      detail:
        "硬导航整页 1102 时 Worker 已被杀、无 cf_1102_html；看同分钟 shared/fetch_network + fill 争用 + page_ok 对照",
    },
    {
      id: "client_1102_guard",
      ok: true,
      detail:
        "Providers 挂 Worker1102ClientGuard；上报 /api/analytics/worker-1102/client-report",
    },
    {
      id: "notes_not_primary_cause",
      ok: true,
      detail:
        "英语常无备注仍可 1102 → 勿把备注当主因；优先冷启动 / fill 争用 / shared / 客户端现场",
    },
    {
      id: "quiz_complete_stop_live_poll",
      ok: true,
      detail:
        "抽完留末词卡须停 peek/live 并清 live；看板相关流量盯 teacher-quiz-live；规则 vocab-teacher-quiz-no-sync-poll",
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
    .filter((row) => row.notes_bytes >= HEAVIEST_NOTES_MIN_BYTES)
    .sort((a, b) => b.notes_bytes - a.notes_bytes)
    .slice(0, 10);

  const related_traffic_routes = (traffic?.top_routes ?? [])
    .filter((row) => isWorker1102RelatedTrafficRoute(row.route_key))
    .sort((a, b) => {
      const af = isWorker1102FillRoute(a.route_key) ? 0 : 1;
      const bf = isWorker1102FillRoute(b.route_key) ? 0 : 1;
      if (af !== bf) return af - bf;
      return b.hit_count - a.hit_count;
    })
    .slice(0, 25);

  const fill_contention_hits = related_traffic_routes
    .filter((row) => isWorker1102FillRoute(row.route_key))
    .reduce((sum, row) => sum + row.hit_count, 0);

  const teacher_quiz_live_hits = related_traffic_routes
    .filter((row) => /teacher-quiz-live/.test(row.route_key))
    .reduce((sum, row) => sum + row.hit_count, 0);

  const boardSamples: Worker1102BoardSample[] =
    prioritizeWorker1102ClientSamples(client_event_samples).map((row) => {
      const parsed = parseWorker1102SampleDetail(row.detail_json || "");
      return {
        ...row,
        failure_lane: classifyWorker1102FailureLane({
          eventKind: row.event_kind,
          pagePath: row.page_path,
          failedUrl: row.failed_url,
        }),
        fail_reason: parsed.fail_reason,
        host: parsed.host,
      };
    });

  const { level, notes } = buildRiskNotes({
    subjects,
    heavy: heavy_signals,
    clientAgg: client_event_agg,
    clientSamples: boardSamples,
    fillContentionHits: fill_contention_hits,
    teacherQuizLiveHits: teacher_quiz_live_hits,
  });

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
    fill_contention_hits,
    traffic_total_hits: traffic?.total_hits ?? 0,
    traffic_quota_limit: traffic?.quota_limit ?? 100_000,
    guardrails: guardrails(),
    client_event_agg,
    client_event_samples: boardSamples,
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
