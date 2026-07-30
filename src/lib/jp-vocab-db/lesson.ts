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
import {
  parseLessonContent,
  resolveJpLessonItemKinds,
} from "@/lib/jp-lesson-shared";
import { normalizeJpVocabAnnotation } from "@/lib/jp-vocab-annotation";
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
  normalizeWord,
  normalizeKind,
  upsertJpVocabRefMetadata,
  ensureJpVocabWordSchema,
} from "./helpers";
import {
  listJpVocabWords, deleteJpVocabWordsByIds,
} from "./words";
import {
  ensureJpVocabDailyDisplayOrder,
} from "./daily_settings";

export const JP_VOCAB_LESSON_MEANING_SOURCE = "新课";

export async function upsertJpVocabFromLesson(
  db: D1Database,
  items: {
    word: string;
    kind: JpVocabKind;
    ref_key: string | null;
    /** 仅语法类同步；单词类由 fill-meaning 补，忽略传入 */
    meaning?: string | null;
    example_sentences?: string | null;
    /** 口语常用 / 考试常用 / 口语考试都常用；已有不覆盖 */
    annotation?: string | null;
    /** 教材课次（如标日初级上册第23课）；已有不覆盖 */
    course_label?: string | null;
  }[],
  refs: JpVocabRefUploadInput[] = []
): Promise<void> {
  if (!items.length) return;
  await ensureJpVocabWordSchema(db);
  if (refs.length) await upsertJpVocabRefMetadata(db, refs);

  // 新课「已完成」同步：created_at 记北京时间，今天不进抽查池，次日凌晨置顶
  // 释义：仅 grammar 写入 meaning（已有不覆盖）；单词由 fill-meaning（tokken）补
  const ts = beijingDateTimeString();
  let addedNew = false;

  if (jpVocabDbState.devStoreEnabled) {
    for (const item of items) {
      const word = normalizeWord(item.word);
      if (!word) continue;
      const kind = normalizeKind(item.kind);
      const refKey = item.ref_key;
      const exampleSentences = (item.example_sentences || "").trim() || null;
      const meaning =
        kind === "grammar" ? (item.meaning || "").trim() || null : null;
      const annotation = normalizeJpVocabAnnotation(item.annotation);
      const courseLabel =
        item.course_label != null && String(item.course_label).trim()
          ? String(item.course_label).trim().slice(0, 120)
          : null;
      const idx = jpVocabDbState.devWords.findIndex((w) => w.word === word);
      if (idx >= 0) {
        const cur = jpVocabDbState.devWords[idx];
        const nextExamples =
          exampleSentences && !cur.example_sentences?.trim()
            ? exampleSentences
            : cur.example_sentences ?? null;
        const nextMeaning =
          meaning && !cur.meaning?.trim() ? meaning : cur.meaning ?? null;
        const nextAnnotation =
          annotation && !cur.annotation?.trim()
            ? annotation
            : cur.annotation ?? null;
        const nextCourseLabel =
          courseLabel && !cur.course_label?.trim()
            ? courseLabel
            : cur.course_label ?? null;
        if (
          nextExamples !== (cur.example_sentences ?? null) ||
          nextMeaning !== (cur.meaning ?? null) ||
          nextAnnotation !== (cur.annotation ?? null) ||
          nextCourseLabel !== (cur.course_label ?? null)
        ) {
          jpVocabDbState.devWords[idx] = {
            ...cur,
            example_sentences: nextExamples,
            meaning: nextMeaning,
            meaning_source:
              nextMeaning && !cur.meaning?.trim()
                ? JP_VOCAB_LESSON_MEANING_SOURCE
                : cur.meaning_source ?? null,
            annotation: nextAnnotation,
            course_label: nextCourseLabel,
            updated_at: ts,
          };
        }
        continue;
      }
      addedNew = true;
      const createdId = jpVocabDbState.devNextId++;
      jpVocabDbState.devWords.push({
          id: createdId,
          word,
          reading: null,
          meaning,
          pos: null,
          kind,
          ref_key: refKey,
          cnt_very: 0,
          cnt_normal: 0,
          cnt_weak: 0,
          today_check_count: 0,
          today_check_date: null,
          class_notes: null,
          annotation,
          course_label: courseLabel,
          example_sentences: exampleSentences,
          meaning_source: meaning ? JP_VOCAB_LESSON_MEANING_SOURCE : null,
          created_at: ts,
          updated_at: ts,
        });
      const today = beijingDateString();
      if (
        jpVocabDbState.devDailyDisplayOrder.date === today &&
        jpVocabDbState.devDailyDisplayOrder.ids.length > 0
      ) {
        jpVocabDbState.devDailyDisplayOrder = appendJpVocabDailyDisplayOrderId(
          jpVocabDbState.devDailyDisplayOrder,
          createdId
        );
      }
    }
    if (addedNew) {
      await ensureJpVocabDailyDisplayOrder(db, jpVocabDbState.devWords);
    }
    return;
  }

  for (const item of items) {
    const word = normalizeWord(item.word);
    if (!word) continue;
    const kind = normalizeKind(item.kind);
    const refKey = item.ref_key;
    const exampleSentences = (item.example_sentences || "").trim() || null;
    const meaning =
      kind === "grammar" ? (item.meaning || "").trim() || null : null;
    const annotation = normalizeJpVocabAnnotation(item.annotation);
    const courseLabel =
      item.course_label != null && String(item.course_label).trim()
        ? String(item.course_label).trim().slice(0, 120)
        : null;

    const existing = await db
      .prepare(
        `SELECT id, meaning, example_sentences, annotation, course_label FROM jp_vocab_word WHERE word = ?1 LIMIT 1`
      )
      .bind(word)
      .first<{
        id: number;
        meaning: string | null;
        example_sentences: string | null;
        annotation: string | null;
        course_label: string | null;
      }>();

    if (existing) {
      const nextExamples =
        exampleSentences && !(existing.example_sentences || "").trim()
          ? exampleSentences
          : null;
      const nextMeaning =
        meaning && !(existing.meaning || "").trim() ? meaning : null;
      const nextAnnotation =
        annotation && !(existing.annotation || "").trim() ? annotation : null;
      const nextCourseLabel =
        courseLabel && !(existing.course_label || "").trim() ? courseLabel : null;
      if (nextExamples || nextMeaning || nextAnnotation || nextCourseLabel) {
        await db
          .prepare(
            `UPDATE jp_vocab_word
             SET example_sentences = COALESCE(?1, example_sentences),
                 meaning = COALESCE(?2, meaning),
                 meaning_source = CASE
                   WHEN ?2 IS NOT NULL AND (meaning IS NULL OR meaning = '') THEN ?3
                   ELSE meaning_source
                 END,
                 annotation = COALESCE(?4, annotation),
                 course_label = COALESCE(?5, course_label),
                 updated_at = ?6
             WHERE id = ?7`
          )
          .bind(
            nextExamples,
            nextMeaning,
            JP_VOCAB_LESSON_MEANING_SOURCE,
            nextAnnotation,
            nextCourseLabel,
            ts,
            existing.id
          )
          .run();
      }
      continue;
    }

    addedNew = true;
    await db
      .prepare(
        `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, example_sentences, meaning_source, annotation, course_label, created_at, updated_at)
         VALUES (?1, NULL, ?2, ?3, ?4, 0, 0, 0, 0, NULL, NULL, ?5, ?6, ?7, ?8, ?9, ?9)`
      )
      .bind(
        word,
        meaning,
        kind,
        refKey,
        exampleSentences,
        meaning ? JP_VOCAB_LESSON_MEANING_SOURCE : null,
        annotation,
        courseLabel,
        ts
      )
      .run();
  }

  if (addedNew) {
    const words = await listJpVocabWords(db);
    await ensureJpVocabDailyDisplayOrder(db, words);
  }
}

export function combineLessonNotes(notes: { body: string }[]): string | null {
  const parts = notes.map((n) => n.body.trim()).filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

/** 新课已完成时：把 jp_lesson_note 同步到 jp_vocab_word.class_notes */
export async function syncLessonNotesToVocab(
  db: D1Database,
  lesson: JpLessonRecord
): Promise<void> {
  const items = parseLessonContent(lesson.content);
  if (!items.length) return;

  const notes = await listJpLessonNotesByLessonId(db, lesson.id);
  const refKey = lesson.ref_key;
  // 合传课按项 word/grammar；normalizeKind 只认 JpVocabKind，不能吃 lesson.kind
  const itemKinds = resolveJpLessonItemKinds(
    lesson.kind,
    items.length,
    lesson.grammar_item_count
  );
  const ts = nowIso();

  if (jpVocabDbState.devStoreEnabled) {
    items.forEach((item, index) => {
      const kind = itemKinds[index] ?? "word";
      const combined = combineLessonNotes(
        notes.filter((n) => n.item_word === item)
      );
      const idx = jpVocabDbState.devWords.findIndex((w) => {
        if (w.word !== item) return false;
        if (refKey) return w.ref_key === refKey;
        return w.ref_key == null && w.kind === kind;
      });
      if (idx >= 0) {
        jpVocabDbState.devWords[idx] = {
          ...jpVocabDbState.devWords[idx],
          class_notes: combined,
          updated_at: ts,
        };
      }
    });
    return;
  }

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const kind = itemKinds[index] ?? "word";
    const combined = combineLessonNotes(
      notes.filter((n) => n.item_word === item)
    );

    if (refKey) {
      await db
        .prepare(
          `UPDATE jp_vocab_word SET class_notes = ?1, updated_at = ?2
           WHERE word = ?3 AND ref_key = ?4`
        )
        .bind(combined, ts, item, refKey)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE jp_vocab_word SET class_notes = ?1, updated_at = ?2
           WHERE word = ?3 AND ref_key IS NULL AND kind = ?4`
        )
        .bind(combined, ts, item, kind)
        .run();
    }
  }
}

/** 新课教案 ref 变更时，同步更新已写入单词复习的 ref_key */
export async function updateJpVocabWordsRefKey(
  db: D1Database,
  words: string[],
  kind: JpVocabKind,
  oldRefKey: string,
  newRefKey: string
): Promise<void> {
  const cleaned = words.map(normalizeWord).filter(Boolean);
  const fromKey = normalizeJpVocabRefKey(oldRefKey);
  const toKey = normalizeJpVocabRefKey(newRefKey);
  if (!cleaned.length || !fromKey || !toKey || fromKey === toKey) return;

  const normalizedKind = normalizeKind(kind);
  const ts = nowIso();

  if (jpVocabDbState.devStoreEnabled) {
    for (let i = 0; i < jpVocabDbState.devWords.length; i++) {
      const w = jpVocabDbState.devWords[i];
      if (!cleaned.includes(w.word) || w.ref_key !== fromKey) continue;
      jpVocabDbState.devWords[i] = { ...w, ref_key: toKey, updated_at: ts };
    }
    return;
  }

  for (const word of cleaned) {
    await db
      .prepare(
        `UPDATE jp_vocab_word SET ref_key = ?1, updated_at = ?2
         WHERE word = ?3 AND ref_key = ?4 AND kind = ?5`
      )
      .bind(toKey, ts, word, fromKey, normalizedKind)
      .run();
  }
}

/** 新课改回未完成时：移除本课同步的词条（按 ref_key 匹配） */
export async function removeJpVocabLessonWords(
  db: D1Database,
  words: string[],
  refKey: string | null,
  kind: JpVocabKind
): Promise<void> {
  const cleaned = words.map(normalizeWord).filter(Boolean);
  if (!cleaned.length) return;

  const normalizedKind = normalizeKind(kind);

  if (jpVocabDbState.devStoreEnabled) {
    const removeIds: number[] = [];
    for (let i = jpVocabDbState.devWords.length - 1; i >= 0; i--) {
      const w = jpVocabDbState.devWords[i];
      if (!cleaned.includes(w.word)) continue;
      if (refKey) {
        if (w.ref_key === refKey) removeIds.push(w.id);
      } else if (w.ref_key == null && w.kind === normalizedKind) {
        removeIds.push(w.id);
      }
    }
    if (removeIds.length) {
      await deleteJpVocabWordsByIds(db, removeIds);
    }
    return;
  }

  const idSet = new Set<number>();
  for (const word of cleaned) {
    const rows = refKey
      ? await db
          .prepare(
            `SELECT id FROM jp_vocab_word WHERE word = ?1 AND ref_key = ?2`
          )
          .bind(word, refKey)
          .all<{ id: number }>()
      : await db
          .prepare(
            `SELECT id FROM jp_vocab_word WHERE word = ?1 AND ref_key IS NULL AND kind = ?2`
          )
          .bind(word, normalizedKind)
          .all<{ id: number }>();
    for (const row of rows.results ?? []) {
      const id = Number(row.id);
      if (Number.isInteger(id) && id > 0) idSet.add(id);
    }
  }

  if (idSet.size) {
    await deleteJpVocabWordsByIds(db, [...idSet]);
  }
}

export function lessonMatchesVocabWord(lesson: JpLessonRecord, word: JpVocabWord): boolean {
  if (!lesson.completed) return false;
  const items = parseLessonContent(lesson.content);
  if (!items.includes(word.word)) return false;
  if (word.ref_key) return lesson.ref_key === word.ref_key;
  return lesson.ref_key == null && lesson.kind === word.kind;
}

