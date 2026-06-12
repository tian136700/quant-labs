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

export async function listVisitLogs(
  db: D1Database,
  limit = 500
): Promise<VisitLogRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 2000);

  if (devStoreEnabled) {
    return attachIpVisitCounts(devRecords.slice(0, safeLimit));
  }

  const { results } = await db
    .prepare(
      `SELECT id, ip, country_code, url_path, event_type, event_detail, locale, created_at,
              COUNT(*) OVER (PARTITION BY ip) AS ip_visit_count
       FROM visit_logs
       ORDER BY created_at DESC
       LIMIT ?1`
    )
    .bind(safeLimit)
    .all<VisitLogRecord>();

  return results ?? [];
}
