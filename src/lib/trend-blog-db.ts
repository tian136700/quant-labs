export type TrendBlogLocale = "en" | "zh";

export interface TrendBlogPublishRecord {
  id: number;
  locale: TrendBlogLocale;
  slug: string;
  title: string;
  meta_description: string | null;
  headline: string;
  author: string | null;
  published_at: string;
  read_minutes: number | null;
  tags_json: string | null;
  content_html: string;
  is_published: number;
  created_at: string;
  updated_at: string;
}

export interface TrendBlogPublishInput {
  locale: TrendBlogLocale;
  slug?: string;
  title: string;
  meta_description?: string | null;
  headline: string;
  author?: string | null;
  published_at?: string;
  read_minutes?: number | null;
  tags?: string[];
  content_html: string;
  is_published?: boolean;
}

export interface TrendBlogPublicPost {
  locale: TrendBlogLocale;
  slug: string;
  title: string;
  meta_description: string | null;
  headline: string;
  author: string | null;
  published_at: string;
  read_minutes: number | null;
  tags: string[];
  content_html: string;
  updated_at: string;
}

let devStoreEnabled = false;

const devPosts = new Map<string, TrendBlogPublishRecord>();
let devIdSeq = 1;

function devKey(locale: string, slug: string): string {
  return `${locale}:${slug}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function enableTrendBlogDevStore() {
  devStoreEnabled = true;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function toPublicPost(row: TrendBlogPublishRecord): TrendBlogPublicPost {
  return {
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    meta_description: row.meta_description,
    headline: row.headline,
    author: row.author,
    published_at: row.published_at,
    read_minutes: row.read_minutes,
    tags: parseTags(row.tags_json),
    content_html: row.content_html,
    updated_at: row.updated_at,
  };
}

function normalizeLocale(value: unknown): TrendBlogLocale | null {
  if (value === "en" || value === "zh") return value;
  return null;
}

export function normalizeTrendBlogPublishInput(
  body: Record<string, unknown>
): TrendBlogPublishInput | { error: string } {
  const locale = normalizeLocale(body.locale);
  if (!locale) return { error: "locale must be en or zh" };

  const title = String(body.title || "").trim();
  const headline = String(body.headline || "").trim();
  const contentHtml = String(body.content_html || "").trim();

  if (!title) return { error: "title is required" };
  if (!headline) return { error: "headline is required" };
  if (!contentHtml) return { error: "content_html is required" };

  const slug = String(body.slug || "featured").trim() || "featured";
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((x): x is string => typeof x === "string" && x.trim()).map((x) => x.trim())
    : undefined;

  let readMinutes: number | null = null;
  if (body.read_minutes !== undefined && body.read_minutes !== null && body.read_minutes !== "") {
    const n = Number(body.read_minutes);
    if (!Number.isFinite(n) || n < 1) return { error: "read_minutes must be a positive number" };
    readMinutes = Math.round(n);
  }

  return {
    locale,
    slug,
    title,
    headline,
    content_html: contentHtml,
    meta_description:
      body.meta_description === undefined || body.meta_description === null
        ? null
        : String(body.meta_description).trim() || null,
    author:
      body.author === undefined || body.author === null
        ? null
        : String(body.author).trim() || null,
    published_at: String(body.published_at || nowIso().slice(0, 10)).trim(),
    read_minutes: readMinutes,
    tags,
    is_published: body.is_published === false ? false : true,
  };
}

export async function publishTrendBlogPost(
  db: D1Database,
  input: TrendBlogPublishInput
): Promise<{ id: number; locale: TrendBlogLocale; slug: string; updated_at: string }> {
  const slug = input.slug || "featured";
  const updatedAt = nowIso();
  const tagsJson = input.tags?.length ? JSON.stringify(input.tags) : null;
  const isPublished = input.is_published === false ? 0 : 1;

  if (devStoreEnabled) {
    const key = devKey(input.locale, slug);
    const existing = devPosts.get(key);
    const id = existing?.id ?? devIdSeq++;
    const row: TrendBlogPublishRecord = {
      id,
      locale: input.locale,
      slug,
      title: input.title,
      meta_description: input.meta_description ?? null,
      headline: input.headline,
      author: input.author ?? null,
      published_at: input.published_at || updatedAt.slice(0, 10),
      read_minutes: input.read_minutes ?? null,
      tags_json: tagsJson,
      content_html: input.content_html,
      is_published: isPublished,
      created_at: existing?.created_at ?? updatedAt,
      updated_at: updatedAt,
    };
    devPosts.set(key, row);
    return { id, locale: input.locale, slug, updated_at: updatedAt };
  }

  const existing = await db
    .prepare(
      `SELECT id FROM trend_blog_publish WHERE locale = ?1 AND slug = ?2 LIMIT 1`
    )
    .bind(input.locale, slug)
    .first<{ id: number }>();

  if (existing?.id) {
    await db
      .prepare(
        `UPDATE trend_blog_publish SET
           title = ?1, meta_description = ?2, headline = ?3, author = ?4,
           published_at = ?5, read_minutes = ?6, tags_json = ?7, content_html = ?8,
           is_published = ?9, updated_at = ?10
         WHERE id = ?11`
      )
      .bind(
        input.title,
        input.meta_description ?? null,
        input.headline,
        input.author ?? null,
        input.published_at || updatedAt.slice(0, 10),
        input.read_minutes ?? null,
        tagsJson,
        input.content_html,
        isPublished,
        updatedAt,
        existing.id
      )
      .run();

    return { id: existing.id, locale: input.locale, slug, updated_at: updatedAt };
  }

  const result = await db
    .prepare(
      `INSERT INTO trend_blog_publish (
         locale, slug, title, meta_description, headline, author,
         published_at, read_minutes, tags_json, content_html, is_published,
         created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)`
    )
    .bind(
      input.locale,
      slug,
      input.title,
      input.meta_description ?? null,
      input.headline,
      input.author ?? null,
      input.published_at || updatedAt.slice(0, 10),
      input.read_minutes ?? null,
      tagsJson,
      input.content_html,
      isPublished,
      updatedAt
    )
    .run();

  const id = Number(result.meta?.last_row_id ?? 0);
  if (!id) throw new Error("trend_blog_publish_failed");

  return { id, locale: input.locale, slug, updated_at: updatedAt };
}

export async function getLatestTrendBlogPost(
  db: D1Database,
  locale: TrendBlogLocale,
  slug = "featured"
): Promise<TrendBlogPublicPost | null> {
  if (devStoreEnabled) {
    const row = devPosts.get(devKey(locale, slug));
    if (!row || !row.is_published) return null;
    return toPublicPost(row);
  }

  const row = await db
    .prepare(
      `SELECT id, locale, slug, title, meta_description, headline, author,
              published_at, read_minutes, tags_json, content_html, is_published,
              created_at, updated_at
       FROM trend_blog_publish
       WHERE locale = ?1 AND slug = ?2 AND is_published = 1
       LIMIT 1`
    )
    .bind(locale, slug)
    .first<TrendBlogPublishRecord>();

  if (!row) return null;
  return toPublicPost(row);
}
