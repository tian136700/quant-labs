import type { VisitLogRecord } from "./types";

let devStoreEnabled = false;
const devRecords: VisitLogRecord[] = [];
let devNextId = 1;

export function enableAnalyticsDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  return new Date().toISOString();
}

export type TrackVisitInput = {
  ip: string;
  country_code: string | null;
  url_path: string;
  event_type: string;
  event_detail: string | null;
  locale: string | null;
};

export async function trackVisit(
  db: D1Database,
  input: TrackVisitInput
): Promise<VisitLogRecord> {
  const createdAt = nowIso();
  const urlPath = (input.url_path || "/").slice(0, 512);
  const eventType = (input.event_type || "page_view").slice(0, 64);
  const eventDetail = input.event_detail
    ? input.event_detail.slice(0, 512)
    : null;

  if (devStoreEnabled) {
    const record: VisitLogRecord = {
      id: devNextId++,
      ip: input.ip,
      country_code: input.country_code,
      url_path: urlPath,
      event_type: eventType,
      event_detail: eventDetail,
      locale: input.locale,
      created_at: createdAt,
    };
    devRecords.unshift(record);
    return record;
  }

  await db
    .prepare(
      `INSERT INTO visit_logs (ip, country_code, url_path, event_type, event_detail, locale, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(
      input.ip,
      input.country_code,
      urlPath,
      eventType,
      eventDetail,
      input.locale,
      createdAt
    )
    .run();

  const id = (
    await db.prepare(`SELECT last_insert_rowid() AS id`).first<{ id: number }>()
  )?.id;

  if (!id) {
    throw new Error("track_failed");
  }

  return {
    id,
    ip: input.ip,
    country_code: input.country_code,
    url_path: urlPath,
    event_type: eventType,
    event_detail: eventDetail,
    locale: input.locale,
    created_at: createdAt,
  };
}

function attachIpVisitCounts(records: VisitLogRecord[]): VisitLogRecord[] {
  const counts = new Map<string, number>();
  for (const row of devRecords) {
    counts.set(row.ip, (counts.get(row.ip) ?? 0) + 1);
  }
  return records.map((row) => ({
    ...row,
    ip_visit_count: counts.get(row.ip) ?? 0,
  }));
}

export type VisitLogsPage = {
  records: VisitLogRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function countVisitLogs(db: D1Database): Promise<number> {
  if (devStoreEnabled) {
    return devRecords.length;
  }

  const row = await db
    .prepare(`SELECT COUNT(*) AS total FROM visit_logs`)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

export async function listVisitLogs(
  db: D1Database,
  page = 1,
  pageSize = 50
): Promise<VisitLogsPage> {
  const safePageSize = Math.min(Math.max(pageSize, 1), 200);
  const safePage = Math.max(page, 1);

  if (devStoreEnabled) {
    const total = devRecords.length;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const currentPage = Math.min(safePage, totalPages);
    const offset = (currentPage - 1) * safePageSize;
    const records = attachIpVisitCounts(
      devRecords.slice(offset, offset + safePageSize)
    );
    return {
      records,
      total,
      page: currentPage,
      pageSize: safePageSize,
      totalPages,
    };
  }

  const total = await countVisitLogs(db);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;

  const { results } = await db
    .prepare(
      `SELECT id, ip, country_code, url_path, event_type, event_detail, locale, created_at,
              COUNT(*) OVER (PARTITION BY ip) AS ip_visit_count
       FROM visit_logs
       ORDER BY created_at DESC
       LIMIT ?1 OFFSET ?2`
    )
    .bind(safePageSize, offset)
    .all<VisitLogRecord>();

  return {
    records: results ?? [],
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
  };
}
