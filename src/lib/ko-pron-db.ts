import "server-only";

import type { KoPronCatalogLetter, KoPronLetter, KoPronLevel } from "@/lib/types";
import {
  beijingDateString,
} from "@/lib/jp-vocab-daily-check";
import { applyKoPronReview } from "@/lib/ko-pron-review";
import { KO_PRON_SEED_LETTERS } from "@/lib/ko-pron-seed";
import {
  defaultKoPronTeacherVisibleLimit,
  KO_PRON_VISIBLE_ORDER_ALGO,
  materializeKoPronTeacherVisible,
  normalizeKoPronTeacherVisibleLimit,
  withKoPronTargetAdjustmentMarker,
  type KoPronTeacherVisibleLimit,
} from "@/lib/ko-pron-teacher-visible";
import {
  computeKoPronDailyDisplayOrder,
  mergeKoPronDailyDisplayOrder,
  normalizeKoPronDailyDisplayOrder,
  type KoPronDailyDisplayOrder,
} from "@/lib/ko-pron-daily-order";
import {
  KO_PRON_TEACHER_QUIZ_LIVE_EMPTY,
  normalizeKoPronTeacherQuizLive,
  type KoPronTeacherQuizLive,
} from "@/lib/ko-pron-teacher-quiz-live";
import {
  computeKoPronDailyQuizProgress,
  type KoPronDailyQuizProgress,
} from "@/lib/ko-pron-daily-quiz-progress";

const TEACHER_VISIBLE_LIMIT_KEY = "teacher_visible_limit";
const TEACHER_QUIZ_LIVE_KEY = "teacher_quiz_live";
const DAILY_DISPLAY_ORDER_KEY = "daily_display_order";
/** 一次性：建 catalog、清空旧抽问全量种子、重置日序/可见池 */
const QUIZ_POOL_SPLIT_MIGRATION_KEY = "quiz_pool_split_v1";
/** 一次性：旧「元音/复合元音」→「单元音/双元音」（中间态；见 v2） */
const VOWEL_CATEGORY_RENAME_MIGRATION_KEY = "vowel_category_rename_v1";
/** 一次性：教材用语「单元音/双元音」→「基本元音/复合元音」 */
const VOWEL_CATEGORY_TEXTBOOK_MIGRATION_KEY = "vowel_category_textbook_v2";

let letterSchemaReady = false;
let catalogSchemaReady = false;
let settingSchemaReady = false;
let reviewDoneSchemaReady = false;
let catalogReady = false;

function isSqliteDuplicateColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate column name/i.test(msg);
}

/**
 * D1 多 isolate 并发时，PRAGMA 之后两边都可能认为缺列并 ALTER；
 * 后到的会 SQLITE duplicate column —— 必须吞掉，否则 schemaReady 永远起不来、接口全 500。
 */
async function addKoPronCatalogColumnIfMissing(
  db: D1Database,
  cols: Set<string>,
  name: string,
  sqlType: string
): Promise<void> {
  if (cols.has(name)) return;
  try {
    await db
      .prepare(`ALTER TABLE ko_pron_catalog ADD COLUMN ${name} ${sqlType}`)
      .run();
    cols.add(name);
  } catch (err) {
    if (isSqliteDuplicateColumnError(err)) {
      cols.add(name);
      return;
    }
    throw err;
  }
}

/** catalog 列表/单条查询共用列（含复习池字段 / 熟悉·不熟悉·总次数·今日次数） */
const KO_PRON_CATALOG_SELECT_COLS = `id, letter, reading, meaning, category,
              selected_at, review_selected_at,
              review_cnt_familiar, review_cnt_unfamiliar, review_count,
              today_review_count, today_review_date,
              created_at, updated_at`;

function nowIso(): string {
  return new Date().toISOString();
}

function rowToLetter(row: Record<string, unknown>): KoPronLetter {
  return {
    id: Number(row.id),
    letter: String(row.letter ?? ""),
    reading: row.reading == null ? null : String(row.reading),
    meaning: row.meaning == null ? null : String(row.meaning),
    category: row.category == null ? null : String(row.category),
    cnt_very: Number(row.cnt_very ?? 0),
    cnt_normal: Number(row.cnt_normal ?? 0),
    cnt_weak: Number(row.cnt_weak ?? 0),
    today_check_count: Number(row.today_check_count ?? 0),
    today_check_date:
      row.today_check_date == null ? null : String(row.today_check_date),
    last_review_level: (row.last_review_level as KoPronLevel | null) ?? null,
    last_review_at:
      row.last_review_at == null ? null : String(row.last_review_at),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function rowToCatalog(row: Record<string, unknown>): KoPronCatalogLetter {
  return {
    id: Number(row.id),
    letter: String(row.letter ?? ""),
    reading: row.reading == null ? null : String(row.reading),
    meaning: row.meaning == null ? null : String(row.meaning),
    category: row.category == null ? null : String(row.category),
    selected_at:
      row.selected_at == null || String(row.selected_at).trim() === ""
        ? null
        : String(row.selected_at),
    review_selected_at:
      row.review_selected_at == null ||
      String(row.review_selected_at).trim() === ""
        ? null
        : String(row.review_selected_at),
    review_cnt_familiar: Math.max(
      0,
      Math.floor(Number(row.review_cnt_familiar ?? 0)) || 0
    ),
    review_cnt_unfamiliar: Math.max(
      0,
      Math.floor(Number(row.review_cnt_unfamiliar ?? 0)) || 0
    ),
    review_count: Math.max(0, Math.floor(Number(row.review_count ?? 0)) || 0),
    today_review_count: Math.max(
      0,
      Math.floor(Number(row.today_review_count ?? 0)) || 0
    ),
    today_review_date:
      row.today_review_date == null || String(row.today_review_date).trim() === ""
        ? null
        : String(row.today_review_date),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

async function ensureLetterSchema(db: D1Database): Promise<void> {
  if (letterSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ko_pron_letter (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         letter TEXT NOT NULL,
         reading TEXT,
         meaning TEXT,
         category TEXT,
         cnt_very INTEGER NOT NULL DEFAULT 0,
         cnt_normal INTEGER NOT NULL DEFAULT 0,
         cnt_weak INTEGER NOT NULL DEFAULT 0,
         today_check_count INTEGER NOT NULL DEFAULT 0,
         today_check_date TEXT,
         last_review_level TEXT,
         last_review_at TEXT,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_ko_pron_letter_glyph
       ON ko_pron_letter (letter)`
    )
    .run();
  letterSchemaReady = true;
}

async function ensureCatalogSchema(db: D1Database): Promise<void> {
  if (catalogSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ko_pron_catalog (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         letter TEXT NOT NULL,
         reading TEXT,
         meaning TEXT,
         category TEXT,
         selected_at TEXT,
         review_selected_at TEXT,
         review_cnt_familiar INTEGER NOT NULL DEFAULT 0,
         review_cnt_unfamiliar INTEGER NOT NULL DEFAULT 0,
         review_count INTEGER NOT NULL DEFAULT 0,
         today_review_count INTEGER NOT NULL DEFAULT 0,
         today_review_date TEXT,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_ko_pron_catalog_glyph
       ON ko_pron_catalog (letter)`
    )
    .run();
  const info = await db
    .prepare(`PRAGMA table_info(ko_pron_catalog)`)
    .all<{ name: string }>();
  const cols = new Set(
    (info.results ?? [])
      .map((row) => (typeof row.name === "string" ? row.name : ""))
      .filter(Boolean)
  );
  await addKoPronCatalogColumnIfMissing(db, cols, "review_selected_at", "TEXT");
  await addKoPronCatalogColumnIfMissing(
    db,
    cols,
    "review_count",
    "INTEGER NOT NULL DEFAULT 0"
  );
  await addKoPronCatalogColumnIfMissing(
    db,
    cols,
    "review_cnt_familiar",
    "INTEGER NOT NULL DEFAULT 0"
  );
  await addKoPronCatalogColumnIfMissing(
    db,
    cols,
    "review_cnt_unfamiliar",
    "INTEGER NOT NULL DEFAULT 0"
  );
  await addKoPronCatalogColumnIfMissing(
    db,
    cols,
    "today_review_count",
    "INTEGER NOT NULL DEFAULT 0"
  );
  await addKoPronCatalogColumnIfMissing(db, cols, "today_review_date", "TEXT");
  catalogSchemaReady = true;
}

async function ensureReviewDoneSchema(db: D1Database): Promise<void> {
  if (reviewDoneSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ko_pron_review_done (
         catalog_id INTEGER PRIMARY KEY,
         reviewed_at TEXT NOT NULL
       )`
    )
    .run();
  reviewDoneSchemaReady = true;
}

async function ensureSettingSchema(db: D1Database): Promise<void> {
  if (settingSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ko_pron_setting (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`
    )
    .run();
  settingSchemaReady = true;
}

async function getSettingRaw(
  db: D1Database,
  key: string
): Promise<string | null> {
  await ensureSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM ko_pron_setting WHERE key = ?1`)
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function setSettingRaw(
  db: D1Database,
  key: string,
  value: string
): Promise<void> {
  await ensureSettingSchema(db);
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO ko_pron_setting (key, value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(key, value, ts)
    .run();
}

/** 总库种子 40 字母；禁止往抽问表 seed 全量 */
async function seedCatalogIfEmpty(db: D1Database): Promise<void> {
  await ensureCatalogSchema(db);
  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM ko_pron_catalog`)
    .first<{ c: number }>();
  if ((row?.c ?? 0) > 0) return;
  const ts = nowIso();
  const stmts = KO_PRON_SEED_LETTERS.map((item) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO ko_pron_catalog
         (letter, reading, meaning, category, selected_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6)`
      )
      .bind(item.letter, item.reading, item.meaning, item.category, ts, ts)
  );
  if (stmts.length) await db.batch(stmts);
}

/**
 * 一次性迁移：清空旧「全量种子进抽问」数据，重置日序/可见池/live。
 * catalog 单独 seed，抽问池保持空直到管理员勾选。
 */
async function migrateQuizPoolSplitOnce(db: D1Database): Promise<void> {
  await ensureSettingSchema(db);
  await ensureLetterSchema(db);
  const done = await getSettingRaw(db, QUIZ_POOL_SPLIT_MIGRATION_KEY);
  if (done === "1") return;

  await db.prepare(`DELETE FROM ko_pron_letter`).run();
  const today = beijingDateString();
  await setSettingRaw(
    db,
    DAILY_DISPLAY_ORDER_KEY,
    JSON.stringify({ date: today, ids: [] })
  );
  await setSettingRaw(
    db,
    TEACHER_VISIBLE_LIMIT_KEY,
    JSON.stringify({
      ...defaultKoPronTeacherVisibleLimit(),
      date: today,
      released_today: false,
      visible_ids: [],
      release_count: 0,
    })
  );
  await setSettingRaw(
    db,
    TEACHER_QUIZ_LIVE_KEY,
    JSON.stringify({
      ...KO_PRON_TEACHER_QUIZ_LIVE_EMPTY,
      date: today,
    })
  );
  await setSettingRaw(db, QUIZ_POOL_SPLIT_MIGRATION_KEY, "1");
}

/**
 * 一次性：分类文案「元音→单元音」「复合元音→双元音」，
 * 同步 catalog + 已入库抽问池（含说明字段）。
 */
async function migrateVowelCategoryRenameOnce(db: D1Database): Promise<void> {
  await ensureSettingSchema(db);
  await ensureCatalogSchema(db);
  await ensureLetterSchema(db);
  const done = await getSettingRaw(db, VOWEL_CATEGORY_RENAME_MIGRATION_KEY);
  if (done === "1") return;

  const ts = nowIso();
  const renames: Array<{ from: string; to: string; meaning: string }> = [
    { from: "元音", to: "单元音", meaning: "单元音" },
    { from: "复合元音", to: "双元音", meaning: "双元音" },
  ];
  const stmts = renames.flatMap(({ from, to, meaning }) => [
    db
      .prepare(
        `UPDATE ko_pron_catalog
         SET category = ?1, meaning = ?2, updated_at = ?3
         WHERE category = ?4`
      )
      .bind(to, meaning, ts, from),
    db
      .prepare(
        `UPDATE ko_pron_letter
         SET category = ?1, meaning = ?2, updated_at = ?3
         WHERE category = ?4`
      )
      .bind(to, meaning, ts, from),
  ]);
  if (stmts.length) await db.batch(stmts);
  await setSettingRaw(db, VOWEL_CATEGORY_RENAME_MIGRATION_KEY, "1");
}

/**
 * 一次性：对齐主流教材分类名「单元音→基本元音」「双元音→复合元音」
 * （字母归属不变；亦兜底旧「元音」）。
 */
async function migrateVowelCategoryTextbookOnce(db: D1Database): Promise<void> {
  await ensureSettingSchema(db);
  await ensureCatalogSchema(db);
  await ensureLetterSchema(db);
  const done = await getSettingRaw(db, VOWEL_CATEGORY_TEXTBOOK_MIGRATION_KEY);
  if (done === "1") return;

  const ts = nowIso();
  const renames: Array<{ from: string; to: string; meaning: string }> = [
    { from: "单元音", to: "基本元音", meaning: "基本元音" },
    { from: "双元音", to: "复合元音", meaning: "复合元音" },
    { from: "元音", to: "基本元音", meaning: "基本元音" },
  ];
  const stmts = renames.flatMap(({ from, to, meaning }) => [
    db
      .prepare(
        `UPDATE ko_pron_catalog
         SET category = ?1, meaning = ?2, updated_at = ?3
         WHERE category = ?4`
      )
      .bind(to, meaning, ts, from),
    db
      .prepare(
        `UPDATE ko_pron_letter
         SET category = ?1, meaning = ?2, updated_at = ?3
         WHERE category = ?4`
      )
      .bind(to, meaning, ts, from),
  ]);
  if (stmts.length) await db.batch(stmts);
  await setSettingRaw(db, VOWEL_CATEGORY_TEXTBOOK_MIGRATION_KEY, "1");
}

/** 确保 catalog 可用 + 抽问池已按拆分迁移清空过 */
async function ensureKoPronCatalogReady(db: D1Database): Promise<void> {
  if (catalogReady) return;
  await ensureCatalogSchema(db);
  await ensureLetterSchema(db);
  await ensureReviewDoneSchema(db);
  await seedCatalogIfEmpty(db);
  await migrateQuizPoolSplitOnce(db);
  await migrateVowelCategoryRenameOnce(db);
  await migrateVowelCategoryTextbookOnce(db);
  catalogReady = true;
}

async function ensureQuizReady(db: D1Database): Promise<void> {
  await ensureKoPronCatalogReady(db);
}

export async function listKoPronCatalog(
  db: D1Database
): Promise<KoPronCatalogLetter[]> {
  await ensureKoPronCatalogReady(db);
  const result = await db
    .prepare(
      `SELECT ${KO_PRON_CATALOG_SELECT_COLS}
       FROM ko_pron_catalog
       ORDER BY id ASC`
    )
    .all<Record<string, unknown>>();
  return (result.results ?? []).map(rowToCatalog);
}

export async function getKoPronCatalogById(
  db: D1Database,
  catalogId: number
): Promise<KoPronCatalogLetter | null> {
  await ensureKoPronCatalogReady(db);
  const row = await db
    .prepare(
      `SELECT ${KO_PRON_CATALOG_SELECT_COLS}
       FROM ko_pron_catalog WHERE id = ?1`
    )
    .bind(catalogId)
    .first<Record<string, unknown>>();
  return row ? rowToCatalog(row) : null;
}

/**
 * 管理员勾选：标记 catalog.selected_at，并 upsert 进抽问池。
 * 同日创建的字母靠 created_at 走「次日才进老师可见池」。
 */
export async function selectKoPronCatalogIntoQuiz(
  db: D1Database,
  catalogId: number,
  now = new Date()
): Promise<{
  catalog: KoPronCatalogLetter;
  letter: KoPronLetter;
  already_selected: boolean;
}> {
  await ensureKoPronCatalogReady(db);
  const catalog = await getKoPronCatalogById(db, catalogId);
  if (!catalog) {
    throw new Error("catalog_not_found");
  }

  const ts = now.toISOString();

  if (catalog.selected_at) {
    const existing = await db
      .prepare(
        `SELECT id, letter, reading, meaning, category,
                cnt_very, cnt_normal, cnt_weak,
                today_check_count, today_check_date,
                last_review_level, last_review_at,
                created_at, updated_at
         FROM ko_pron_letter WHERE letter = ?1`
      )
      .bind(catalog.letter)
      .first<Record<string, unknown>>();
    if (existing) {
      return {
        catalog,
        letter: rowToLetter(existing),
        already_selected: true,
      };
    }
    await db
      .prepare(
        `INSERT INTO ko_pron_letter
         (letter, reading, meaning, category, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .bind(
        catalog.letter,
        catalog.reading,
        catalog.meaning,
        catalog.category,
        catalog.selected_at,
        ts
      )
      .run();
    const letter = await db
      .prepare(
        `SELECT id, letter, reading, meaning, category,
                cnt_very, cnt_normal, cnt_weak,
                today_check_count, today_check_date,
                last_review_level, last_review_at,
                created_at, updated_at
         FROM ko_pron_letter WHERE letter = ?1`
      )
      .bind(catalog.letter)
      .first<Record<string, unknown>>();
    if (!letter) throw new Error("quiz_insert_failed");
    return {
      catalog,
      letter: rowToLetter(letter),
      already_selected: true,
    };
  }

  await db
    .prepare(
      `UPDATE ko_pron_catalog
       SET selected_at = ?1, updated_at = ?2
       WHERE id = ?3 AND selected_at IS NULL`
    )
    .bind(ts, ts, catalogId)
    .run();

  await db
    .prepare(
      `INSERT INTO ko_pron_letter
       (letter, reading, meaning, category, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(letter) DO NOTHING`
    )
    .bind(
      catalog.letter,
      catalog.reading,
      catalog.meaning,
      catalog.category,
      ts,
      ts
    )
    .run();

  const letterRow = await db
    .prepare(
      `SELECT id, letter, reading, meaning, category,
              cnt_very, cnt_normal, cnt_weak,
              today_check_count, today_check_date,
              last_review_level, last_review_at,
              created_at, updated_at
       FROM ko_pron_letter WHERE letter = ?1`
    )
    .bind(catalog.letter)
    .first<Record<string, unknown>>();
  if (!letterRow) throw new Error("quiz_insert_failed");

  const nextCatalog = await getKoPronCatalogById(db, catalogId);
  if (!nextCatalog) throw new Error("catalog_not_found");

  return {
    catalog: nextCatalog,
    letter: rowToLetter(letterRow),
    already_selected: false,
  };
}

const KO_PRON_SELECT_BATCH_MAX = 40;

/**
 * 批量勾选入库抽问池（一次 D1 batch，禁止循环逐条 run）。
 * 已勾选的 id 跳过；不存在的 id 忽略。
 */
export async function selectKoPronCatalogBatchIntoQuiz(
  db: D1Database,
  catalogIds: number[],
  now = new Date()
): Promise<{
  catalog: KoPronCatalogLetter[];
  selected_count: number;
  skipped_already: number;
}> {
  await ensureKoPronCatalogReady(db);

  const uniqueIds = [
    ...new Set(
      catalogIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id >= 1)
    ),
  ].slice(0, KO_PRON_SELECT_BATCH_MAX);

  if (!uniqueIds.length) {
    return { catalog: [], selected_count: 0, skipped_already: 0 };
  }

  const placeholders = uniqueIds.map((_, i) => `?${i + 1}`).join(", ");
  const rows = await db
    .prepare(
      `SELECT ${KO_PRON_CATALOG_SELECT_COLS}
       FROM ko_pron_catalog
       WHERE id IN (${placeholders})`
    )
    .bind(...uniqueIds)
    .all<Record<string, unknown>>();

  const found = (rows.results ?? []).map(rowToCatalog);
  const needSelect = found.filter((c) => !c.selected_at);
  const skippedAlready = found.length - needSelect.length;

  if (!needSelect.length) {
    return {
      catalog: found,
      selected_count: 0,
      skipped_already: skippedAlready,
    };
  }

  const ts = now.toISOString();
  const stmts = needSelect.flatMap((c) => [
    db
      .prepare(
        `UPDATE ko_pron_catalog
         SET selected_at = ?1, updated_at = ?2
         WHERE id = ?3 AND selected_at IS NULL`
      )
      .bind(ts, ts, c.id),
    db
      .prepare(
        `INSERT INTO ko_pron_letter
         (letter, reading, meaning, category, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(letter) DO NOTHING`
      )
      .bind(c.letter, c.reading, c.meaning, c.category, ts, ts),
  ]);
  await db.batch(stmts);

  const refreshed = await db
    .prepare(
      `SELECT ${KO_PRON_CATALOG_SELECT_COLS}
       FROM ko_pron_catalog
       WHERE id IN (${placeholders})`
    )
    .bind(...uniqueIds)
    .all<Record<string, unknown>>();

  return {
    catalog: (refreshed.results ?? []).map(rowToCatalog),
    selected_count: needSelect.length,
    skipped_already: skippedAlready,
  };
}

/**
 * 批量勾选进入复习池（不写 ko_pron_letter；与抽问池独立）。
 */
export async function selectKoPronCatalogBatchIntoReview(
  db: D1Database,
  catalogIds: number[],
  now = new Date()
): Promise<{
  catalog: KoPronCatalogLetter[];
  selected_count: number;
  skipped_already: number;
}> {
  await ensureKoPronCatalogReady(db);

  const uniqueIds = [
    ...new Set(
      catalogIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id >= 1)
    ),
  ].slice(0, KO_PRON_SELECT_BATCH_MAX);

  if (!uniqueIds.length) {
    return { catalog: [], selected_count: 0, skipped_already: 0 };
  }

  const placeholders = uniqueIds.map((_, i) => `?${i + 1}`).join(", ");
  const rows = await db
    .prepare(
      `SELECT ${KO_PRON_CATALOG_SELECT_COLS}
       FROM ko_pron_catalog
       WHERE id IN (${placeholders})`
    )
    .bind(...uniqueIds)
    .all<Record<string, unknown>>();

  const found = (rows.results ?? []).map(rowToCatalog);
  const needSelect = found.filter((c) => !c.review_selected_at);
  const skippedAlready = found.length - needSelect.length;

  if (!needSelect.length) {
    return {
      catalog: found,
      selected_count: 0,
      skipped_already: skippedAlready,
    };
  }

  const ts = now.toISOString();
  const stmts = needSelect.map((c) =>
    db
      .prepare(
        `UPDATE ko_pron_catalog
         SET review_selected_at = ?1, updated_at = ?2
         WHERE id = ?3 AND review_selected_at IS NULL`
      )
      .bind(ts, ts, c.id)
  );
  await db.batch(stmts);

  const refreshed = await db
    .prepare(
      `SELECT ${KO_PRON_CATALOG_SELECT_COLS}
       FROM ko_pron_catalog
       WHERE id IN (${placeholders})`
    )
    .bind(...uniqueIds)
    .all<Record<string, unknown>>();

  return {
    catalog: (refreshed.results ?? []).map(rowToCatalog),
    selected_count: needSelect.length,
    skipped_already: skippedAlready,
  };
}

/** 复习池：已 review_selected_at 的字母 */
export async function listKoPronReviewCatalog(
  db: D1Database
): Promise<KoPronCatalogLetter[]> {
  await ensureKoPronCatalogReady(db);
  const result = await db
    .prepare(
      `SELECT ${KO_PRON_CATALOG_SELECT_COLS}
       FROM ko_pron_catalog
       WHERE review_selected_at IS NOT NULL
       ORDER BY review_selected_at ASC, id ASC`
    )
    .all<Record<string, unknown>>();
  return (result.results ?? []).map(rowToCatalog);
}

export type KoPronReviewProgress = {
  count: number;
  reviewed_catalog_ids: number[];
};

export function normalizeKoPronReviewProgress(
  raw: Partial<KoPronReviewProgress> | null | undefined
): KoPronReviewProgress {
  const reviewed_catalog_ids = Array.isArray(raw?.reviewed_catalog_ids)
    ? [
        ...new Set(
          raw.reviewed_catalog_ids
            .map((id) => Number(id))
            .filter((id) => id > 0)
        ),
      ]
    : [];
  return {
    count: reviewed_catalog_ids.length,
    reviewed_catalog_ids,
  };
}

export async function getKoPronReviewProgress(
  db: D1Database
): Promise<KoPronReviewProgress> {
  await ensureKoPronCatalogReady(db);
  await ensureReviewDoneSchema(db);
  const rows = await db
    .prepare(
      `SELECT catalog_id FROM ko_pron_review_done ORDER BY reviewed_at ASC`
    )
    .all<{ catalog_id: number }>();
  const reviewed_catalog_ids = (rows.results ?? [])
    .map((row) => Number(row.catalog_id))
    .filter((id) => id > 0);
  return normalizeKoPronReviewProgress({ reviewed_catalog_ids });
}

export type KoPronReviewFamiliarity = "familiar" | "unfamiliar";

export function isKoPronReviewFamiliarity(
  value: unknown
): value is KoPronReviewFamiliarity {
  return value === "familiar" || value === "unfamiliar";
}

/** 复习卡点「熟悉/不熟悉」：本轮标记已复习 + 对应次数与总次数 +1 + 今日次数（清除本轮不清总次数） */
export async function recordKoPronReviewDone(
  db: D1Database,
  catalogId: number,
  familiarity: KoPronReviewFamiliarity
): Promise<
  KoPronReviewProgress & {
    catalog_id: number;
    review_cnt_familiar: number;
    review_cnt_unfamiliar: number;
    review_count: number;
    today_review_count: number;
    today_review_date: string | null;
  }
> {
  const empty = async () => {
    const progress = await getKoPronReviewProgress(db);
    return {
      ...progress,
      catalog_id: 0,
      review_cnt_familiar: 0,
      review_cnt_unfamiliar: 0,
      review_count: 0,
      today_review_count: 0,
      today_review_date: null as string | null,
    };
  };
  const id = Math.floor(Number(catalogId));
  if (!Number.isFinite(id) || id <= 0) {
    return empty();
  }
  await ensureKoPronCatalogReady(db);
  await ensureReviewDoneSchema(db);
  const ts = nowIso();
  const today = beijingDateString();
  const prev = await db
    .prepare(
      `SELECT today_review_count, today_review_date
       FROM ko_pron_catalog WHERE id = ?1`
    )
    .bind(id)
    .first<{ today_review_count: number; today_review_date: string | null }>();
  const prevDate =
    prev?.today_review_date == null || String(prev.today_review_date).trim() === ""
      ? null
      : String(prev.today_review_date);
  const nextTodayCount =
    prevDate === today
      ? Math.max(0, Math.floor(Number(prev?.today_review_count ?? 0)) || 0) + 1
      : 1;
  const bumpFamiliar = familiarity === "familiar";
  await db.batch([
    db
      .prepare(
        bumpFamiliar
          ? `UPDATE ko_pron_catalog
             SET review_cnt_familiar = COALESCE(review_cnt_familiar, 0) + 1,
                 review_count = COALESCE(review_count, 0) + 1,
                 today_review_count = ?1,
                 today_review_date = ?2,
                 updated_at = ?3
             WHERE id = ?4`
          : `UPDATE ko_pron_catalog
             SET review_cnt_unfamiliar = COALESCE(review_cnt_unfamiliar, 0) + 1,
                 review_count = COALESCE(review_count, 0) + 1,
                 today_review_count = ?1,
                 today_review_date = ?2,
                 updated_at = ?3
             WHERE id = ?4`
      )
      .bind(nextTodayCount, today, ts, id),
    db
      .prepare(
        `INSERT INTO ko_pron_review_done (catalog_id, reviewed_at)
         VALUES (?1, ?2)
         ON CONFLICT(catalog_id) DO NOTHING`
      )
      .bind(id, ts),
  ]);
  const [progress, row] = await Promise.all([
    getKoPronReviewProgress(db),
    db
      .prepare(
        `SELECT review_cnt_familiar, review_cnt_unfamiliar, review_count,
                today_review_count, today_review_date
         FROM ko_pron_catalog WHERE id = ?1`
      )
      .bind(id)
      .first<{
        review_cnt_familiar: number;
        review_cnt_unfamiliar: number;
        review_count: number;
        today_review_count: number;
        today_review_date: string | null;
      }>(),
  ]);
  return {
    ...progress,
    catalog_id: id,
    review_cnt_familiar: Math.max(
      0,
      Math.floor(Number(row?.review_cnt_familiar ?? 0)) || 0
    ),
    review_cnt_unfamiliar: Math.max(
      0,
      Math.floor(Number(row?.review_cnt_unfamiliar ?? 0)) || 0
    ),
    review_count: Math.max(0, Math.floor(Number(row?.review_count ?? 0)) || 0),
    today_review_count: Math.max(
      0,
      Math.floor(Number(row?.today_review_count ?? 0)) || 0
    ),
    today_review_date:
      row?.today_review_date == null ||
      String(row.today_review_date).trim() === ""
        ? null
        : String(row.today_review_date),
  };
}

/** 用户手动清除全部复习进度 */
export async function clearKoPronReviewDone(
  db: D1Database
): Promise<KoPronReviewProgress> {
  await ensureReviewDoneSchema(db);
  await db.prepare(`DELETE FROM ko_pron_review_done`).run();
  return normalizeKoPronReviewProgress(null);
}

export async function listKoPronLetters(db: D1Database): Promise<KoPronLetter[]> {
  await ensureQuizReady(db);
  const result = await db
    .prepare(
      `SELECT id, letter, reading, meaning, category,
              cnt_very, cnt_normal, cnt_weak,
              today_check_count, today_check_date,
              last_review_level, last_review_at,
              created_at, updated_at
       FROM ko_pron_letter
       ORDER BY id ASC`
    )
    .all<Record<string, unknown>>();
  return (result.results ?? []).map(rowToLetter);
}

export async function listKoPronLettersChangedSince(
  db: D1Database,
  since: string
): Promise<KoPronLetter[]> {
  await ensureQuizReady(db);
  if (!since.trim()) return [];
  const result = await db
    .prepare(
      `SELECT id, letter, reading, meaning, category,
              cnt_very, cnt_normal, cnt_weak,
              today_check_count, today_check_date,
              last_review_level, last_review_at,
              created_at, updated_at
       FROM ko_pron_letter
       WHERE updated_at > ?1
       ORDER BY id ASC`
    )
    .bind(since)
    .all<Record<string, unknown>>();
  return (result.results ?? []).map(rowToLetter);
}

export async function getKoPronTeacherVisibleLimit(
  db: D1Database
): Promise<KoPronTeacherVisibleLimit> {
  const raw = await getSettingRaw(db, TEACHER_VISIBLE_LIMIT_KEY);
  if (!raw) return defaultKoPronTeacherVisibleLimit();
  try {
    return normalizeKoPronTeacherVisibleLimit(JSON.parse(raw));
  } catch {
    return defaultKoPronTeacherVisibleLimit();
  }
}

export async function saveKoPronTeacherVisibleLimit(
  db: D1Database,
  visible: KoPronTeacherVisibleLimit
): Promise<KoPronTeacherVisibleLimit> {
  await setSettingRaw(db, TEACHER_VISIBLE_LIMIT_KEY, JSON.stringify(visible));
  return visible;
}

async function readKoPronDailyDisplayOrderRaw(
  db: D1Database
): Promise<KoPronDailyDisplayOrder | null> {
  const raw = await getSettingRaw(db, DAILY_DISPLAY_ORDER_KEY);
  if (!raw) return null;
  try {
    return normalizeKoPronDailyDisplayOrder(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveKoPronDailyDisplayOrder(
  db: D1Database,
  order: KoPronDailyDisplayOrder
): Promise<void> {
  await setSettingRaw(db, DAILY_DISPLAY_ORDER_KEY, JSON.stringify(order));
}

/**
 * 当日已有日序则沿用（合并增删）；跨日按日语同一套熟悉程度加权优先级重排。
 */
export async function ensureKoPronDailyDisplayOrder(
  db: D1Database,
  letters: KoPronLetter[],
  now = new Date()
): Promise<KoPronDailyDisplayOrder> {
  const today = beijingDateString(now);
  if (!letters.length) {
    const empty = { date: today, ids: [] as number[] };
    await saveKoPronDailyDisplayOrder(db, empty);
    return empty;
  }
  const stored = await readKoPronDailyDisplayOrderRaw(db);
  if (stored?.date === today && stored.ids.length > 0) {
    const merged = mergeKoPronDailyDisplayOrder(stored.ids, letters);
    const order = { date: today, ids: merged };
    if (
      merged.length !== stored.ids.length ||
      merged.some((id, i) => id !== stored.ids[i])
    ) {
      await saveKoPronDailyDisplayOrder(db, order);
    }
    return order;
  }
  const order = {
    date: today,
    ids: computeKoPronDailyDisplayOrder(letters, now),
  };
  await saveKoPronDailyDisplayOrder(db, order);
  return order;
}

export async function ensureKoPronTeacherVisibleLimit(
  db: D1Database,
  ctx?: { letters?: KoPronLetter[]; display_order?: KoPronDailyDisplayOrder }
): Promise<KoPronTeacherVisibleLimit> {
  const letters = ctx?.letters ?? (await listKoPronLetters(db));
  const display_order =
    ctx?.display_order ?? (await ensureKoPronDailyDisplayOrder(db, letters));
  const current = await getKoPronTeacherVisibleLimit(db);
  const today = beijingDateString();
  if (!letters.length) {
    const empty: KoPronTeacherVisibleLimit = {
      ...current,
      date: today,
      quiz_target: current.quiz_target || 10,
      released_today: false,
      visible_ids: [],
      release_count: 0,
      order_algo: KO_PRON_VISIBLE_ORDER_ALGO,
    };
    return saveKoPronTeacherVisibleLimit(db, empty);
  }
  if (
    current.date === today &&
    current.visible_ids?.length &&
    current.released_today &&
    current.order_algo === KO_PRON_VISIBLE_ORDER_ALGO
  ) {
    return current;
  }
  const materialized = materializeKoPronTeacherVisible(
    {
      ...current,
      date: today,
      quiz_target: current.quiz_target || 10,
    },
    letters,
    display_order
  );
  return saveKoPronTeacherVisibleLimit(db, materialized);
}

export async function setKoPronDailyQuizTarget(
  db: D1Database,
  targetCount: number
): Promise<KoPronTeacherVisibleLimit> {
  const letters = await listKoPronLetters(db);
  if (!letters.length) {
    throw new Error("empty_quiz_pool");
  }
  const display_order = await ensureKoPronDailyDisplayOrder(db, letters);
  const current = await getKoPronTeacherVisibleLimit(db);
  const quiz_target = Math.min(
    Math.max(1, Math.floor(targetCount)),
    Math.max(1, letters.length)
  );
  const draft: KoPronTeacherVisibleLimit = {
    ...current,
    quiz_target,
  };
  const materialized = withKoPronTargetAdjustmentMarker(
    materializeKoPronTeacherVisible(draft, letters, display_order)
  );
  if (!materialized.visible_ids?.length) {
    throw new Error("no_release_candidates");
  }
  return saveKoPronTeacherVisibleLimit(db, materialized);
}

export async function recordKoPronReview(
  db: D1Database,
  letterId: number,
  level: KoPronLevel
): Promise<KoPronLetter | null> {
  await ensureQuizReady(db);
  const row = await db
    .prepare(
      `SELECT id, letter, reading, meaning, category,
              cnt_very, cnt_normal, cnt_weak,
              today_check_count, today_check_date,
              last_review_level, last_review_at,
              created_at, updated_at
       FROM ko_pron_letter WHERE id = ?1`
    )
    .bind(letterId)
    .first<Record<string, unknown>>();
  if (!row) return null;

  const current = rowToLetter(row);
  const { letter: updated } = applyKoPronReview(current, level);

  await db
    .prepare(
      `UPDATE ko_pron_letter SET
         cnt_very = ?1,
         cnt_normal = ?2,
         cnt_weak = ?3,
         today_check_count = ?4,
         today_check_date = ?5,
         last_review_level = ?6,
         last_review_at = ?7,
         updated_at = ?8
       WHERE id = ?9`
    )
    .bind(
      updated.cnt_very,
      updated.cnt_normal,
      updated.cnt_weak,
      updated.today_check_count,
      updated.today_check_date,
      updated.last_review_level,
      updated.last_review_at,
      updated.updated_at,
      updated.id
    )
    .run();

  return updated;
}

export async function listKoPronBundle(db: D1Database): Promise<{
  letters: KoPronLetter[];
  teacher_visible_limit: KoPronTeacherVisibleLimit;
  display_order: KoPronDailyDisplayOrder;
}> {
  const letters = await listKoPronLetters(db);
  const display_order = await ensureKoPronDailyDisplayOrder(db, letters);
  const teacher_visible_limit = await ensureKoPronTeacherVisibleLimit(db, {
    letters,
    display_order,
  });
  return { letters, teacher_visible_limit, display_order };
}

/** 今日抽查是否已完成（供抽完后延时禁用账号） */
export async function getKoPronDailyQuizProgress(
  db: D1Database,
  now = new Date()
): Promise<KoPronDailyQuizProgress> {
  const bundle = await listKoPronBundle(db);
  return computeKoPronDailyQuizProgress(
    bundle.letters,
    bundle.teacher_visible_limit,
    now
  );
}

export async function getKoPronLetterById(
  db: D1Database,
  letterId: number
): Promise<KoPronLetter | null> {
  await ensureQuizReady(db);
  const row = await db
    .prepare(
      `SELECT id, letter, reading, meaning, category,
              cnt_very, cnt_normal, cnt_weak,
              today_check_count, today_check_date,
              last_review_level, last_review_at,
              created_at, updated_at
       FROM ko_pron_letter WHERE id = ?1`
    )
    .bind(letterId)
    .first<Record<string, unknown>>();
  return row ? rowToLetter(row) : null;
}

export async function getKoPronTeacherQuizLive(
  db: D1Database,
  now = new Date()
): Promise<KoPronTeacherQuizLive> {
  const raw = await getSettingRaw(db, TEACHER_QUIZ_LIVE_KEY);
  if (!raw) return { ...KO_PRON_TEACHER_QUIZ_LIVE_EMPTY, date: beijingDateString(now) };
  try {
    return normalizeKoPronTeacherQuizLive(JSON.parse(raw), now);
  } catch {
    return { ...KO_PRON_TEACHER_QUIZ_LIVE_EMPTY, date: beijingDateString(now) };
  }
}

async function saveKoPronTeacherQuizLive(
  db: D1Database,
  live: KoPronTeacherQuizLive
): Promise<KoPronTeacherQuizLive> {
  const next = normalizeKoPronTeacherQuizLive(live);
  await setSettingRaw(db, TEACHER_QUIZ_LIVE_KEY, JSON.stringify(next));
  return next;
}

/** 老师打开/切换抽查卡片：写入当前字母，罗马音对学生隐藏 */
export async function setKoPronTeacherQuizLiveLetter(
  db: D1Database,
  letterId: number | null,
  now = new Date()
): Promise<KoPronTeacherQuizLive> {
  const current = await getKoPronTeacherQuizLive(db, now);
  const parsedId =
    letterId != null && Number.isFinite(letterId) && letterId > 0
      ? Math.floor(letterId)
      : null;
  const letterChanged = current.letter_id !== parsedId;
  const next: KoPronTeacherQuizLive = {
    date: beijingDateString(now),
    letter_id: parsedId,
    reading_revealed: letterChanged ? false : current.reading_revealed,
    updated_at: parsedId != null ? now.toISOString() : null,
  };
  if (!letterChanged && parsedId != null) {
    next.reading_revealed = current.reading_revealed;
    next.updated_at = now.toISOString();
  }
  return saveKoPronTeacherQuizLive(db, next);
}

/** 老师勾选熟悉程度后：对学生端揭示罗马音 */
export async function revealKoPronTeacherQuizLiveReading(
  db: D1Database,
  letterId: number,
  now = new Date()
): Promise<KoPronTeacherQuizLive> {
  const current = await getKoPronTeacherQuizLive(db, now);
  const id = Math.floor(letterId);
  if (current.letter_id !== id) {
    return saveKoPronTeacherQuizLive(db, {
      date: beijingDateString(now),
      letter_id: id,
      reading_revealed: true,
      updated_at: now.toISOString(),
    });
  }
  return saveKoPronTeacherQuizLive(db, {
    ...current,
    reading_revealed: true,
    updated_at: now.toISOString(),
  });
}

export type KoPronStudyLivePayload = {
  live: KoPronTeacherQuizLive;
  letter: KoPronLetter | null;
  /** 对学生端脱敏：未揭示时 reading 为 null */
  student_letter: {
    id: number;
    letter: string;
    reading: string | null;
    meaning: string | null;
    category: string | null;
  } | null;
};

export async function getKoPronStudyLivePayload(
  db: D1Database,
  now = new Date()
): Promise<KoPronStudyLivePayload> {
  const live = await getKoPronTeacherQuizLive(db, now);
  if (!live.letter_id) {
    return { live, letter: null, student_letter: null };
  }
  const letter = await getKoPronLetterById(db, live.letter_id);
  if (!letter) {
    return { live, letter: null, student_letter: null };
  }
  return {
    live,
    letter,
    student_letter: {
      id: letter.id,
      letter: letter.letter,
      reading: live.reading_revealed ? letter.reading : null,
      meaning: live.reading_revealed ? letter.meaning : null,
      category: letter.category,
    },
  };
}
