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
import { normalizeEnVocabCategory } from "@/lib/en-vocab-category";
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
  upsertEnVocabRefMetadata,
  seedIfEmpty,
} from "./helpers";
import {
  listEnVocabWords,
} from "./words";
import {
  ensureEnVocabDailyDisplayOrder,
  saveEnVocabDailyDisplayOrder,
  ensureEnVocabSharedSchema,
} from "./daily_settings";
import {
  clearEnVocabTeacherQuizLiveIfDeleted,
} from "./live";
import { ensureEnVocabReviewDoneSchema } from "./review";

export async function upsertEnVocabFromLesson(
  db: D1Database,
  items: {
    word: string;
    kind: EnVocabKind;
    ref_key: string | null;
    category?: string | null;
  }[],
  refs: EnVocabRefUploadInput[] = []
): Promise<void> {
  if (!items.length) return;
  if (refs.length) await upsertEnVocabRefMetadata(db, refs);

  const ts = nowIso();

  if (enVocabDbState.devStoreEnabled) {
    for (const item of items) {
      const word = normalizeWord(item.word);
      if (!word) continue;
      const kind = normalizeKind(item.kind);
      const category = normalizeEnVocabCategory(item.category);
      const refKey = item.ref_key;
      const idx = enVocabDbState.devWords.findIndex((w) => w.word === word);
      if (idx >= 0) {
        continue;
      }
      enVocabDbState.devWords.push({
          id: enVocabDbState.devNextId++,
          word,
          reading: null,
          meaning: null,
          pos: null,
          kind,
          category,
          ref_key: refKey,
          cnt_very: 0,
          cnt_normal: 0,
          cnt_weak: 0,
          today_check_count: 0,
          today_check_date: null,
          class_notes: null,
          created_at: ts,
          updated_at: ts,
        });
    }
    return;
  }

  for (const item of items) {
    const word = normalizeWord(item.word);
    if (!word) continue;
    const kind = normalizeKind(item.kind);
    const category = normalizeEnVocabCategory(item.category);
    const refKey = item.ref_key;

    const existing = await db
      .prepare("SELECT id FROM en_vocab_word WHERE word = ?1 LIMIT 1")
      .bind(word)
      .first<{ id: number }>();

    if (existing) continue;

    await db
      .prepare(
        `INSERT INTO en_vocab_word (word, reading, meaning, kind, category, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
         VALUES (?1, NULL, NULL, ?2, ?3, ?4, 0, 0, 0, 0, NULL, NULL, ?5, ?5)`
      )
      .bind(word, kind, category, refKey, ts)
      .run();
  }
}

export function combineLessonNotes(notes: { body: string }[]): string | null {
  const parts = notes.map((n) => n.body.trim()).filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

/** 新课已完成时：把 en_lesson_note 同步到 en_vocab_word.class_notes */
export async function syncLessonNotesToVocab(
  db: D1Database,
  lesson: EnLessonRecord
): Promise<void> {
  const items = parseLessonContent(lesson.content);
  if (!items.length) return;

  const notes = await listEnLessonNotesByLessonId(db, lesson.id);
  const refKey = lesson.ref_key;
  const kind = normalizeKind(lesson.kind);
  const ts = nowIso();

  if (enVocabDbState.devStoreEnabled) {
    for (const item of items) {
      const combined = combineLessonNotes(
        notes.filter((n) => n.item_word === item)
      );
      const idx = enVocabDbState.devWords.findIndex((w) => {
        if (w.word !== item) return false;
        if (refKey) return w.ref_key === refKey;
        return w.ref_key == null && w.kind === kind;
      });
      if (idx >= 0) {
        enVocabDbState.devWords[idx] = {
          ...enVocabDbState.devWords[idx],
          class_notes: combined,
          updated_at: ts,
        };
      }
    }
    return;
  }

  for (const item of items) {
    const combined = combineLessonNotes(
      notes.filter((n) => n.item_word === item)
    );

    if (refKey) {
      await db
        .prepare(
          `UPDATE en_vocab_word SET class_notes = ?1, updated_at = ?2
           WHERE word = ?3 AND ref_key = ?4`
        )
        .bind(combined, ts, item, refKey)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE en_vocab_word SET class_notes = ?1, updated_at = ?2
           WHERE word = ?3 AND ref_key IS NULL AND kind = ?4`
        )
        .bind(combined, ts, item, kind)
        .run();
    }
  }
}

/** 新课教案 ref 变更时，同步更新已写入单词复习的 ref_key */
export async function updateEnVocabWordsRefKey(
  db: D1Database,
  words: string[],
  kind: EnVocabKind,
  oldRefKey: string,
  newRefKey: string
): Promise<void> {
  const cleaned = words.map(normalizeWord).filter(Boolean);
  const fromKey = normalizeEnVocabRefKey(oldRefKey);
  const toKey = normalizeEnVocabRefKey(newRefKey);
  if (!cleaned.length || !fromKey || !toKey || fromKey === toKey) return;

  const normalizedKind = normalizeKind(kind);
  const ts = nowIso();

  if (enVocabDbState.devStoreEnabled) {
    for (let i = 0; i < enVocabDbState.devWords.length; i++) {
      const w = enVocabDbState.devWords[i];
      if (!cleaned.includes(w.word) || w.ref_key !== fromKey) continue;
      enVocabDbState.devWords[i] = { ...w, ref_key: toKey, updated_at: ts };
    }
    return;
  }

  for (const word of cleaned) {
    await db
      .prepare(
        `UPDATE en_vocab_word SET ref_key = ?1, updated_at = ?2
         WHERE word = ?3 AND ref_key = ?4 AND kind = ?5`
      )
      .bind(toKey, ts, word, fromKey, normalizedKind)
      .run();
  }
}

/** 新课改回未完成时：移除本课同步的词条（按 ref_key 匹配） */
export async function removeEnVocabLessonWords(
  db: D1Database,
  words: string[],
  refKey: string | null,
  kind: EnVocabKind
): Promise<void> {
  const cleaned = words.map(normalizeWord).filter(Boolean);
  if (!cleaned.length) return;

  const normalizedKind = normalizeKind(kind);

  if (enVocabDbState.devStoreEnabled) {
    for (let i = enVocabDbState.devWords.length - 1; i >= 0; i--) {
      const w = enVocabDbState.devWords[i];
      if (!cleaned.includes(w.word)) continue;
      if (refKey) {
        if (w.ref_key === refKey) enVocabDbState.devWords.splice(i, 1);
      } else if (w.ref_key == null && w.kind === normalizedKind) {
        enVocabDbState.devWords.splice(i, 1);
      }
    }
    return;
  }

  for (const word of cleaned) {
    if (refKey) {
      await db
        .prepare("DELETE FROM en_vocab_word WHERE word = ?1 AND ref_key = ?2")
        .bind(word, refKey)
        .run();
    } else {
      await db
        .prepare(
          "DELETE FROM en_vocab_word WHERE word = ?1 AND ref_key IS NULL AND kind = ?2"
        )
        .bind(word, normalizedKind)
        .run();
    }
  }
}

export type DeleteEnVocabWordsResult =
  | {
      ok: true;
      deleted: number;
      words: EnVocabWord[];
      display_order: EnVocabDailyDisplayOrder;
    }
  | { ok: false; error: string };

/** 管理员批量删除词条（按 id） */
export async function deleteEnVocabWordsByIds(
  db: D1Database,
  wordIds: number[]
): Promise<DeleteEnVocabWordsResult> {
  const ids = [
    ...new Set(
      wordIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  if (!ids.length) {
    return { ok: false, error: "word_ids_empty" };
  }

  await seedIfEmpty(db);
  const idSet = new Set(ids);

  if (enVocabDbState.devStoreEnabled) {
    let deleted = 0;
    for (let i = enVocabDbState.devWords.length - 1; i >= 0; i--) {
      if (idSet.has(enVocabDbState.devWords[i].id)) {
        enVocabDbState.devWords.splice(i, 1);
        deleted++;
      }
    }
    for (let i = enVocabDbState.devShared.length - 1; i >= 0; i--) {
      if (idSet.has(enVocabDbState.devShared[i].word_id)) {
        enVocabDbState.devShared.splice(i, 1);
      }
    }
    enVocabDbState.devReviewDoneWordIds = enVocabDbState.devReviewDoneWordIds.filter(
      (id) => !idSet.has(id)
    );
    if (deleted === 0) {
      return { ok: false, error: "not_found" };
    }
    invalidateEnVocabSharedTodayCache();
    await clearEnVocabTeacherQuizLiveIfDeleted(db, idSet);
    const words = [...enVocabDbState.devWords];
    let display_order = await ensureEnVocabDailyDisplayOrder(db, words);
    const validIds = new Set(words.map((w) => w.id));
    const round_checked_ids = (display_order.round_checked_ids ?? []).filter((id) =>
      validIds.has(id)
    );
    if (round_checked_ids.length !== (display_order.round_checked_ids ?? []).length) {
      display_order = { ...display_order, round_checked_ids };
      await saveEnVocabDailyDisplayOrder(db, display_order);
    }
    return { ok: true, deleted, words, display_order };
  }

  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  // D1：先清 shared / review_done，再删词；勿只靠 ON DELETE CASCADE
  await ensureEnVocabSharedSchema(db);
  await ensureEnVocabReviewDoneSchema(db);
  await db.batch([
    db
      .prepare(`DELETE FROM en_vocab_shared WHERE word_id IN (${placeholders})`)
      .bind(...ids),
    db
      .prepare(`DELETE FROM en_vocab_review_done WHERE word_id IN (${placeholders})`)
      .bind(...ids),
  ]);
  const result = await db
    .prepare(`DELETE FROM en_vocab_word WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();

  const deleted = Number(result.meta?.changes ?? 0);
  if (deleted === 0) {
    return { ok: false, error: "not_found" };
  }

  invalidateEnVocabSharedTodayCache();
  await clearEnVocabTeacherQuizLiveIfDeleted(db, idSet);
  const words = await listEnVocabWords(db);
  let display_order = await ensureEnVocabDailyDisplayOrder(db, words);
  const validIds = new Set(words.map((w) => w.id));
  const round_checked_ids = (display_order.round_checked_ids ?? []).filter((id) =>
    validIds.has(id)
  );
  if (round_checked_ids.length !== (display_order.round_checked_ids ?? []).length) {
    display_order = { ...display_order, round_checked_ids };
    await saveEnVocabDailyDisplayOrder(db, display_order);
  }

  return { ok: true, deleted, words, display_order };
}

export function lessonMatchesVocabWord(lesson: EnLessonRecord, word: EnVocabWord): boolean {
  if (!lesson.completed) return false;
  const items = parseLessonContent(lesson.content);
  if (!items.includes(word.word)) return false;
  if (word.ref_key) return lesson.ref_key === word.ref_key;
  return lesson.ref_key == null && lesson.kind === word.kind;
}

