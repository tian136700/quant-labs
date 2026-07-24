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
  normalizeWord,
  normalizeKind,
  mapRow,
  ensureVocabWordSchema,
  WORD_SELECT,
  seedIfEmpty,
} from "./helpers";
import {
  lessonMatchesVocabWord,
} from "./lesson";

export type UpdateEnVocabClassNotesResult =
  | { ok: true; word: EnVocabWord }
  | { ok: false; error: string };

export async function getEnVocabClassNotes(
  db: D1Database,
  wordId: number
): Promise<UpdateEnVocabClassNotesResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await ensureVocabWordSchema(db);

  if (enVocabDbState.devStoreEnabled) {
    const word = enVocabDbState.devWords.find((w) => w.id === wordId);
    if (!word) return { ok: false, error: "not_found" };
    return { ok: true, word };
  }

  const row = await db
    .prepare(
      `SELECT id, word, reading, meaning, pos, kind, ref_key,
              cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date,
              class_notes, last_review_level, last_review_at, created_at, updated_at
       FROM en_vocab_word WHERE id = ?1`
    )
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, word: mapRow(row) };
}

/** 更新单词复习页课堂笔记，并同步回关联的新课笔记 */
export async function updateEnVocabClassNotes(
  db: D1Database,
  wordId: number,
  classNotes: string | null,
  operatorUsername: string
): Promise<UpdateEnVocabClassNotesResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const normalized = (classNotes || "").trim() || null;
  const ts = nowIso();

  let word: EnVocabWord | undefined;

  if (enVocabDbState.devStoreEnabled) {
    const idx = enVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    enVocabDbState.devWords[idx] = {
      ...enVocabDbState.devWords[idx],
      class_notes: normalized,
      updated_at: ts,
    };
    word = enVocabDbState.devWords[idx];
  } else {
    const result = await db
      .prepare(
        `UPDATE en_vocab_word SET class_notes = ?1, updated_at = ?2 WHERE id = ?3`
      )
      .bind(normalized, ts, wordId)
      .run();

    if (!result.meta?.changes) {
      return { ok: false, error: "not_found" };
    }

    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();

    if (!row) return { ok: false, error: "not_found" };
    word = mapRow(row);
  }

  const lessons = await listEnLessons(db);
  for (const lesson of lessons) {
    if (!lessonMatchesVocabWord(lesson, word)) continue;
    const sync = await replaceLessonNotesForItem(
      db,
      lesson.id,
      word.word,
      normalized,
      operatorUsername
    );
    if (!sync.ok) return sync;
  }

  invalidateEnVocabSharedTodayCache();
  return { ok: true, word };
}

export type UpdateEnVocabWordFieldsResult =
  | { ok: true; word: EnVocabWord }
  | { ok: false; error: string };

/** 更新单词表中的词条文本、释义或词性 */
export async function updateEnVocabWordFields(
  db: D1Database,
  wordId: number,
  fields: { word?: string; meaning?: string | null; pos?: string | null }
): Promise<UpdateEnVocabWordFieldsResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  let current: EnVocabWord | undefined;

  if (enVocabDbState.devStoreEnabled) {
    current = enVocabDbState.devWords.find((w) => w.id === wordId);
  } else {
    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();
    if (row) current = mapRow(row);
  }

  if (!current) return { ok: false, error: "not_found" };

  const nextWord =
    fields.word !== undefined ? normalizeWord(fields.word) : current.word;
  const nextMeaning =
    fields.meaning !== undefined
      ? (fields.meaning || "").trim() || null
      : current.meaning;
  const nextPos =
    fields.pos !== undefined
      ? (fields.pos || "").trim() || null
      : current.pos;

  if (fields.word !== undefined && !nextWord) {
    return { ok: false, error: "word_required" };
  }

  if (nextWord !== current.word) {
    if (enVocabDbState.devStoreEnabled) {
      if (enVocabDbState.devWords.some((w) => w.id !== wordId && w.word === nextWord)) {
        return { ok: false, error: "word_duplicate" };
      }
    } else {
      const dup = await db
        .prepare("SELECT id FROM en_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1")
        .bind(nextWord, wordId)
        .first<{ id: number }>();
      if (dup) return { ok: false, error: "word_duplicate" };
    }
  }

  if (enVocabDbState.devStoreEnabled) {
    const idx = enVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    enVocabDbState.devWords[idx] = {
      ...enVocabDbState.devWords[idx],
      word: nextWord,
      meaning: nextMeaning,
      pos: nextPos,
      updated_at: ts,
    };
    return { ok: true, word: enVocabDbState.devWords[idx] };
  }

  const result = await db
    .prepare(
      `UPDATE en_vocab_word SET word = ?1, meaning = ?2, pos = ?3, updated_at = ?4 WHERE id = ?5`
    )
    .bind(nextWord, nextMeaning, nextPos, ts, wordId)
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  const row = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, word: mapRow(row) };
}

export type EnVocabWordEntryInput = {
  kind?: EnVocabKind;
  word?: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
  class_notes?: string | null;
  mnemonic?: string | null;
  usage?: string | null;
  example_sentences?: string | null;
};

/** 一次性更新词条可编辑字段，并同步备注到关联新课 */
export async function updateEnVocabWordEntry(
  db: D1Database,
  wordId: number,
  input: EnVocabWordEntryInput,
  operatorUsername: string
): Promise<UpdateEnVocabWordFieldsResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  let current: EnVocabWord | undefined;

  if (enVocabDbState.devStoreEnabled) {
    current = enVocabDbState.devWords.find((w) => w.id === wordId);
  } else {
    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();
    if (row) current = mapRow(row);
  }

  if (!current) return { ok: false, error: "not_found" };

  const nextKind =
    input.kind !== undefined ? normalizeKind(input.kind) : current.kind;
  const nextWord =
    input.word !== undefined ? normalizeWord(input.word) : current.word;
  const nextReading =
    nextKind === "grammar"
      ? null
      : input.reading !== undefined
        ? (input.reading || "").trim() || null
        : current.reading;
  const nextMeaning =
    input.meaning !== undefined
      ? (input.meaning || "").trim() || null
      : current.meaning;
  const nextPos =
    input.pos !== undefined
      ? (input.pos || "").trim() || null
      : current.pos;
  const nextNotes =
    input.class_notes !== undefined
      ? (input.class_notes || "").trim() || null
      : current.class_notes;
  const nextMnemonic =
    input.mnemonic !== undefined
      ? (input.mnemonic || "").trim() || null
      : current.mnemonic ?? null;
  const nextUsage =
    input.usage !== undefined
      ? shieldEnVocabUsageUploadText(input.usage || "") || null
      : current.usage ?? null;
  const nextExamples =
    input.example_sentences !== undefined
      ? (input.example_sentences || "").trim() || null
      : current.example_sentences ?? null;

  const readingChanged =
    input.reading !== undefined &&
    (nextReading || null) !== (current.reading || null);
  const meaningChanged =
    input.meaning !== undefined &&
    (nextMeaning || null) !== (current.meaning || null);
  const usageChanged =
    input.usage !== undefined &&
    (nextUsage || null) !== (current.usage || null);
  const examplesChanged =
    input.example_sentences !== undefined &&
    (nextExamples || null) !== (current.example_sentences || null);

  const nextReadingSource = readingChanged
    ? nextReading
      ? "手动"
      : null
    : current.reading_source ?? null;
  const nextMeaningSource = meaningChanged
    ? nextMeaning
      ? "手动"
      : null
    : current.meaning_source ?? null;
  const nextUsageSource = usageChanged
    ? nextUsage
      ? "手动"
      : null
    : current.usage_source ?? null;
  const nextExampleSource = examplesChanged
    ? nextExamples
      ? "手动"
      : null
    : current.example_sentences_source ?? null;

  if (!nextWord) return { ok: false, error: "word_required" };

  if (nextWord !== current.word) {
    if (enVocabDbState.devStoreEnabled) {
      if (enVocabDbState.devWords.some((w) => w.id !== wordId && w.word === nextWord)) {
        return { ok: false, error: "word_duplicate" };
      }
    } else {
      const dup = await db
        .prepare("SELECT id FROM en_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1")
        .bind(nextWord, wordId)
        .first<{ id: number }>();
      if (dup) return { ok: false, error: "word_duplicate" };
    }
  }

  if (enVocabDbState.devStoreEnabled) {
    const idx = enVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    enVocabDbState.devWords[idx] = {
      ...enVocabDbState.devWords[idx],
      kind: nextKind,
      word: nextWord,
      reading: nextReading,
      reading_source: nextReadingSource,
      meaning: nextMeaning,
      meaning_source: nextMeaningSource,
      pos: nextPos,
      class_notes: nextNotes,
      mnemonic: nextMnemonic,
      usage: nextUsage,
      usage_source: nextUsageSource,
      example_sentences: nextExamples,
      example_sentences_source: nextExampleSource,
      updated_at: ts,
    };
    current = enVocabDbState.devWords[idx];
  } else {
    const result = await db
      .prepare(
        `UPDATE en_vocab_word
         SET kind = ?1, word = ?2, reading = ?3, reading_source = ?4,
             meaning = ?5, meaning_source = ?6, pos = ?7, class_notes = ?8,
             mnemonic = ?9, usage = ?10, usage_source = ?11,
             example_sentences = ?12, example_sentences_source = ?13,
             updated_at = ?14
         WHERE id = ?15`
      )
      .bind(
        nextKind,
        nextWord,
        nextReading,
        nextReadingSource,
        nextMeaning,
        nextMeaningSource,
        nextPos,
        nextNotes,
        nextMnemonic,
        nextUsage,
        nextUsageSource,
        nextExamples,
        nextExampleSource,
        ts,
        wordId
      )
      .run();

    if (!result.meta?.changes) {
      return { ok: false, error: "not_found" };
    }

    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();

    if (!row) return { ok: false, error: "not_found" };
    current = mapRow(row);
  }

  if (input.class_notes !== undefined) {
    const lessons = await listEnLessons(db);
    for (const lesson of lessons) {
      if (!lessonMatchesVocabWord(lesson, current)) continue;
      const sync = await replaceLessonNotesForItem(
        db,
        lesson.id,
        current.word,
        nextNotes,
        operatorUsername
      );
      if (!sync.ok) return sync;
    }
  }

  return { ok: true, word: current };
}

