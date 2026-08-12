import "server-only";

import type { JpVocabLevel, JpVocabWord } from "@/lib/types";
import {
  applyJpVocabReview,
  isJpVocabAdminVerySkipToday,
  isJpVocabWordReviewLocked,
} from "@/lib/jp-vocab-review";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { markJpVocabRoundChecked } from "@/lib/jp-vocab-daily-order";
import {
  applyJpVocabQuizTargetVisiblePlan,
  teacherVisibleLimitNeedsPersist,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import {
  jpVocabDbState,
  invalidateJpVocabSharedTodayCache,
} from "./state";
import {
  WORD_SELECT_LIST,
  ensureVocabWordSchema,
  mapReviewWordRow,
  nowIso,
} from "./helpers";
import {
  ensureJpVocabDailyDisplayOrder,
  ensureJpVocabSharedSchema,
  getJpVocabTeacherVisibleLimit,
  markJpVocabWordRoundChecked,
  saveJpVocabTeacherVisibleLimit,
} from "./daily_settings";
import { listJpVocabWordsForPool } from "./words";

async function isWordSharedToday(
  db: D1Database,
  wordId: number,
  now = new Date()
): Promise<boolean> {
  await ensureJpVocabSharedSchema(db);
  const today = beijingDateString(now);
  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devShared.some(
      (s) => s.share_date === today && s.word_id === wordId
    );
  }
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM jp_vocab_shared
       WHERE share_date = ?1 AND word_id = ?2
       LIMIT 1`
    )
    .bind(today, wordId)
    .first<{ ok: number }>();
  return Boolean(row);
}

export type RecordJpVocabReviewOptions = {
  /** 勾选后同步到学生「今日日语单词」 */
  shareToStudy?: boolean;
  sharedBy?: string;
  /**
   * 是否计入今日抽查名额。管理员勾「非常熟悉」传 false：
   * 不写 today_check，老师池跳过该词并从后面序号补足目标数。
   */
  countTowardDailyQuiz?: boolean;
};

export type RecordJpVocabReviewResult =
  | {
      ok: true;
      word: JpVocabWord;
      /** 该词今日已在共享列表（含本次新写入或原本已共享） */
      shared?: boolean;
      /** 本次新写入 jp_vocab_shared */
      shared_new?: boolean;
      /** 管理员跳过「非常熟悉」后重算的老师可见池（可能变） */
      teacher_visible_limit?: JpVocabTeacherVisibleLimit;
    }
  | { ok: false; error: string };

export async function recordJpVocabReview(
  db: D1Database,
  wordId: number,
  level: JpVocabLevel,
  options?: RecordJpVocabReviewOptions
): Promise<RecordJpVocabReviewResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  if (!["very", "normal", "weak"].includes(level)) {
    return { ok: false, error: "level_invalid" };
  }

  const countTowardDailyQuiz = options?.countTowardDailyQuiz !== false;
  const reviewOpts = { countTowardDailyQuiz };

  // 勾选热路径：禁止 seedIfEmpty（每次 COUNT(*)）；词表已有数据时 schema 缓存后几乎零成本
  await ensureVocabWordSchema(db);
  // 勾选默认不分享：勿每次 ensure shared 表（多余 D1）
  if (options?.shareToStudy) {
    await ensureJpVocabSharedSchema(db);
  }

  if (jpVocabDbState.devStoreEnabled) {
    const idx = jpVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    if (isJpVocabWordReviewLocked(jpVocabDbState.devWords[idx])) {
      return { ok: false, error: "review_locked" };
    }
    const prevWasAdminVerySkip = isJpVocabAdminVerySkipToday(
      jpVocabDbState.devWords[idx]
    );
    const { word: updated } = applyJpVocabReview(
      jpVocabDbState.devWords[idx],
      level,
      new Date(),
      undefined,
      reviewOpts
    );
    jpVocabDbState.devWords[idx] = updated;
    jpVocabDbState.devDailyDisplayOrder = markJpVocabRoundChecked(
      jpVocabDbState.devDailyDisplayOrder,
      wordId
    );

    const sharedByTrim = (options?.sharedBy || "").trim();
    const shouldShare = Boolean(options?.shareToStudy && sharedByTrim);
    let shared = false;
    let shared_new = false;
    if (shouldShare) {
      const today = beijingDateString();
      const already = jpVocabDbState.devShared.some(
        (s) => s.share_date === today && s.word_id === wordId
      );
      shared = already;
      if (!already) {
        const ts = nowIso();
        jpVocabDbState.devShared.push({
          id: jpVocabDbState.devSharedNextId++,
          word_id: wordId,
          shared_by: sharedByTrim,
          shared_at: ts,
          share_date: today,
          auto_marked_level: null,
        });
        shared = true;
        shared_new = true;
      }
    }

    if (shared_new) {
      invalidateJpVocabSharedTodayCache();
    }

    let teacher_visible_limit: JpVocabTeacherVisibleLimit | undefined;
    if (!countTowardDailyQuiz || prevWasAdminVerySkip) {
      teacher_visible_limit =
        await rematerializeJpVocabTeacherVisibleAfterAdminVerySkip(db);
    }

    return { ok: true, word: updated, shared, shared_new, teacher_visible_limit };
  }

  const row = await db
    .prepare(`${WORD_SELECT_LIST} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };

  const current = mapReviewWordRow(row);
  if (isJpVocabWordReviewLocked(current)) {
    return { ok: false, error: "review_locked" };
  }
  const prevWasAdminVerySkip = isJpVocabAdminVerySkipToday(current);
  const { word: updated } = applyJpVocabReview(
    current,
    level,
    new Date(),
    undefined,
    reviewOpts
  );
  const ts = updated.updated_at;
  const today = beijingDateString();
  const sharedByTrim = (options?.sharedBy || "").trim();
  const shouldShare = Boolean(options?.shareToStudy && sharedByTrim);
  const alreadySharedToday =
    shouldShare && (await isWordSharedToday(db, wordId));

  const batchStmts = [
    db
      .prepare(
        `UPDATE jp_vocab_word
       SET cnt_very = ?1,
           cnt_normal = ?2,
           cnt_weak = ?3,
           today_check_count = ?4,
           today_check_date = ?5,
           last_review_level = ?6,
           last_review_at = ?7,
           srs_interval_days = ?8,
           srs_due_date = ?9,
           updated_at = ?10
       WHERE id = ?11`
      )
      .bind(
        updated.cnt_very,
        updated.cnt_normal,
        updated.cnt_weak,
        updated.today_check_count,
        updated.today_check_date,
        updated.last_review_level,
        updated.last_review_at,
        updated.srs_interval_days ?? 0,
        updated.srs_due_date ?? null,
        updated.updated_at,
        wordId
      ),
  ];

  if (shouldShare && !alreadySharedToday) {
    batchStmts.push(
      db
        .prepare(
          `INSERT INTO jp_vocab_shared (word_id, shared_by, shared_at, share_date, auto_marked_level)
       VALUES (?1, ?2, ?3, ?4, NULL)`
        )
        .bind(wordId, sharedByTrim, ts, today)
    );
  }

  const batchResults = await db.batch(batchStmts);

  if (!batchResults[0]?.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  let shared = false;
  let shared_new = false;
  if (shouldShare) {
    shared_new = !alreadySharedToday;
    shared = shared_new || alreadySharedToday;
  }

  await markJpVocabWordRoundChecked(db, wordId);

  if (shared_new) {
    invalidateJpVocabSharedTodayCache();
  }

  let teacher_visible_limit: JpVocabTeacherVisibleLimit | undefined;
  if (!countTowardDailyQuiz || prevWasAdminVerySkip) {
    teacher_visible_limit =
      await rematerializeJpVocabTeacherVisibleAfterAdminVerySkip(db);
  }

  return { ok: true, word: updated, shared, shared_new, teacher_visible_limit };
}

/** 管理员「非常熟悉」跳过名额后：重算老师可见池（剔除该词、往后补满目标数） */
async function rematerializeJpVocabTeacherVisibleAfterAdminVerySkip(
  db: D1Database
): Promise<JpVocabTeacherVisibleLimit> {
  // 必须用 lite 列表：禁 class_notes/例句/释义；listJpVocabWordsForPool 亦禁 seedIfEmpty
  const words = await listJpVocabWordsForPool(db);
  const displayOrder = await ensureJpVocabDailyDisplayOrder(db, words);
  const visible = await getJpVocabTeacherVisibleLimit(db);
  const next = applyJpVocabQuizTargetVisiblePlan(visible, displayOrder, words);
  if (teacherVisibleLimitNeedsPersist(visible, next)) {
    return saveJpVocabTeacherVisibleLimit(db, next);
  }
  return next;
}
