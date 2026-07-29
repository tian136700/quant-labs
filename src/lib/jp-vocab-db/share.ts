import "server-only";

import {
  jpVocabDbState,
  invalidateJpVocabSharedTodayCache,
  enableJpVocabDevStore,
  JP_VOCAB_SHARE_REQUEST_COOLDOWN_MS,
  JP_VOCAB_DAILY_QUIZ_STYLE_KEY,
  JP_VOCAB_DAILY_DISPLAY_ORDER_KEY,
  JP_VOCAB_QUIZ_PRIORITY_BOOST_KEY,
  JP_VOCAB_TEACHER_VISIBLE_LIMIT_KEY,
  JP_VOCAB_TEACHER_QUIZ_LIVE_KEY,
  JP_VOCAB_SETTING_READ_CACHE_MS,
  JP_VOCAB_SHARED_LIST_CACHE_MS,
} from "./state";

import type {
  CloudflareEnv,
  JpVocabKind,
  JpVocabLevel,
  JpVocabMediaType,
  JpVocabRef,
  JpVocabRefUploadInput,
  JpVocabSharedItem,
  JpVocabShareRequest,
  JpVocabUploadInput,
  JpVocabWord,
} from "@/lib/types";
import {
  jpVocabRefKeyFromBytes,
  jpVocabRefLocalMarker,
  normalizeJpVocabRefKey,
} from "@/lib/jp-vocab-ref-shared";
import {
  jpVocabRefFileExists,
  putJpVocabRefFile,
} from "@/lib/jp-vocab-ref-server";
import { sortJpVocabWords } from "@/lib/jp-vocab-shared";
import {
  normalizeJpVocabReviewProgress,
  type JpVocabReviewProgress,
} from "@/lib/jp-vocab-review-session";
import {
  beijingDateString,
  beijingDateTimeString,
  effectiveTodayCheckCount,
  jpVocabTodayCheckStats,
} from "@/lib/jp-vocab-daily-check";
import {
  appendJpVocabQuizPriorityBoostEntry,
  buildJpVocabQuizPriorityBoostSeqMap,
  clearJpVocabQuizPriorityBoostForDate,
  normalizeJpVocabQuizPriorityBoost,
  pruneJpVocabQuizPriorityBoostWordIds,
  type JpVocabQuizPriorityBoost,
} from "@/lib/jp-vocab-quiz-priority-boost";
import {
  appendJpVocabDailyDisplayOrderId,
  computeJpVocabDailyDisplayOrder,
  markJpVocabRoundChecked,
  mergeJpVocabDailyDisplayOrder,
  normalizeJpVocabRoundCheckedIds,
  resolveJpVocabRoundCheckedIds,
  unmarkJpVocabRoundChecked,
  type JpVocabDailyDisplayOrder,
} from "@/lib/jp-vocab-daily-order";
import {
  JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
  normalizeJpVocabDailyQuizStyle,
  type JpVocabDailyQuizStyle,
} from "@/lib/jp-vocab-daily-quiz-style";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  JP_VOCAB_QUIZ_TIME_WEIGHT_KEY,
  normalizeJpVocabQuizTimeWeight,
} from "@/lib/jp-vocab-quiz-score";
import {
  JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  applyJpVocabQuizTargetVisiblePlan,
  materializeJpVocabTeacherVisibleLimit,
  normalizeJpVocabTeacherVisibleLimit,
  shouldMaterializeJpVocabTeacherVisibleLimit,
  teacherVisibleLimitNeedsPersist,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import {
  isJpVocabTeacherQuizLiveStudentPeeked,
  JP_VOCAB_TEACHER_QUIZ_LIVE_EMPTY,
  normalizeJpVocabTeacherQuizLive,
  type JpVocabTeacherQuizLive,
} from "@/lib/jp-vocab-teacher-quiz-live";
import { formatReviewIso, resolveJpVocabSharedTeacherLevel } from "@/lib/jp-vocab-review";
import { resolveJpVocabReadingIfMissing } from "@/lib/jp-vocab-fill-reading";
import { applyJpVocabReview, isJpVocabWordReviewLocked, revertJpVocabAutoShareReview } from "@/lib/jp-vocab-review";
import {
  computeJpVocabDailyQuizProgress,
  JP_VOCAB_DAILY_QUIZ_TOP,
  type JpVocabDailyQuizProgress,
} from "@/lib/jp-vocab-daily-quiz-progress";
import { parseLessonContent } from "@/lib/jp-lesson-shared";
import { listJpLessons } from "@/lib/jp-lesson-db";
import { listJpLessonNotesByLessonId, replaceLessonNotesForItem } from "@/lib/jp-lesson-note-db";
import type { JpLessonRecord } from "@/lib/types";
import {
  JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL,
  normalizeJpVocabExampleSentencesSource,
} from "@/lib/jp-vocab-example-sentences";
import { normalizeJpVocabNaAdjStoredEntry } from "@/lib/jp-vocab-na-adj";
import { ensureJpVocabCoachSchema } from "@/lib/jp-vocab-coach-db";


import {
  nowIso,
  mapRow,
  ensureVocabWordSchema,
  WORD_SELECT,
  refsRecord,
  listJpVocabRefs,
  listJpVocabRefsByKeys,
  mapSharedListWordRow,
  seedIfEmpty,
} from "./helpers";

import {
  ensureJpVocabSharedSchema,
  isJpVocabWordCheckedToday,
  mapSharedRow,
  unmarkJpVocabWordRoundChecked,
  getJpVocabTeacherVisibleLimit,
} from "./daily_settings";
import { recordJpVocabReview } from "./words";

export type ShareJpVocabWordResult =
  | { ok: true; item: JpVocabSharedItem; word: JpVocabWord }
  | { ok: false; error: string };

export async function isJpVocabWordSharedToday(
  db: D1Database,
  wordId: number,
  now = new Date()
): Promise<boolean> {
  await ensureJpVocabSharedSchema(db);
  const today = beijingDateString(now);
  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devShared.some((s) => s.share_date === today && s.word_id === wordId);
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

export async function listJpVocabSharedTodayWordIds(
  db: D1Database,
  now = new Date()
): Promise<number[]> {
  await ensureJpVocabSharedSchema(db);
  const today = beijingDateString(now);
  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devShared
      .filter((s) => s.share_date === today)
      .map((s) => s.word_id);
  }
  const result = await db
    .prepare(
      `SELECT word_id FROM jp_vocab_shared
       WHERE share_date = ?1
       ORDER BY shared_at ASC, id ASC`
    )
    .bind(today)
    .all<{ word_id: number }>();
  return (result.results ?? []).map((row) => Number(row.word_id));
}

export async function shareJpVocabWord(
  db: D1Database,
  wordId: number,
  sharedBy: string
): Promise<ShareJpVocabWordResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  const sharedByTrim = (sharedBy || "").trim();
  if (!sharedByTrim) {
    return { ok: false, error: "shared_by_required" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  await ensureJpVocabSharedSchema(db);

  const today = beijingDateString();
  const ts = nowIso();

  if (jpVocabDbState.devStoreEnabled) {
    const word = jpVocabDbState.devWords.find((w) => w.id === wordId);
    if (!word) return { ok: false, error: "not_found" };
    if (isJpVocabWordReviewLocked(word)) {
      return { ok: false, error: "review_locked" };
    }
    if (await isJpVocabWordSharedToday(db, wordId)) {
      return { ok: false, error: "already_shared_today" };
    }
    let updatedWord = word;
    const autoMarkedLevel: JpVocabLevel | null = isJpVocabWordCheckedToday(word)
      ? null
      : "weak";
    if (autoMarkedLevel) {
      const review = await recordJpVocabReview(db, wordId, autoMarkedLevel);
      if (!review.ok) return { ok: false, error: review.error };
      updatedWord = review.word;
    }
    const sharedRow = {
      id: jpVocabDbState.devSharedNextId++,
      word_id: wordId,
      shared_by: sharedByTrim,
      shared_at: ts,
      share_date: today,
      auto_marked_level: autoMarkedLevel,
    };
    jpVocabDbState.devShared.push(sharedRow);
    invalidateJpVocabSharedTodayCache();
    return {
      ok: true,
      item: mapSharedRow(sharedRow, updatedWord),
      word: updatedWord,
    };
  }

  const wordRow = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();
  if (!wordRow) return { ok: false, error: "not_found" };

  const current = mapRow(wordRow);
  if (isJpVocabWordReviewLocked(current)) {
    return { ok: false, error: "review_locked" };
  }

  const existingRow = await db
    .prepare(
      `SELECT id, word_id, shared_by, shared_at, share_date
       FROM jp_vocab_shared
       WHERE share_date = ?1 AND word_id = ?2`
    )
    .bind(today, wordId)
    .first<Record<string, unknown>>();

  if (existingRow) {
    return { ok: false, error: "already_shared_today" };
  }

  let updatedWord = current;
  const autoMarkedLevel: JpVocabLevel | null = isJpVocabWordCheckedToday(current)
    ? null
    : "weak";
  if (autoMarkedLevel) {
    const review = await recordJpVocabReview(db, wordId, autoMarkedLevel);
    if (!review.ok) return { ok: false, error: review.error };
    updatedWord = review.word;
  }

  const insert = await db
    .prepare(
      `INSERT INTO jp_vocab_shared (word_id, shared_by, shared_at, share_date, auto_marked_level)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
    .bind(wordId, sharedByTrim, ts, today, autoMarkedLevel)
    .run();
  const insertedId = Number(insert.meta?.last_row_id);
  const sharedRow = {
    id: insertedId,
    word_id: wordId,
    shared_by: sharedByTrim,
    shared_at: ts,
    share_date: today,
    auto_marked_level: autoMarkedLevel,
  };

  invalidateJpVocabSharedTodayCache();

  return {
    ok: true,
    item: mapSharedRow(sharedRow, updatedWord),
    word: updatedWord,
  };
}

export type UnshareJpVocabWordResult =
  | {
      ok: true;
      word: JpVocabWord;
      reverted: boolean;
      display_order: JpVocabDailyDisplayOrder | null;
    }
  | { ok: false; error: string };

export async function unshareJpVocabWord(
  db: D1Database,
  wordId: number
): Promise<UnshareJpVocabWordResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  await ensureJpVocabSharedSchema(db);

  const today = beijingDateString();

  if (jpVocabDbState.devStoreEnabled) {
    const idx = jpVocabDbState.devShared.findIndex(
      (s) => s.share_date === today && s.word_id === wordId
    );
    if (idx < 0) return { ok: false, error: "not_shared_today" };
    const sharedRow = jpVocabDbState.devShared[idx];
    jpVocabDbState.devShared.splice(idx, 1);

    const wordIdx = jpVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (wordIdx < 0) return { ok: false, error: "not_found" };

    let updatedWord = jpVocabDbState.devWords[wordIdx];
    const autoMarked =
      sharedRow.auto_marked_level === "very" ||
      sharedRow.auto_marked_level === "normal" ||
      sharedRow.auto_marked_level === "weak"
        ? sharedRow.auto_marked_level
        : null;
    let reverted = false;
    let display_order: JpVocabDailyDisplayOrder | null = null;
    if (autoMarked) {
      updatedWord = revertJpVocabAutoShareReview(updatedWord, autoMarked);
      jpVocabDbState.devWords[wordIdx] = updatedWord;
      reverted = true;
      display_order = await unmarkJpVocabWordRoundChecked(db, wordId);
    }

    invalidateJpVocabSharedTodayCache();
    return { ok: true, word: updatedWord, reverted, display_order };
  }

  const sharedRow = await db
    .prepare(
      `SELECT id, word_id, shared_by, shared_at, share_date, auto_marked_level
       FROM jp_vocab_shared
       WHERE share_date = ?1 AND word_id = ?2`
    )
    .bind(today, wordId)
    .first<Record<string, unknown>>();

  if (!sharedRow) return { ok: false, error: "not_shared_today" };

  const wordRow = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();
  if (!wordRow) return { ok: false, error: "not_found" };

  await db
    .prepare(`DELETE FROM jp_vocab_shared WHERE id = ?1`)
    .bind(Number(sharedRow.id))
    .run();

  let updatedWord = mapRow(wordRow);
  let reverted = false;
  let display_order: JpVocabDailyDisplayOrder | null = null;
  const rawAutoMarked = sharedRow.auto_marked_level;
  const autoMarked =
    rawAutoMarked === "very" ||
    rawAutoMarked === "normal" ||
    rawAutoMarked === "weak"
      ? rawAutoMarked
      : null;
  if (autoMarked) {
    updatedWord = revertJpVocabAutoShareReview(updatedWord, autoMarked);
    reverted = true;
    display_order = await unmarkJpVocabWordRoundChecked(db, wordId);
    await db
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
        updatedWord.cnt_very,
        updatedWord.cnt_normal,
        updatedWord.cnt_weak,
        updatedWord.today_check_count,
        updatedWord.today_check_date,
        updatedWord.last_review_level,
        updatedWord.last_review_at,
        updatedWord.srs_interval_days ?? 0,
        updatedWord.srs_due_date ?? null,
        updatedWord.updated_at,
        wordId
      )
      .run();
  }

  invalidateJpVocabSharedTodayCache();
  return { ok: true, word: updatedWord, reverted, display_order };
}

export async function listJpVocabSharedToday(
  db: D1Database,
  now = new Date()
): Promise<{ items: JpVocabSharedItem[]; refs: Record<string, JpVocabRef> }> {
  const today = beijingDateString(now);
  const nowMs = Date.now();
  if (
    jpVocabDbState.sharedTodayListCache &&
    jpVocabDbState.sharedTodayListCache.date === today &&
    nowMs - jpVocabDbState.sharedTodayListCache.at < JP_VOCAB_SHARED_LIST_CACHE_MS
  ) {
    return jpVocabDbState.sharedTodayListCache.value;
  }
  if (jpVocabDbState.sharedTodayListInflight) {
    return jpVocabDbState.sharedTodayListInflight;
  }

  const gen = jpVocabDbState.sharedTodayListCacheGen;
  jpVocabDbState.sharedTodayListInflight = (async () => {
    try {
      const value = await queryJpVocabSharedToday(db, now);
      if (gen === jpVocabDbState.sharedTodayListCacheGen) {
        jpVocabDbState.sharedTodayListCache = {
          at: Date.now(),
          date: beijingDateString(now),
          value,
        };
      }
      return value;
    } finally {
      jpVocabDbState.sharedTodayListInflight = null;
    }
  })();

  return jpVocabDbState.sharedTodayListInflight;
}

export async function queryJpVocabSharedToday(
  db: D1Database,
  now = new Date()
): Promise<{ items: JpVocabSharedItem[]; refs: Record<string, JpVocabRef> }> {
  await ensureVocabWordSchema(db);
  await ensureJpVocabSharedSchema(db);

  const today = beijingDateString(now);

  if (jpVocabDbState.devStoreEnabled) {
    const items = jpVocabDbState.devShared
      .filter((s) => s.share_date === today)
      .map((s) => {
        const word = jpVocabDbState.devWords.find((w) => w.id === s.word_id);
        if (!word) return null;
        const hasNotes = Boolean((word.class_notes || "").trim());
        const liteWord: JpVocabWord = {
          ...word,
          class_notes: null,
          class_notes_present: hasNotes,
        };
        return mapSharedRow(s, liteWord);
      })
      .filter((item): item is JpVocabSharedItem => item != null)
      .sort(
        (a, b) =>
          b.shared_at.localeCompare(a.shared_at) || b.id - a.id
      );
    const refs = refsRecord(Array.from(jpVocabDbState.devRefs.values()));
    return { items, refs };
  }

  const result = await db
    .prepare(
      `SELECT s.id, s.word_id, s.shared_by, s.shared_at, s.share_date,
              w.id AS w_id, w.word, w.reading, w.meaning, w.pos, w.kind, w.ref_key,
              w.cnt_very, w.cnt_normal, w.cnt_weak, w.today_check_count, w.today_check_date,
              w.last_review_level, w.last_review_at, w.srs_interval_days, w.srs_due_date,
              w.created_at, w.updated_at,
              w.example_sentences, w.example_sentences_source, w.meaning_source,
              w.usage, w.usage_source, w.connection, w.connection_source,
              (CASE WHEN w.class_notes IS NOT NULL THEN 1 ELSE 0 END) AS has_class_notes
       FROM jp_vocab_shared s
       INNER JOIN jp_vocab_word w ON w.id = s.word_id
       WHERE s.share_date = ?1
       ORDER BY s.shared_at DESC, s.id DESC`
    )
    .bind(today)
    .all<Record<string, unknown>>();

  const items = (result.results ?? []).map((row) => {
    const word = mapSharedListWordRow({
      id: row.w_id,
      word: row.word,
      reading: row.reading,
      meaning: row.meaning,
      pos: row.pos,
      kind: row.kind,
      ref_key: row.ref_key,
      cnt_very: row.cnt_very,
      cnt_normal: row.cnt_normal,
      cnt_weak: row.cnt_weak,
      today_check_count: row.today_check_count,
      today_check_date: row.today_check_date,
      last_review_level: row.last_review_level,
      last_review_at: row.last_review_at,
      srs_interval_days: row.srs_interval_days,
      srs_due_date: row.srs_due_date,
      created_at: row.created_at,
      updated_at: row.updated_at,
      example_sentences: row.example_sentences,
      example_sentences_source: row.example_sentences_source,
      meaning_source: row.meaning_source,
      usage: row.usage,
      usage_source: row.usage_source,
      connection: row.connection,
      connection_source: row.connection_source,
      has_class_notes: row.has_class_notes,
    });
    return mapSharedRow(row, word);
  });

  const refKeys = [
    ...new Set(items.map((item) => item.word.ref_key).filter(Boolean)),
  ] as string[];
  const refs: Record<string, JpVocabRef> = {};
  if (refKeys.length) {
    const refList = await listJpVocabRefsByKeys(db, refKeys);
    for (const ref of refList) {
      refs[ref.ref_key] = ref;
    }
  }

  return { items, refs };
}

/** 轻量统计今日已抽查词条数（复习页轮询用，避免每次全表 listJpVocabWords） */
export async function countJpVocabTodayCheckedWords(
  db: D1Database,
  now = new Date()
): Promise<number> {
  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabTodayCheckStats(jpVocabDbState.devWords, now).wordCount;
  }

  await ensureVocabWordSchema(db);
  const today = beijingDateString(now);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM jp_vocab_word
       WHERE today_check_date = ?1 AND COALESCE(today_check_count, 0) > 0`
    )
    .bind(today)
    .first<{ cnt: number }>();
  return Math.max(0, Number(row?.cnt ?? 0));
}

export async function getJpVocabDailyQuizProgress(
  db: D1Database,
  now = new Date()
): Promise<JpVocabDailyQuizProgress> {
  const [checked, teacherVisibleLimit] = await Promise.all([
    countJpVocabTodayCheckedWords(db, now),
    getJpVocabTeacherVisibleLimit(db),
  ]);
  const total = Math.max(0, Math.floor(teacherVisibleLimit.quiz_target));
  const remaining = Math.max(0, total - checked);
  return {
    total,
    checked,
    remaining,
    complete: total > 0 && checked >= total,
  };
}

/**
 * 学生 `/api/jp-vocab/shared` 用：只回传分母（管理员今日抽查数量）。
 * 分子由客户端按今日共享列表条数自算（peek 入列表不写 today_check）。
 */
export async function getJpVocabStudyQuizProgressTarget(
  db: D1Database
): Promise<JpVocabDailyQuizProgress> {
  const teacherVisibleLimit = await getJpVocabTeacherVisibleLimit(db);
  const total = Math.max(0, Math.floor(teacherVisibleLimit.quiz_target));
  return {
    total,
    checked: 0,
    remaining: total,
    complete: false,
  };
}

export async function ensureJpVocabShareRequestSchema(db: D1Database): Promise<void> {
  if (jpVocabDbState.devStoreEnabled) return;
  if (!jpVocabDbState.jpVocabShareRequestSchemaReady) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS jp_vocab_share_request (
         id            INTEGER PRIMARY KEY AUTOINCREMENT,
         requested_by  TEXT    NOT NULL,
         requested_at  TEXT    NOT NULL,
         request_date  TEXT    NOT NULL,
         dismissed_at  TEXT,
         dismissed_by  TEXT
       )`
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_jp_vocab_share_request_pending
       ON jp_vocab_share_request (request_date, dismissed_at)`
      )
      .run();
    jpVocabDbState.jpVocabShareRequestSchemaReady = true;
  }
}

export function mapShareRequestRow(row: Record<string, unknown>): JpVocabShareRequest {
  return {
    id: Number(row.id),
    requested_by: String(row.requested_by),
    requested_at: String(row.requested_at),
    request_date: String(row.request_date),
    dismissed_at: row.dismissed_at ? String(row.dismissed_at) : null,
    dismissed_by: row.dismissed_by ? String(row.dismissed_by) : null,
  };
}

export type CreateJpVocabShareRequestResult =
  | { ok: true; item: JpVocabShareRequest; created: boolean }
  | { ok: false; error: string };

export async function createJpVocabShareRequest(
  db: D1Database,
  requestedBy: string,
  now = new Date()
): Promise<CreateJpVocabShareRequestResult> {
  await ensureJpVocabShareRequestSchema(db);
  const today = beijingDateString(now);
  const nowIso = now.toISOString();

  if (jpVocabDbState.devStoreEnabled) {
    const pending = jpVocabDbState.devShareRequests.find(
      (r) =>
        r.request_date === today &&
        r.requested_by === requestedBy &&
        !r.dismissed_at
    );
    if (pending) {
      const elapsed = now.getTime() - new Date(pending.requested_at).getTime();
      if (elapsed < JP_VOCAB_SHARE_REQUEST_COOLDOWN_MS) {
        return { ok: false, error: "too_frequent" };
      }
      pending.requested_at = nowIso;
      return { ok: true, item: pending, created: false };
    }
    const item: JpVocabShareRequest = {
      id: jpVocabDbState.devShareRequestNextId++,
      requested_by: requestedBy,
      requested_at: nowIso,
      request_date: today,
      dismissed_at: null,
      dismissed_by: null,
    };
    jpVocabDbState.devShareRequests.push(item);
    return { ok: true, item, created: true };
  }

  const existing = await db
    .prepare(
      `SELECT id, requested_by, requested_at, request_date, dismissed_at, dismissed_by
       FROM jp_vocab_share_request
       WHERE request_date = ?1 AND requested_by = ?2 AND dismissed_at IS NULL
       LIMIT 1`
    )
    .bind(today, requestedBy)
    .first<Record<string, unknown>>();

  if (existing) {
    const item = mapShareRequestRow(existing);
    const elapsed = now.getTime() - new Date(item.requested_at).getTime();
    if (elapsed < JP_VOCAB_SHARE_REQUEST_COOLDOWN_MS) {
      return { ok: false, error: "too_frequent" };
    }
    await db
      .prepare(`UPDATE jp_vocab_share_request SET requested_at = ?1 WHERE id = ?2`)
      .bind(nowIso, item.id)
      .run();
    return {
      ok: true,
      item: { ...item, requested_at: nowIso },
      created: false,
    };
  }

  const result = await db
    .prepare(
      `INSERT INTO jp_vocab_share_request (requested_by, requested_at, request_date)
       VALUES (?1, ?2, ?3)`
    )
    .bind(requestedBy, nowIso, today)
    .run();

  const insertedId = Number(result.meta?.last_row_id);
  if (!insertedId) return { ok: false, error: "insert_failed" };

  return {
    ok: true,
    item: {
      id: insertedId,
      requested_by: requestedBy,
      requested_at: nowIso,
      request_date: today,
      dismissed_at: null,
      dismissed_by: null,
    },
    created: true,
  };
}

export async function listJpVocabPendingShareRequests(
  db: D1Database,
  now = new Date()
): Promise<JpVocabShareRequest[]> {
  await ensureJpVocabShareRequestSchema(db);
  const today = beijingDateString(now);

  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devShareRequests
      .filter((r) => r.request_date === today && !r.dismissed_at)
      .sort(
        (a, b) =>
          b.requested_at.localeCompare(a.requested_at) || b.id - a.id
      );
  }

  const result = await db
    .prepare(
      `SELECT id, requested_by, requested_at, request_date, dismissed_at, dismissed_by
       FROM jp_vocab_share_request
       WHERE request_date = ?1 AND dismissed_at IS NULL
       ORDER BY requested_at DESC, id DESC`
    )
    .bind(today)
    .all<Record<string, unknown>>();

  return (result.results ?? []).map(mapShareRequestRow);
}

export async function dismissJpVocabShareRequests(
  db: D1Database,
  dismissedBy: string,
  requestIds?: number[],
  now = new Date()
): Promise<{ dismissed: number }> {
  await ensureJpVocabShareRequestSchema(db);
  const today = beijingDateString(now);
  const dismissedAt = now.toISOString();

  if (jpVocabDbState.devStoreEnabled) {
    let count = 0;
    for (const row of jpVocabDbState.devShareRequests) {
      if (row.request_date !== today || row.dismissed_at) continue;
      if (requestIds && !requestIds.includes(row.id)) continue;
      row.dismissed_at = dismissedAt;
      row.dismissed_by = dismissedBy;
      count += 1;
    }
    return { dismissed: count };
  }

  if (requestIds && requestIds.length > 0) {
    const placeholders = requestIds.map((_, i) => `?${i + 4}`).join(", ");
    const result = await db
      .prepare(
        `UPDATE jp_vocab_share_request
         SET dismissed_at = ?1, dismissed_by = ?2
         WHERE request_date = ?3 AND dismissed_at IS NULL AND id IN (${placeholders})`
      )
      .bind(dismissedAt, dismissedBy, today, ...requestIds)
      .run();
    return { dismissed: Number(result.meta?.changes ?? 0) };
  }

  const result = await db
    .prepare(
      `UPDATE jp_vocab_share_request
       SET dismissed_at = ?1, dismissed_by = ?2
       WHERE request_date = ?3 AND dismissed_at IS NULL`
    )
    .bind(dismissedAt, dismissedBy, today)
    .run();
  return { dismissed: Number(result.meta?.changes ?? 0) };
}

