import { ipKey, normalizeClientIp } from "@/lib/client-ip";
import type { VisitLogRecord } from "./types";

let devStoreEnabled = false;
const devRecords: VisitLogRecord[] = [];
let devNextId = 1;
let visitLogsSchemaReady = false;

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
  geo_area?: string | null;
  geo_isp?: string | null;
  username?: string | null;
  url_path: string;
  event_type: string;
  event_detail: string | null;
  locale: string | null;
};

export type CachedGeo = Pick<
  TrackVisitInput,
  | "country_code"
  | "geo_region"
  | "geo_region_code"
  | "geo_city"
  | "geo_area"
  | "geo_isp"
>;

async function listVisitLogColumnNames(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare(`PRAGMA table_info(visit_logs)`)
    .all<{ name: string }>();
  return new Set((results ?? []).map((row) => row.name));
}

async function addVisitLogColumnIfMissing(
  db: D1Database,
  cols: Set<string>,
  name: string,
  sqlType: string
): Promise<void> {
  if (cols.has(name)) return;
  await db.prepare(`ALTER TABLE visit_logs ADD COLUMN ${name} ${sqlType}`).run();
  cols.add(name);
}

/** 旧库补齐 geo_area / geo_isp / updated_at（新库 schema.sql 已含） */
export async function ensureVisitLogsSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled || visitLogsSchemaReady) return;
  const cols = await listVisitLogColumnNames(db);
  if (cols.size === 0) {
    visitLogsSchemaReady = true;
    return;
  }
  await addVisitLogColumnIfMissing(db, cols, "geo_area", "TEXT");
  await addVisitLogColumnIfMissing(db, cols, "geo_isp", "TEXT");
  await addVisitLogColumnIfMissing(db, cols, "updated_at", "TEXT");
  visitLogsSchemaReady = true;
}

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
          row.geo_area?.trim() ||
          row.geo_region_code?.trim())
    );
    if (!hit) return null;
    return {
      country_code: hit.country_code,
      geo_region: hit.geo_region ?? null,
      geo_region_code: hit.geo_region_code ?? null,
      geo_city: hit.geo_city ?? null,
      geo_area: hit.geo_area ?? null,
      geo_isp: hit.geo_isp ?? null,
    };
  }

  await ensureVisitLogsSchema(db);
  const row = await db
    .prepare(
      `SELECT country_code, geo_region, geo_region_code, geo_city, geo_area, geo_isp
       FROM visit_logs
       WHERE ip = ?1
         AND (
           geo_region IS NOT NULL
           OR geo_city IS NOT NULL
           OR geo_area IS NOT NULL
           OR geo_region_code IS NOT NULL
           OR geo_isp IS NOT NULL
         )
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(normalized)
    .first<CachedGeo>();

  if (!row) return null;
  if (
    !row.geo_region?.trim() &&
    !row.geo_city?.trim() &&
    !row.geo_area?.trim() &&
    !row.geo_region_code?.trim() &&
    !row.geo_isp?.trim()
  ) {
    return null;
  }
  return row;
}

/**
 * 定时任务 / 回填：把已查到的归属地写到该 IP 的所有访问日志，并刷新 updated_at。
 */
export async function copyIpGeoOntoVisitLogs(
  db: D1Database,
  rawIp: string,
  geo: {
    ok: boolean;
    country_code?: string | null;
    prov?: string | null;
    city?: string | null;
    area?: string | null;
    isp?: string | null;
  }
): Promise<number> {
  const key = ipKey(rawIp);
  if (!key || !geo.ok) return 0;
  const updatedAt = nowIso();
  const countryCode = (geo.country_code || "").trim().toUpperCase() || null;
  const geoRegion = (geo.prov || "").trim() || null;
  const geoCity = (geo.city || "").trim() || null;
  const geoArea = (geo.area || "").trim() || null;
  const geoIsp = (geo.isp || "").trim() || null;

  if (devStoreEnabled) {
    let n = 0;
    for (const row of devRecords) {
      if (ipKey(row.ip) !== key) continue;
      row.country_code = countryCode ?? row.country_code;
      row.geo_region = geoRegion;
      row.geo_city = geoCity;
      row.geo_area = geoArea;
      row.geo_isp = geoIsp;
      row.updated_at = updatedAt;
      n += 1;
    }
    return n;
  }

  await ensureVisitLogsSchema(db);
  const result = await db
    .prepare(
      `UPDATE visit_logs
       SET country_code = COALESCE(?1, country_code),
           geo_region = ?2,
           geo_city = ?3,
           geo_area = ?4,
           geo_isp = ?5,
           updated_at = ?6
       WHERE ip IS NOT NULL
         AND (ip = ?7 OR TRIM(ip) = ?7)`
    )
    .bind(countryCode, geoRegion, geoCity, geoArea, geoIsp, updatedAt, key)
    .run();
  return Number(result.meta?.changes ?? 0);
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
      geo_area: input.geo_area ?? null,
      geo_isp: input.geo_isp ?? null,
      username: input.username ?? null,
      url_path: urlPath,
      event_type: eventType,
      event_detail: eventDetail,
      locale: input.locale,
      created_at: createdAt,
      updated_at: createdAt,
    };
    devRecords.unshift(record);
    return record;
  }

  await ensureVisitLogsSchema(db);
  await db
    .prepare(
      `INSERT INTO visit_logs (
         ip, country_code, geo_region, geo_region_code, geo_city, geo_area, geo_isp,
         username, url_path, event_type, event_detail, locale, created_at, updated_at
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
    )
    .bind(
      ip,
      input.country_code,
      input.geo_region ?? null,
      input.geo_region_code ?? null,
      input.geo_city ?? null,
      input.geo_area ?? null,
      input.geo_isp ?? null,
      input.username ?? null,
      urlPath,
      eventType,
      eventDetail,
      input.locale,
      createdAt,
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
    geo_area: input.geo_area ?? null,
    geo_isp: input.geo_isp ?? null,
    username: input.username ?? null,
    url_path: urlPath,
    event_type: eventType,
    event_detail: eventDetail,
    locale: input.locale,
    created_at: createdAt,
    updated_at: createdAt,
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
    updated_at: row.updated_at ?? row.created_at,
    ip_visit_count: ipVisitCounts.get(ipKey(row.ip)) ?? row.ip_visit_count ?? 0,
  }));
}

export const VISIT_LOG_SORT_FIELDS = [
  "id",
  "ip",
  "ip_visit_count",
  "username",
  "country",
  "geo_isp",
  "url_path",
  "event_type",
  "event_detail",
  "locale",
  "created_at",
  "updated_at",
] as const;

export type VisitLogSortField = (typeof VISIT_LOG_SORT_FIELDS)[number];
export type VisitLogSortOrder = "asc" | "desc";

export function parseVisitLogSortField(
  raw: string | null | undefined
): VisitLogSortField {
  if (
    raw &&
    (VISIT_LOG_SORT_FIELDS as readonly string[]).includes(raw)
  ) {
    return raw as VisitLogSortField;
  }
  return "created_at";
}

/** 访问日志筛选：未注册用户（username 为空） */
export const VISIT_LOG_USERNAME_UNREGISTERED = "__unregistered__";

/** 未登录访问日志只保留近 N 天（登录用户记录不按此裁剪） */
export const VISIT_LOG_UNREGISTERED_RETENTION_DAYS = 10;

function unregisteredVisitLogsCutoffIso(
  retentionDays = VISIT_LOG_UNREGISTERED_RETENTION_DAYS
): string {
  const days = Math.max(1, Math.floor(retentionDays));
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 删除「未登录」且早于保留窗口的访问日志。
 * 未登录 = username 为空；已登录用户的记录一律保留。
 */
export async function purgeUnregisteredVisitLogsOlderThan(
  db: D1Database,
  retentionDays = VISIT_LOG_UNREGISTERED_RETENTION_DAYS
): Promise<number> {
  const cutoff = unregisteredVisitLogsCutoffIso(retentionDays);

  if (devStoreEnabled) {
    const before = devRecords.length;
    const kept = devRecords.filter((row) => {
      const name = row.username?.trim() ?? "";
      if (name) return true;
      return row.created_at >= cutoff;
    });
    devRecords.length = 0;
    devRecords.push(...kept);
    return before - kept.length;
  }

  await ensureVisitLogsSchema(db);
  const result = await db
    .prepare(
      `DELETE FROM visit_logs
       WHERE (username IS NULL OR TRIM(username) = '')
         AND created_at < ?1`
    )
    .bind(cutoff)
    .run();
  return Number(result.meta?.changes ?? 0);
}

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

  await ensureVisitLogsSchema(db);
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

function visitCountrySortKey(row: VisitLogRecord): string {
  return (
    row.geo_region?.trim() ||
    row.geo_city?.trim() ||
    row.geo_area?.trim() ||
    row.country_code?.trim() ||
    ""
  );
}

function visitUpdatedAt(row: VisitLogRecord): string {
  return row.updated_at?.trim() || row.created_at;
}

function compareText(a: string, b: string, dir: number): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" }) * dir;
}

function sortVisitRecords(
  records: VisitLogRecord[],
  sort: VisitLogSortField,
  order: VisitLogSortOrder
): VisitLogRecord[] {
  const dir = order === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    let primary = 0;
    switch (sort) {
      case "id":
        primary = (a.id - b.id) * dir;
        break;
      case "ip":
        primary = compareText(a.ip || "", b.ip || "", dir);
        break;
      case "ip_visit_count":
        primary = ((a.ip_visit_count ?? 0) - (b.ip_visit_count ?? 0)) * dir;
        break;
      case "username":
        primary = compareText(a.username || "", b.username || "", dir);
        break;
      case "country":
        primary = compareText(visitCountrySortKey(a), visitCountrySortKey(b), dir);
        break;
      case "geo_isp":
        primary = compareText(a.geo_isp || "", b.geo_isp || "", dir);
        break;
      case "url_path":
        primary = compareText(a.url_path || "", b.url_path || "", dir);
        break;
      case "event_type":
        primary = compareText(a.event_type || "", b.event_type || "", dir);
        break;
      case "event_detail":
        primary = compareText(a.event_detail || "", b.event_detail || "", dir);
        break;
      case "locale":
        primary = compareText(a.locale || "", b.locale || "", dir);
        break;
      case "updated_at":
        primary =
          (new Date(visitUpdatedAt(a)).getTime() -
            new Date(visitUpdatedAt(b)).getTime()) *
          dir;
        break;
      case "created_at":
      default:
        primary =
          (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) *
          dir;
        break;
    }
    if (primary !== 0) return primary;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/** SQL ORDER BY 表达式（白名单；禁止拼接外部字符串） */
function visitLogOrderSqlExpr(sort: VisitLogSortField): string {
  switch (sort) {
    case "id":
      return "id";
    case "ip":
      return "ip COLLATE NOCASE";
    case "username":
      return "username COLLATE NOCASE";
    case "country":
      return "COALESCE(geo_region, geo_city, geo_area, country_code, '') COLLATE NOCASE";
    case "geo_isp":
      return "COALESCE(geo_isp, '') COLLATE NOCASE";
    case "url_path":
      return "url_path COLLATE NOCASE";
    case "event_type":
      return "event_type COLLATE NOCASE";
    case "event_detail":
      return "event_detail COLLATE NOCASE";
    case "locale":
      return "locale COLLATE NOCASE";
    case "updated_at":
      return "COALESCE(updated_at, created_at)";
    case "created_at":
    default:
      return "created_at";
  }
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

  await ensureVisitLogsSchema(db);
  const { clause, bind } = usernameFilterSql(usernameFilter);
  const stmt = db.prepare(`SELECT COUNT(*) AS total FROM visit_logs ${clause}`);
  const row = bind
    ? await stmt.bind(bind).first<{ total: number }>()
    : await stmt.first<{ total: number }>();
  return row?.total ?? 0;
}

const VISIT_SELECT_COLS = `id, ip, country_code, geo_region, geo_region_code, geo_city, geo_area, geo_isp, username, url_path, event_type, event_detail, locale, created_at, updated_at`;

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
  const safeSort = parseVisitLogSortField(sort);
  const safeOrder: VisitLogSortOrder = order === "asc" ? "asc" : "desc";
  const safeUsernameFilter = usernameFilter?.trim() || null;

  // 列表前顺手裁剪：未登录 IP 只留近 10 天（DELETE 0 行时很轻）
  await purgeUnregisteredVisitLogsOlderThan(db);

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

  await ensureVisitLogsSchema(db);
  const { clause, bind } = usernameFilterSql(safeUsernameFilter);
  const total = await countVisitLogs(db, safeUsernameFilter);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;

  const ipVisitCounts = await loadNormalizedIpVisitCounts(db);

  let records: VisitLogRecord[];
  if (safeSort === "ip_visit_count") {
    const stmt = db.prepare(
      `SELECT ${VISIT_SELECT_COLS} FROM visit_logs ${clause}`
    );
    const { results } = bind
      ? await stmt.bind(bind).all<VisitLogRecord>()
      : await stmt.all<VisitLogRecord>();
    const decorated = decorateVisitRecords(results ?? [], ipVisitCounts);
    const sorted = sortVisitRecords(decorated, safeSort, safeOrder);
    records = sorted.slice(offset, offset + safePageSize);
  } else {
    const orderExpr = visitLogOrderSqlExpr(safeSort);
    const stmt = db.prepare(
      `SELECT ${VISIT_SELECT_COLS}
       FROM visit_logs
       ${clause}
       ORDER BY ${orderExpr} ${safeOrder.toUpperCase()}
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
