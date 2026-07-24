import "server-only";

import type { KoPronCatalogLetter, KoPronLetter } from "@/lib/types";
import {
  ensureKoPronCatalogReady,
  KO_PRON_CATALOG_SELECT_COLS,
  rowToCatalog,
  rowToLetter,
} from "./helpers";

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
