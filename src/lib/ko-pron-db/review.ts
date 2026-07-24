import "server-only";

import type { KoPronCatalogLetter } from "@/lib/types";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  ensureKoPronCatalogReady,
  ensureReviewDoneSchema,
  KO_PRON_CATALOG_SELECT_COLS,
  nowIso,
  rowToCatalog,
} from "./helpers";

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
