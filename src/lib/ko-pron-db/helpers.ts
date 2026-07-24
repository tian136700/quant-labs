import "server-only";

import type { KoPronCatalogLetter, KoPronLetter, KoPronLevel } from "@/lib/types";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { KO_PRON_SEED_LETTERS } from "@/lib/ko-pron-seed";
import { defaultKoPronTeacherVisibleLimit } from "@/lib/ko-pron-teacher-visible";
import { KO_PRON_TEACHER_QUIZ_LIVE_EMPTY } from "@/lib/ko-pron-teacher-quiz-live";
import {
  koPronDbState,
  TEACHER_VISIBLE_LIMIT_KEY,
  TEACHER_QUIZ_LIVE_KEY,
  DAILY_DISPLAY_ORDER_KEY,
  QUIZ_POOL_SPLIT_MIGRATION_KEY,
  VOWEL_CATEGORY_RENAME_MIGRATION_KEY,
  VOWEL_CATEGORY_TEXTBOOK_MIGRATION_KEY,
} from "./state";

export function isSqliteDuplicateColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate column name/i.test(msg);
}

/**
 * D1 多 isolate 并发时，PRAGMA 之后两边都可能认为缺列并 ALTER；
 * 后到的会 SQLITE duplicate column —— 必须吞掉，否则 schemaReady 永远起不来、接口全 500。
 */
export async function addKoPronCatalogColumnIfMissing(
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
export const KO_PRON_CATALOG_SELECT_COLS = `id, letter, reading, meaning, category,
              selected_at, review_selected_at,
              review_cnt_familiar, review_cnt_unfamiliar, review_count,
              today_review_count, today_review_date,
              created_at, updated_at`;

export function nowIso(): string {
  return new Date().toISOString();
}

export function rowToLetter(row: Record<string, unknown>): KoPronLetter {
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

export function rowToCatalog(row: Record<string, unknown>): KoPronCatalogLetter {
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

export async function ensureLetterSchema(db: D1Database): Promise<void> {
  if (koPronDbState.letterSchemaReady) return;
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
  koPronDbState.letterSchemaReady = true;
}

export async function ensureCatalogSchema(db: D1Database): Promise<void> {
  if (koPronDbState.catalogSchemaReady) return;
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
  koPronDbState.catalogSchemaReady = true;
}

export async function ensureReviewDoneSchema(db: D1Database): Promise<void> {
  if (koPronDbState.reviewDoneSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ko_pron_review_done (
         catalog_id INTEGER PRIMARY KEY,
         reviewed_at TEXT NOT NULL
       )`
    )
    .run();
  koPronDbState.reviewDoneSchemaReady = true;
}

export async function ensureSettingSchema(db: D1Database): Promise<void> {
  if (koPronDbState.settingSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ko_pron_setting (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`
    )
    .run();
  koPronDbState.settingSchemaReady = true;
}

export async function getSettingRaw(
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

export async function setSettingRaw(
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
export async function seedCatalogIfEmpty(db: D1Database): Promise<void> {
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
export async function migrateQuizPoolSplitOnce(db: D1Database): Promise<void> {
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
export async function migrateVowelCategoryRenameOnce(
  db: D1Database
): Promise<void> {
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
export async function migrateVowelCategoryTextbookOnce(
  db: D1Database
): Promise<void> {
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
export async function ensureKoPronCatalogReady(db: D1Database): Promise<void> {
  if (koPronDbState.catalogReady) return;
  await ensureCatalogSchema(db);
  await ensureLetterSchema(db);
  await ensureReviewDoneSchema(db);
  await seedCatalogIfEmpty(db);
  await migrateQuizPoolSplitOnce(db);
  await migrateVowelCategoryRenameOnce(db);
  await migrateVowelCategoryTextbookOnce(db);
  koPronDbState.catalogReady = true;
}

export async function ensureQuizReady(db: D1Database): Promise<void> {
  await ensureKoPronCatalogReady(db);
}
