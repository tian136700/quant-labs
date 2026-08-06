import "server-only";

import {
  enVocabDbState,
  invalidateEnVocabSharedTodayCache,
  enableEnVocabDevStore,
  EN_VOCAB_WORD_SCHEMA_VERSION,
  EN_VOCAB_SHARED_LIST_CACHE_MS,
  EN_VOCAB_SETTING_READ_CACHE_MS,
  EN_VOCAB_TEACHER_QUIZ_LIVE_KEY,
  JP_VOCAB_DAILY_QUIZ_STYLE_KEY,
  JP_VOCAB_DAILY_DISPLAY_ORDER_KEY,
  EN_VOCAB_TEACHER_VISIBLE_LIMIT_KEY,
} from "./state";

import type {
  CloudflareEnv,
  EnVocabKind,
  EnVocabLevel,
  EnVocabMediaType,
  EnVocabRef,
  EnVocabRefUploadInput,
  EnVocabSharedItem,
  EnVocabUploadInput,
  EnVocabWord,
} from "@/lib/types";
import {
  enVocabRefKeyFromBytes,
  enVocabRefLocalMarker,
  normalizeEnVocabRefKey,
} from "@/lib/en-vocab-ref-shared";
import {
  enVocabRefFileExists,
  putEnVocabRefFile,
} from "@/lib/en-vocab-ref-server";
import { sortEnVocabWords } from "@/lib/en-vocab-shared";
import {
  beijingDateString,
  effectiveTodayCheckCount,
} from "@/lib/en-vocab-daily-check";
import {
  appendEnVocabDailyDisplayOrderId,
  computeEnVocabDailyDisplayOrder,
  markEnVocabRoundChecked,
  mergeEnVocabDailyDisplayOrder,
  normalizeEnVocabRoundCheckedIds,
  type EnVocabDailyDisplayOrder,
} from "@/lib/en-vocab-daily-order";
import {
  JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
  normalizeEnVocabDailyQuizStyle,
  type EnVocabDailyQuizStyle,
} from "@/lib/en-vocab-daily-quiz-style";
import {
  aggregateEnVocabUsageLevels,
  applyEnVocabReview,
  isEnVocabLevel,
  isEnVocabWordReviewLocked,
  serializeEnVocabLastUsageLevels,
} from "@/lib/en-vocab-review";
import { listEnVocabUsagePointsForDisplay } from "@/lib/en-vocab-usage-examples-display";
import { parseLessonContent } from "@/lib/en-lesson-shared";
import { listEnLessons } from "@/lib/en-lesson-db";
import { listEnLessonNotesByLessonId, replaceLessonNotesForItem } from "@/lib/en-lesson-note-db";
import { shieldEnVocabUsageUploadText } from "@/lib/en-vocab-usage-ai";
import {
  EN_VOCAB_TEACHER_QUIZ_LIVE_EMPTY,
  isEnVocabTeacherQuizLiveStudentPeeked,
  normalizeEnVocabTeacherQuizLive,
  type EnVocabTeacherQuizLive,
} from "@/lib/en-vocab-teacher-quiz-live";
import {
  defaultEnVocabTeacherVisibleLimit,
  EN_VOCAB_TEACHER_VISIBLE_DEFAULT,
  materializeEnVocabTeacherVisible,
  normalizeEnVocabTeacherVisibleLimit,
  withEnVocabTargetAdjustmentMarker,
  type EnVocabTeacherVisibleLimit,
} from "@/lib/en-vocab-teacher-visible";
import type { EnLessonRecord } from "@/lib/types";

export type { EnVocabTeacherVisibleLimit } from "@/lib/en-vocab-teacher-visible";


import {
  nowIso,
  ensureVocabWordSchema,
  WORD_SELECT_LIST,
  mapReviewWordRow,
  stripEnVocabWordNotesForList,
  refsRecord,
  listEnVocabRefs,
  listEnVocabRefsByKeys,
  mapSharedListWordRow,
  seedIfEmpty,
} from "./helpers";
import {
  recordEnVocabReview,
} from "./words";
import {
  ensureEnVocabSharedSchema,
  isEnVocabWordCheckedToday,
  mapSharedRow,
} from "./daily_settings";

export type ShareEnVocabWordResult =
  | { ok: true; item: EnVocabSharedItem; word: EnVocabWord }
  | { ok: false; error: string };

export async function isEnVocabWordSharedToday(
  db: D1Database,
  wordId: number,
  now = new Date()
): Promise<boolean> {
  await ensureEnVocabSharedSchema(db);
  const today = beijingDateString(now);
  if (enVocabDbState.devStoreEnabled) {
    return enVocabDbState.devShared.some((s) => s.share_date === today && s.word_id === wordId);
  }
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM en_vocab_shared
       WHERE share_date = ?1 AND word_id = ?2
       LIMIT 1`
    )
    .bind(today, wordId)
    .first<{ ok: number }>();
  return Boolean(row);
}

export async function listEnVocabSharedTodayWordIds(
  db: D1Database,
  now = new Date()
): Promise<number[]> {
  await ensureEnVocabSharedSchema(db);
  const today = beijingDateString(now);
  if (enVocabDbState.devStoreEnabled) {
    return enVocabDbState.devShared
      .filter((s) => s.share_date === today)
      .map((s) => s.word_id);
  }
  const result = await db
    .prepare(
      `SELECT word_id FROM en_vocab_shared
       WHERE share_date = ?1
       ORDER BY shared_at ASC, id ASC`
    )
    .bind(today)
    .all<{ word_id: number }>();
  return (result.results ?? []).map((row) => Number(row.word_id));
}

export async function shareEnVocabWord(
  db: D1Database,
  wordId: number,
  sharedBy: string
): Promise<ShareEnVocabWordResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  const sharedByTrim = (sharedBy || "").trim();
  if (!sharedByTrim) {
    return { ok: false, error: "shared_by_required" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  await ensureEnVocabSharedSchema(db);

  const today = beijingDateString();
  const ts = nowIso();

  if (enVocabDbState.devStoreEnabled) {
    const word = enVocabDbState.devWords.find((w) => w.id === wordId);
    if (!word) return { ok: false, error: "not_found" };
    if (await isEnVocabWordSharedToday(db, wordId)) {
      return { ok: false, error: "already_shared_today" };
    }
    let updatedWord = stripEnVocabWordNotesForList(word);
    if (!isEnVocabWordCheckedToday(word)) {
      const review = await recordEnVocabReview(db, wordId, "weak");
      if (!review.ok) return { ok: false, error: review.error };
      updatedWord = review.word;
    }
    const sharedRow = {
      id: enVocabDbState.devSharedNextId++,
      word_id: wordId,
      shared_by: sharedByTrim,
      shared_at: ts,
      share_date: today,
    };
    enVocabDbState.devShared.push(sharedRow);
    invalidateEnVocabSharedTodayCache();
    return {
      ok: true,
      item: mapSharedRow(sharedRow, updatedWord),
      word: updatedWord,
    };
  }

  // 必须用 lite 列表：全量 WORD_SELECT（含 class_notes）易 1102
  const wordRow = await db
    .prepare(`${WORD_SELECT_LIST} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();
  if (!wordRow) return { ok: false, error: "not_found" };

  const existingRow = await db
    .prepare(
      `SELECT id, word_id, shared_by, shared_at, share_date
       FROM en_vocab_shared
       WHERE share_date = ?1 AND word_id = ?2`
    )
    .bind(today, wordId)
    .first<Record<string, unknown>>();

  if (existingRow) {
    return { ok: false, error: "already_shared_today" };
  }

  const current = mapReviewWordRow(wordRow);
  let updatedWord = current;
  if (!isEnVocabWordCheckedToday(current)) {
    const review = await recordEnVocabReview(db, wordId, "weak");
    if (!review.ok) return { ok: false, error: review.error };
    updatedWord = review.word;
  }

  const insert = await db
    .prepare(
      `INSERT INTO en_vocab_shared (word_id, shared_by, shared_at, share_date)
       VALUES (?1, ?2, ?3, ?4)`
    )
    .bind(wordId, sharedByTrim, ts, today)
    .run();
  const insertedId = Number(insert.meta?.last_row_id);
  const sharedRow = {
    id: insertedId,
    word_id: wordId,
    shared_by: sharedByTrim,
    shared_at: ts,
    share_date: today,
  };

  invalidateEnVocabSharedTodayCache();
  return {
    ok: true,
    item: mapSharedRow(sharedRow, updatedWord),
    word: stripEnVocabWordNotesForList(updatedWord),
  };
}

export async function listEnVocabSharedToday(
  db: D1Database,
  now = new Date()
): Promise<{ items: EnVocabSharedItem[]; refs: Record<string, EnVocabRef> }> {
  const today = beijingDateString(now);
  const nowMs = Date.now();
  if (
    enVocabDbState.sharedTodayListCache &&
    enVocabDbState.sharedTodayListCache.date === today &&
    nowMs - enVocabDbState.sharedTodayListCache.at < EN_VOCAB_SHARED_LIST_CACHE_MS
  ) {
    return enVocabDbState.sharedTodayListCache.value;
  }
  if (enVocabDbState.sharedTodayListInflight) {
    return enVocabDbState.sharedTodayListInflight;
  }

  const gen = enVocabDbState.sharedTodayListCacheGen;
  enVocabDbState.sharedTodayListInflight = (async () => {
    try {
      const value = await queryEnVocabSharedToday(db, now);
      if (gen === enVocabDbState.sharedTodayListCacheGen) {
        enVocabDbState.sharedTodayListCache = {
          at: Date.now(),
          date: beijingDateString(now),
          value,
        };
      }
      return value;
    } finally {
      enVocabDbState.sharedTodayListInflight = null;
    }
  })();

  return enVocabDbState.sharedTodayListInflight;
}

export async function queryEnVocabSharedToday(
  db: D1Database,
  now = new Date()
): Promise<{ items: EnVocabSharedItem[]; refs: Record<string, EnVocabRef> }> {
  // 学生端热路径：禁止 ensureVocabWordSchema（冷 isolate 曾全表 TRIM → 1102）。
  // 词表列已在线上稳定；缺列时 SELECT 会失败，由管理/写入路径补 schema。
  await ensureEnVocabSharedSchema(db);

  const today = beijingDateString(now);

  if (enVocabDbState.devStoreEnabled) {
    const items = enVocabDbState.devShared
      .filter((s) => s.share_date === today)
      .map((s) => {
        const word = enVocabDbState.devWords.find((w) => w.id === s.word_id);
        if (!word) return null;
        const hasNotes = Boolean((word.class_notes || "").trim());
        const liteWord: EnVocabWord = {
          ...word,
          class_notes: null,
          class_notes_present: hasNotes,
        };
        return mapSharedRow(s, liteWord);
      })
      .filter((item): item is EnVocabSharedItem => item != null)
      .sort(
        (a, b) =>
          b.shared_at.localeCompare(a.shared_at) || b.id - a.id
      );
    const refs = refsRecord(Array.from(enVocabDbState.devRefs.values()));
    return { items, refs };
  }

  const result = await db
    .prepare(
      `SELECT s.id, s.word_id, s.shared_by, s.shared_at, s.share_date,
              w.id AS w_id, w.word, w.reading, w.reading_source, w.meaning, w.meaning_source,
              w.pos, w.kind, w.category, w.upload_source, w.ref_key,
              w.cnt_very, w.cnt_normal, w.cnt_weak, w.today_check_count, w.today_check_date,
              w.last_review_level, w.last_review_at, w.last_usage_levels,
              w.created_at, w.updated_at,
              w.mnemonic, w.usage, w.usage_source,
              w.connection, w.connection_source,
              w.example_sentences, w.example_sentences_source,
              (CASE WHEN w.class_notes IS NOT NULL THEN 1 ELSE 0 END) AS has_class_notes
       FROM en_vocab_shared s
       INNER JOIN en_vocab_word w ON w.id = s.word_id
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
      reading_source: row.reading_source,
      meaning: row.meaning,
      meaning_source: row.meaning_source,
      pos: row.pos,
      kind: row.kind,
      category: row.category,
      upload_source: row.upload_source,
      ref_key: row.ref_key,
      cnt_very: row.cnt_very,
      cnt_normal: row.cnt_normal,
      cnt_weak: row.cnt_weak,
      today_check_count: row.today_check_count,
      today_check_date: row.today_check_date,
      last_review_level: row.last_review_level,
      last_review_at: row.last_review_at,
      last_usage_levels: row.last_usage_levels,
      created_at: row.created_at,
      updated_at: row.updated_at,
      mnemonic: row.mnemonic,
      usage: row.usage,
      usage_source: row.usage_source,
      connection: row.connection,
      connection_source: row.connection_source,
      example_sentences: row.example_sentences,
      example_sentences_source: row.example_sentences_source,
      has_class_notes: row.has_class_notes,
    });
    return mapSharedRow(row, word);
  });

  const refKeys = [
    ...new Set(items.map((item) => item.word.ref_key).filter(Boolean)),
  ] as string[];
  const refs: Record<string, EnVocabRef> = {};
  if (refKeys.length) {
    const refList = await listEnVocabRefsByKeys(db, refKeys);
    for (const ref of refList) {
      refs[ref.ref_key] = ref;
    }
  }

  return { items, refs };
}

