import "server-only";

import type { KoPronLetter, KoPronLevel } from "@/lib/types";
import { beijingDateTimeString } from "@/lib/jp-vocab-daily-check";
import {
  applyKoPronReview,
  isKoPronLetterReviewLocked,
} from "@/lib/ko-pron-review";
import {
  computeKoPronDailyQuizProgress,
  type KoPronDailyQuizProgress,
} from "@/lib/ko-pron-daily-quiz-progress";
import type { KoPronDailyDisplayOrder } from "@/lib/ko-pron-daily-order";
import type { KoPronTeacherVisibleLimit } from "@/lib/ko-pron-teacher-visible";
import {
  ensureKoPronCatalogReady,
  ensureQuizReady,
  rowToLetter,
} from "./helpers";
import {
  ensureKoPronDailyDisplayOrder,
  ensureKoPronTeacherVisibleLimit,
} from "./daily_settings";

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

export type RecordKoPronReviewResult =
  | { ok: true; letter: KoPronLetter }
  | { ok: false; error: "not_found" | "review_locked" | "level_invalid" };

export async function recordKoPronReview(
  db: D1Database,
  letterId: number,
  level: KoPronLevel
): Promise<RecordKoPronReviewResult> {
  if (!["very", "normal", "weak"].includes(level)) {
    return { ok: false, error: "level_invalid" };
  }
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
  if (!row) return { ok: false, error: "not_found" };

  const current = rowToLetter(row);
  if (isKoPronLetterReviewLocked(current)) {
    return { ok: false, error: "review_locked" };
  }
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

  return { ok: true, letter: updated };
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

export type UpdateKoPronLetterInput = {
  letter: string;
  reading: string | null;
  meaning: string | null;
  category: string | null;
};

/** 编辑抽问字母（字母 / 罗马音 / 说明 / 分类）；同步更新总库同名条目 */
export async function updateKoPronLetter(
  db: D1Database,
  letterId: number,
  input: UpdateKoPronLetterInput
): Promise<KoPronLetter | null> {
  await ensureQuizReady(db);
  const current = await getKoPronLetterById(db, letterId);
  if (!current) return null;

  const letter = (input.letter || "").trim();
  if (!letter) return null;
  const reading = (input.reading || "").trim() || null;
  const meaning = (input.meaning || "").trim() || null;
  const category = (input.category || "").trim() || null;
  const ts = beijingDateTimeString();

  await db
    .prepare(
      `UPDATE ko_pron_letter SET
         letter = ?1,
         reading = ?2,
         meaning = ?3,
         category = ?4,
         updated_at = ?5
       WHERE id = ?6`
    )
    .bind(letter, reading, meaning, category, ts, letterId)
    .run();

  // 总库按「原字母」对齐更新，避免勾选页仍显示旧读音
  await ensureKoPronCatalogReady(db);
  await db
    .prepare(
      `UPDATE ko_pron_catalog SET
         letter = ?1,
         reading = ?2,
         meaning = ?3,
         category = ?4,
         updated_at = ?5
       WHERE letter = ?6`
    )
    .bind(letter, reading, meaning, category, ts, current.letter)
    .run();

  return getKoPronLetterById(db, letterId);
}
