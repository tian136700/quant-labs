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
import { normalizeJpVocabConnectionText } from "@/lib/jp-vocab-connection-ai";
import { normalizeJpVocabNaAdjStoredEntry } from "@/lib/jp-vocab-na-adj";
import { ensureJpVocabCoachSchema } from "@/lib/jp-vocab-coach-db";


import {
  nowIso,
  normalizeKind,
  mapRow,
  ensureVocabWordSchema,
  WORD_SELECT,
  seedIfEmpty,
} from "./helpers";
import {
  lessonMatchesVocabWord,
} from "./lesson";

export type UpdateJpVocabClassNotesResult =
  | { ok: true; word: JpVocabWord }
  | { ok: false; error: string };

/** 按需备注：只扫 class_notes，禁止整词 WORD_SELECT（抽查卡连点易 1102） */
const CLASS_NOTES_SELECT = `SELECT id, class_notes, updated_at,
  (CASE WHEN class_notes IS NOT NULL THEN 1 ELSE 0 END) AS has_class_notes
  FROM jp_vocab_word WHERE id = ?1`;

function mapClassNotesOnlyRow(row: Record<string, unknown>): JpVocabWord {
  const notes = (row.class_notes as string | null) ?? null;
  const has = Boolean(Number(row.has_class_notes));
  return {
    id: Number(row.id),
    word: "",
    reading: null,
    meaning: null,
    pos: null,
    kind: "word",
    ref_key: null,
    cnt_very: 0,
    cnt_normal: 0,
    cnt_weak: 0,
    today_check_count: 0,
    today_check_date: null,
    class_notes: notes,
    class_notes_present: has || Boolean(notes && String(notes).trim()),
    mnemonic: null,
    annotation: null,
    course_label: null,
    example_sentences: null,
    example_sentences_source: null,
    meaning_source: null,
    pos_source: null,
    usage: null,
    usage_source: null,
    connection: null,
    connection_source: null,
    last_review_level: null,
    last_review_at: null,
    srs_interval_days: undefined,
    srs_due_date: null,
    created_at: "",
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function getJpVocabClassNotes(
  db: D1Database,
  wordId: number
): Promise<UpdateJpVocabClassNotesResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  // 按需读备注正文：勿 seedIfEmpty；勿 WORD_SELECT 全字段。
  // 调用方须 mergeJpVocabWordAfterClassNotesFetch，禁止整词覆盖。
  await ensureVocabWordSchema(db);

  if (jpVocabDbState.devStoreEnabled) {
    const word = jpVocabDbState.devWords.find((w) => w.id === wordId);
    if (!word) return { ok: false, error: "not_found" };
    return {
      ok: true,
      word: {
        ...mapClassNotesOnlyRow({
          id: word.id,
          class_notes: word.class_notes,
          updated_at: word.updated_at,
          has_class_notes: word.class_notes ? 1 : 0,
        }),
        word: word.word,
      },
    };
  }

  const row = await db
    .prepare(CLASS_NOTES_SELECT)
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, word: mapClassNotesOnlyRow(row) };
}

/** 更新单词复习页课堂笔记，并同步回关联的新课笔记 */
export async function updateJpVocabClassNotes(
  db: D1Database,
  wordId: number,
  classNotes: string | null,
  operatorUsername: string
): Promise<UpdateJpVocabClassNotesResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const normalized = (classNotes || "").trim() || null;
  const ts = nowIso();

  let word: JpVocabWord | undefined;

  if (jpVocabDbState.devStoreEnabled) {
    const idx = jpVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    jpVocabDbState.devWords[idx] = {
      ...jpVocabDbState.devWords[idx],
      class_notes: normalized,
      updated_at: ts,
    };
    word = jpVocabDbState.devWords[idx];
  } else {
    const result = await db
      .prepare(
        `UPDATE jp_vocab_word SET class_notes = ?1, updated_at = ?2 WHERE id = ?3`
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

  const lessons = await listJpLessons(db);
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

  invalidateJpVocabSharedTodayCache();
  return { ok: true, word };
}

export type UpdateJpVocabWordFieldsResult =
  | { ok: true; word: JpVocabWord }
  | { ok: false; error: string };

/** 更新单词表中的词条文本、释义或词性 */
export async function updateJpVocabWordFields(
  db: D1Database,
  wordId: number,
  fields: { word?: string; meaning?: string | null; pos?: string | null }
): Promise<UpdateJpVocabWordFieldsResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  let current: JpVocabWord | undefined;

  if (jpVocabDbState.devStoreEnabled) {
    current = jpVocabDbState.devWords.find((w) => w.id === wordId);
  } else {
    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();
    if (row) current = mapRow(row);
  }

  if (!current) return { ok: false, error: "not_found" };

  const lemma =
    fields.word !== undefined
      ? normalizeJpVocabNaAdjStoredEntry(fields.word, current.reading)
      : { word: current.word, reading: current.reading };
  const nextWord = lemma.word;
  const nextReading = lemma.reading;
  const nextMeaning =
    fields.meaning !== undefined
      ? (fields.meaning || "").trim() || null
      : current.meaning;
  let nextMeaningSource = current.meaning_source ?? null;
  if (fields.meaning !== undefined) {
    const prevMeaning = current.meaning ?? null;
    if (nextMeaning !== prevMeaning) {
      nextMeaningSource = nextMeaning
        ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
        : null;
    }
  }
  const nextPos =
    fields.pos !== undefined
      ? (fields.pos || "").trim() || null
      : current.pos;
  let nextPosSource = current.pos_source ?? null;
  if (fields.pos !== undefined) {
    const prevPos = current.pos ?? null;
    if (nextPos !== prevPos) {
      nextPosSource = nextPos
        ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
        : null;
    }
  }

  if (fields.word !== undefined && !nextWord) {
    return { ok: false, error: "word_required" };
  }

  if (nextWord !== current.word) {
    if (jpVocabDbState.devStoreEnabled) {
      if (jpVocabDbState.devWords.some((w) => w.id !== wordId && w.word === nextWord)) {
        return { ok: false, error: "word_duplicate" };
      }
    } else {
      const dup = await db
        .prepare("SELECT id FROM jp_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1")
        .bind(nextWord, wordId)
        .first<{ id: number }>();
      if (dup) return { ok: false, error: "word_duplicate" };
    }
  }

  if (jpVocabDbState.devStoreEnabled) {
    const idx = jpVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    jpVocabDbState.devWords[idx] = {
      ...jpVocabDbState.devWords[idx],
      word: nextWord,
      reading: nextReading,
      meaning: nextMeaning,
      meaning_source: nextMeaningSource,
      pos: nextPos,
      pos_source: nextPosSource,
      updated_at: ts,
    };
    return { ok: true, word: jpVocabDbState.devWords[idx] };
  }

  const result = await db
    .prepare(
      `UPDATE jp_vocab_word SET word = ?1, reading = ?2, meaning = ?3, meaning_source = ?4, pos = ?5, pos_source = ?6, updated_at = ?7 WHERE id = ?8`
    )
    .bind(
      nextWord,
      nextReading,
      nextMeaning,
      nextMeaningSource,
      nextPos,
      nextPosSource,
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
  return { ok: true, word: mapRow(row) };
}

export type JpVocabWordEntryInput = {
  kind?: JpVocabKind;
  word?: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
  pos_source?: string | null;
  class_notes?: string | null;
  mnemonic?: string | null;
  example_sentences?: string | null;
  example_sentences_source?: string | null;
  meaning_source?: string | null;
  usage?: string | null;
  usage_source?: string | null;
  connection?: string | null;
  connection_source?: string | null;
};

/** 一次性更新词条可编辑字段，并同步备注到关联新课 */
export async function updateJpVocabWordEntry(
  db: D1Database,
  wordId: number,
  input: JpVocabWordEntryInput,
  operatorUsername: string
): Promise<UpdateJpVocabWordFieldsResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  let current: JpVocabWord | undefined;

  if (jpVocabDbState.devStoreEnabled) {
    current = jpVocabDbState.devWords.find((w) => w.id === wordId);
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
  const wordRaw =
    input.word !== undefined ? input.word : current.word;
  const readingRaw =
    nextKind === "grammar"
      ? null
      : input.reading !== undefined
        ? (input.reading || "").trim() || null
        : current.reading;
  // 词条变更或读音变更时都走な形容词剥「だ」；仅改其它字段时保持现值
  const lemma =
    input.word !== undefined || input.reading !== undefined
      ? normalizeJpVocabNaAdjStoredEntry(wordRaw, readingRaw)
      : { word: current.word, reading: current.reading };
  const nextWord = lemma.word;
  const nextReading = nextKind === "grammar" ? null : lemma.reading;
  const nextMeaning =
    input.meaning !== undefined
      ? (input.meaning || "").trim() || null
      : current.meaning;
  let nextMeaningSource = current.meaning_source ?? null;
  if (input.meaning_source !== undefined) {
    nextMeaningSource = normalizeJpVocabExampleSentencesSource(input.meaning_source);
  } else if (input.meaning !== undefined) {
    const prevMeaning = current.meaning ?? null;
    if (nextMeaning !== prevMeaning) {
      nextMeaningSource = nextMeaning
        ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
        : null;
    }
  }
  const nextPos =
    input.pos !== undefined
      ? (input.pos || "").trim() || null
      : current.pos;
  let nextPosSource = current.pos_source ?? null;
  if (input.pos_source !== undefined) {
    nextPosSource = normalizeJpVocabExampleSentencesSource(input.pos_source);
  } else if (input.pos !== undefined) {
    const prevPos = current.pos ?? null;
    if (nextPos !== prevPos) {
      nextPosSource = nextPos
        ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
        : null;
    }
  }
  const nextNotes =
    input.class_notes !== undefined
      ? (input.class_notes || "").trim() || null
      : current.class_notes;
  const nextMnemonic =
    input.mnemonic !== undefined
      ? (input.mnemonic || "").trim() || null
      : current.mnemonic;
  const nextExampleSentences =
    input.example_sentences !== undefined
      ? (input.example_sentences || "").trim() || null
      : current.example_sentences ?? null;
  let nextExampleSource = current.example_sentences_source ?? null;
  if (input.example_sentences_source !== undefined) {
    nextExampleSource = normalizeJpVocabExampleSentencesSource(
      input.example_sentences_source
    );
  } else if (input.example_sentences !== undefined) {
    const prevExamples = current.example_sentences ?? null;
    if (nextExampleSentences !== prevExamples) {
      nextExampleSource = nextExampleSentences
        ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
        : null;
    }
  }
  const nextUsage =
    input.usage !== undefined
      ? (input.usage || "").trim() || null
      : current.usage ?? null;
  let nextUsageSource = current.usage_source ?? null;
  if (input.usage_source !== undefined) {
    nextUsageSource = normalizeJpVocabExampleSentencesSource(input.usage_source);
  } else   if (input.usage !== undefined) {
    const prevUsage = current.usage ?? null;
    if (nextUsage !== prevUsage) {
      nextUsageSource = nextUsage
        ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
        : null;
    }
  }
  const nextConnection =
    input.connection !== undefined
      ? normalizeJpVocabConnectionText(input.connection) ??
        ((input.connection || "").trim() || null)
      : current.connection ?? null;
  let nextConnectionSource = current.connection_source ?? null;
  if (input.connection_source !== undefined) {
    nextConnectionSource = normalizeJpVocabExampleSentencesSource(
      input.connection_source
    );
  } else if (input.connection !== undefined) {
    const prevConnection = current.connection ?? null;
    if (nextConnection !== prevConnection) {
      nextConnectionSource = nextConnection
        ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
        : null;
    }
  }

  if (!nextWord) return { ok: false, error: "word_required" };

  if (nextWord !== current.word) {
    if (jpVocabDbState.devStoreEnabled) {
      if (jpVocabDbState.devWords.some((w) => w.id !== wordId && w.word === nextWord)) {
        return { ok: false, error: "word_duplicate" };
      }
    } else {
      const dup = await db
        .prepare("SELECT id FROM jp_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1")
        .bind(nextWord, wordId)
        .first<{ id: number }>();
      if (dup) return { ok: false, error: "word_duplicate" };
    }
  }

  if (jpVocabDbState.devStoreEnabled) {
    const idx = jpVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    jpVocabDbState.devWords[idx] = {
      ...jpVocabDbState.devWords[idx],
      kind: nextKind,
      word: nextWord,
      reading: nextReading,
      meaning: nextMeaning,
      meaning_source: nextMeaningSource,
      pos: nextPos,
      pos_source: nextPosSource,
      class_notes: nextNotes,
      mnemonic: nextMnemonic,
      example_sentences: nextExampleSentences,
      example_sentences_source: nextExampleSource,
      usage: nextUsage,
      usage_source: nextUsageSource,
      connection: nextConnection,
      connection_source: nextConnectionSource,
      updated_at: ts,
    };
    current = jpVocabDbState.devWords[idx];
  } else {
    const result = await db
      .prepare(
        `UPDATE jp_vocab_word
         SET kind = ?1, word = ?2, reading = ?3, meaning = ?4, meaning_source = ?5, pos = ?6, pos_source = ?7, class_notes = ?8, mnemonic = ?9, example_sentences = ?10, example_sentences_source = ?11, usage = ?12, usage_source = ?13, connection = ?14, connection_source = ?15, updated_at = ?16
         WHERE id = ?17`
      )
      .bind(
        nextKind,
        nextWord,
        nextReading,
        nextMeaning,
        nextMeaningSource,
        nextPos,
        nextPosSource,
        nextNotes,
        nextMnemonic,
        nextExampleSentences,
        nextExampleSource,
        nextUsage,
        nextUsageSource,
        nextConnection,
        nextConnectionSource,
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
    const lessons = await listJpLessons(db);
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

