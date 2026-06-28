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
  geo_region?: string | null;
  geo_region_code?: string | null;
  geo_city?: string | null;
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
      geo_region: input.geo_region ?? null,
      geo_region_code: input.geo_region_code ?? null,
      geo_city: input.geo_city ?? null,
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
      `INSERT INTO visit_logs (ip, country_code, geo_region, geo_region_code, geo_city, url_path, event_type, event_detail, locale, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    )
    .bind(
      input.ip,
      input.country_code,
      input.geo_region ?? null,
      input.geo_region_code ?? null,
      input.geo_city ?? null,
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
    geo_region: input.geo_region ?? null,
    geo_region_code: input.geo_region_code ?? null,
    geo_city: input.geo_city ?? null,
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

export type VisitLogSortField = "created_at" | "ip_visit_count";
export type VisitLogSortOrder = "asc" | "desc";

export type VisitLogsPage = {
  records: VisitLogRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: VisitLogSortField;
  order: VisitLogSortOrder;
};

function sortVisitRecords(
  records: VisitLogRecord[],
  sort: VisitLogSortField,
  order: VisitLogSortOrder
): VisitLogRecord[] {
  const dir = order === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    if (sort === "ip_visit_count") {
      const countDiff =
        ((a.ip_visit_count ?? 0) - (b.ip_visit_count ?? 0)) * dir;
      if (countDiff !== 0) return countDiff;
    }
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });
}

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
  pageSize = 50,
  sort: VisitLogSortField = "created_at",
  order: VisitLogSortOrder = "desc"
): Promise<VisitLogsPage> {
  const safePageSize = Math.min(Math.max(pageSize, 1), 200);
  const safePage = Math.max(page, 1);
  const safeSort: VisitLogSortField =
    sort === "ip_visit_count" ? "ip_visit_count" : "created_at";
  const safeOrder: VisitLogSortOrder = order === "asc" ? "asc" : "desc";

  if (devStoreEnabled) {
    const sorted = sortVisitRecords(
      attachIpVisitCounts([...devRecords]),
      safeSort,
      safeOrder
    );
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const currentPage = Math.min(safePage, totalPages);
    const offset = (currentPage - 1) * safePageSize;
    const records = sorted.slice(offset, offset + safePageSize);
    return {
      records,
      total,
      page: currentPage,
      pageSize: safePageSize,
      totalPages,
      sort: safeSort,
      order: safeOrder,
    };
  }

  const total = await countVisitLogs(db);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;

  const orderBy =
    safeSort === "ip_visit_count"
      ? `ip_visit_count ${safeOrder.toUpperCase()}, created_at DESC`
      : `created_at ${safeOrder.toUpperCase()}`;

  const { results } = await db
    .prepare(
      `SELECT id, ip, country_code, geo_region, geo_region_code, geo_city, url_path, event_type, event_detail, locale, created_at,
              COUNT(*) OVER (PARTITION BY ip) AS ip_visit_count
       FROM visit_logs
       ORDER BY ${orderBy}
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
    sort: safeSort,
    order: safeOrder,
  };
}
