import type { UserFeedbackRecord } from "./types";

let devStoreEnabled = false;
const devRecords: UserFeedbackRecord[] = [];
let devNextId = 1;

export function enableFeedbackDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  return new Date().toISOString();
}

export type SaveFeedbackInput = {
  email: string;
  content: string;
  ip: string;
  country_code: string | null;
  geo_region?: string | null;
  geo_region_code?: string | null;
  geo_city?: string | null;
  url_path: string | null;
  locale: string | null;
};

export type SaveFeedbackResult =
  | { ok: true; record: UserFeedbackRecord }
  | { ok: false; error: string };

export async function saveUserFeedback(
  db: D1Database,
  input: SaveFeedbackInput
): Promise<SaveFeedbackResult> {
  const email = (input.email || "").trim();
  const content = (input.content || "").trim();

  if (!email) return { ok: false, error: "email_required" };
  if (!content) return { ok: false, error: "content_required" };
  if (content.length > 8000) return { ok: false, error: "content_too_long" };

  const createdAt = nowIso();

  if (devStoreEnabled) {
    const record: UserFeedbackRecord = {
      id: devNextId++,
      email,
      content,
      ip: input.ip,
      country_code: input.country_code,
      geo_region: input.geo_region ?? null,
      geo_region_code: input.geo_region_code ?? null,
      geo_city: input.geo_city ?? null,
      url_path: input.url_path,
      locale: input.locale,
      created_at: createdAt,
    };
    devRecords.unshift(record);
    return { ok: true, record };
  }

  await db
    .prepare(
      `INSERT INTO user_feedback (email, content, ip, country_code, geo_region, geo_region_code, geo_city, url_path, locale, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    )
    .bind(
      email,
      content,
      input.ip,
      input.country_code,
      input.geo_region ?? null,
      input.geo_region_code ?? null,
      input.geo_city ?? null,
      input.url_path,
      input.locale,
      createdAt
    )
    .run();

  const id = (
    await db.prepare(`SELECT last_insert_rowid() AS id`).first<{ id: number }>()
  )?.id;

  if (!id) return { ok: false, error: "save_failed" };

  const record: UserFeedbackRecord = {
    id,
    email,
    content,
    ip: input.ip,
    country_code: input.country_code,
    geo_region: input.geo_region ?? null,
    geo_region_code: input.geo_region_code ?? null,
    geo_city: input.geo_city ?? null,
    url_path: input.url_path,
    locale: input.locale,
    created_at: createdAt,
  };
  return { ok: true, record };
}

export async function listUserFeedback(
  db: D1Database,
  limit = 500
): Promise<UserFeedbackRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 2000);

  if (devStoreEnabled) {
    return devRecords.slice(0, safeLimit);
  }

  const { results } = await db
    .prepare(
      `SELECT id, email, content, ip, country_code, geo_region, geo_region_code, geo_city, url_path, locale, created_at
       FROM user_feedback
       ORDER BY created_at DESC
       LIMIT ?1`
    )
    .bind(safeLimit)
    .all<UserFeedbackRecord>();

  return results ?? [];
}
