import { ipKey, normalizeClientIp } from "@/lib/client-ip";
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
  username?: string | null;
  url_path: string;
  event_type: string;
  event_detail: string | null;
  locale: string | null;
};

export type CachedGeo = Pick<
  TrackVisitInput,
  "country_code" | "geo_region" | "geo_region_code" | "geo_city"
>;

/** 同一 IP 曾写入过省市则复用，避免重复调外部 IP 库 */
export async function findCachedGeoForIp(
  db: D1Database,
  ip: string
): Promise<CachedGeo | null> {
  const normalized = normalizeClientIp(ip) ?? ip;

  if (devStoreEnabled) {
    const hit = devRecords.find(
      (row) =>
        ipKey(row.ip) === ipKey(normalized) &&
        (row.geo_region?.trim() ||
          row.geo_city?.trim() ||
          row.geo_region_code?.trim())
    );
    if (!hit) return null;
    return {
      country_code: hit.country_code,
      geo_region: hit.geo_region ?? null,
      geo_region_code: hit.geo_region_code ?? null,
      geo_city: hit.geo_city ?? null,
    };
  }

  const row = await db
    .prepare(
      `SELECT country_code, geo_region, geo_region_code, geo_city
       FROM visit_logs
       WHERE ip = ?1
         AND (geo_region IS NOT NULL OR geo_city IS NOT NULL OR geo_region_code IS NOT NULL)
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(normalized)
    .first<CachedGeo>();

  if (!row) return null;
  if (
    !row.geo_region?.trim() &&
    !row.geo_city?.trim() &&
    !row.geo_region_code?.trim()
  ) {
    return null;
  }
  return row;
}

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

  const ip = normalizeClientIp(input.ip) ?? input.ip;

  if (devStoreEnabled) {
    const record: VisitLogRecord = {
      id: devNextId++,
      ip,
      country_code: input.country_code,
      geo_region: input.geo_region ?? null,
      geo_region_code: input.geo_region_code ?? null,
      geo_city: input.geo_city ?? null,
      username: input.username ?? null,
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
      `INSERT INTO visit_logs (ip, country_code, geo_region, geo_region_code, geo_city, username, url_path, event_type, event_detail, locale, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    )
    .bind(
      ip,
      input.country_code,
      input.geo_region ?? null,
      input.geo_region_code ?? null,
      input.geo_city ?? null,
      input.username ?? null,
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
    ip,
    country_code: input.country_code,
    geo_region: input.geo_region ?? null,
    geo_region_code: input.geo_region_code ?? null,
    geo_city: input.geo_city ?? null,
    username: input.username ?? null,
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
    const key = ipKey(row.ip);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return records.map((row) => ({
    ...row,
    ip: normalizeClientIp(row.ip) ?? row.ip,
    ip_visit_count: counts.get(ipKey(row.ip)) ?? 0,
  }));
}

async function loadNormalizedIpVisitCounts(
  db: D1Database
): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(`SELECT ip FROM visit_logs`)
    .all<{ ip: string }>();

  const counts = new Map<string, number>();
  for (const row of results ?? []) {
    const key = ipKey(row.ip);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function decorateVisitRecords(
  records: VisitLogRecord[],
  ipVisitCounts: Map<string, number>
): VisitLogRecord[] {
  return records.map((row) => ({
    ...row,
    ip: normalizeClientIp(row.ip) ?? row.ip,
    ip_visit_count: ipVisitCounts.get(ipKey(row.ip)) ?? row.ip_visit_count ?? 0,
  }));
}

export type VisitLogSortField = "created_at" | "ip_visit_count";
export type VisitLogSortOrder = "asc" | "desc";

/** 访问日志筛选：未注册用户（username 为空） */
export const VISIT_LOG_USERNAME_UNREGISTERED = "__unregistered__";

export type VisitLogsPage = {
  records: VisitLogRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: VisitLogSortField;
  order: VisitLogSortOrder;
  usernameFilter: string | null;
};

function matchesUsernameFilter(
  row: VisitLogRecord,
  usernameFilter: string | null | undefined
): boolean {
  const filter = usernameFilter?.trim();
  if (!filter) return true;
  const name = row.username?.trim() ?? "";
  if (filter === VISIT_LOG_USERNAME_UNREGISTERED) return !name;
  return name.localeCompare(filter, undefined, { sensitivity: "base" }) === 0;
}

function usernameFilterSql(usernameFilter: string | null | undefined): {
  clause: string;
  bind: string | null;
} {
  const filter = usernameFilter?.trim();
  if (!filter) return { clause: "", bind: null };
  if (filter === VISIT_LOG_USERNAME_UNREGISTERED) {
    return {
      clause: "WHERE (username IS NULL OR TRIM(username) = '')",
      bind: null,
    };
  }
  return {
    clause: "WHERE username = ?1 COLLATE NOCASE",
    bind: filter,
  };
}

function sortUsernames(names: Iterable<string>): string[] {
  return [...new Set([...names].map((name) => name.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export async function listDistinctVisitUsernames(
  db: D1Database
): Promise<string[]> {
  if (devStoreEnabled) {
    return sortUsernames(
      devRecords.map((row) => row.username?.trim() ?? "").filter(Boolean)
    );
  }

  const { results } = await db
    .prepare(
      `SELECT DISTINCT username
       FROM visit_logs
       WHERE username IS NOT NULL AND TRIM(username) != ''
       ORDER BY username COLLATE NOCASE ASC`
    )
    .all<{ username: string }>();

  return sortUsernames((results ?? []).map((row) => row.username));
}

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

export async function countVisitLogs(
  db: D1Database,
  usernameFilter?: string | null
): Promise<number> {
  if (devStoreEnabled) {
    return devRecords.filter((row) =>
      matchesUsernameFilter(row, usernameFilter)
    ).length;
  }

  const { clause, bind } = usernameFilterSql(usernameFilter);
  const stmt = db.prepare(`SELECT COUNT(*) AS total FROM visit_logs ${clause}`);
  const row = bind
    ? await stmt.bind(bind).first<{ total: number }>()
    : await stmt.first<{ total: number }>();
  return row?.total ?? 0;
}

export async function listVisitLogs(
  db: D1Database,
  page = 1,
  pageSize = 50,
  sort: VisitLogSortField = "created_at",
  order: VisitLogSortOrder = "desc",
  usernameFilter?: string | null
): Promise<VisitLogsPage> {
  const safePageSize = Math.min(Math.max(pageSize, 1), 200);
  const safePage = Math.max(page, 1);
  const safeSort: VisitLogSortField =
    sort === "ip_visit_count" ? "ip_visit_count" : "created_at";
  const safeOrder: VisitLogSortOrder = order === "asc" ? "asc" : "desc";
  const safeUsernameFilter = usernameFilter?.trim() || null;

  if (devStoreEnabled) {
    const filtered = devRecords.filter((row) =>
      matchesUsernameFilter(row, safeUsernameFilter)
    );
    const sorted = sortVisitRecords(
      attachIpVisitCounts(filtered),
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
      usernameFilter: safeUsernameFilter,
    };
  }

  const { clause, bind } = usernameFilterSql(safeUsernameFilter);
  const total = await countVisitLogs(db, safeUsernameFilter);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;

  const ipVisitCounts = await loadNormalizedIpVisitCounts(db);
  const selectCols = `id, ip, country_code, geo_region, geo_region_code, geo_city, username, url_path, event_type, event_detail, locale, created_at`;

  let records: VisitLogRecord[];
  if (safeSort === "ip_visit_count") {
    const stmt = db.prepare(
      `SELECT ${selectCols} FROM visit_logs ${clause}`
    );
    const { results } = bind
      ? await stmt.bind(bind).all<VisitLogRecord>()
      : await stmt.all<VisitLogRecord>();
    const decorated = decorateVisitRecords(results ?? [], ipVisitCounts);
    const sorted = sortVisitRecords(decorated, safeSort, safeOrder);
    records = sorted.slice(offset, offset + safePageSize);
  } else {
    const stmt = db.prepare(
      `SELECT ${selectCols}
       FROM visit_logs
       ${clause}
       ORDER BY created_at ${safeOrder.toUpperCase()}
       LIMIT ?${bind ? 2 : 1} OFFSET ?${bind ? 3 : 2}`
    );
    const { results } = bind
      ? await stmt.bind(bind, safePageSize, offset).all<VisitLogRecord>()
      : await stmt.bind(safePageSize, offset).all<VisitLogRecord>();
    records = decorateVisitRecords(results ?? [], ipVisitCounts);
  }

  return {
    records,
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
    sort: safeSort,
    order: safeOrder,
    usernameFilter: safeUsernameFilter,
  };
}
