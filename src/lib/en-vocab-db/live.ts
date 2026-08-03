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
  type EnVocabTeacherPronounceSignal,
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
  listEnVocabRefs,
  listEnVocabRefsByKeys,
  mapSharedListWordRow,
} from "./helpers";
import {
  ensureEnVocabSharedSchema,
  ensureEnVocabSettingSchema,
  mapSharedRow,
} from "./daily_settings";

export async function clearEnVocabTeacherQuizLiveIfDeleted(
  db: D1Database,
  deletedIds: Set<number>
): Promise<void> {
  if (!deletedIds.size) return;
  const live = await getEnVocabTeacherQuizLive(db);
  if (live.word_id != null && deletedIds.has(live.word_id)) {
    await setEnVocabTeacherQuizLiveWord(db, null);
  }
}

export async function readEnVocabTeacherQuizLiveRaw(
  db: D1Database
): Promise<Partial<EnVocabTeacherQuizLive> | null> {
  if (enVocabDbState.devStoreEnabled) {
    return enVocabDbState.devTeacherQuizLive;
  }
  await ensureEnVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM en_vocab_setting WHERE key = ?1`)
    .bind(EN_VOCAB_TEACHER_QUIZ_LIVE_KEY)
    .first<{ value: string }>();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as Partial<EnVocabTeacherQuizLive>;
  } catch {
    return null;
  }
}

export async function saveEnVocabTeacherQuizLive(
  db: D1Database,
  live: EnVocabTeacherQuizLive
): Promise<EnVocabTeacherQuizLive> {
  const next = normalizeEnVocabTeacherQuizLive(live);
  if (enVocabDbState.devStoreEnabled) {
    enVocabDbState.devTeacherQuizLive = next;
    return next;
  }
  await ensureEnVocabSettingSchema(db);
  await db
    .prepare(
      `INSERT INTO en_vocab_setting (key, value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .bind(EN_VOCAB_TEACHER_QUIZ_LIVE_KEY, JSON.stringify(next), nowIso())
    .run();
  enVocabDbState.teacherQuizLiveReadCache = { at: Date.now(), value: next };
  return next;
}

export async function getEnVocabTeacherQuizLive(
  db: D1Database,
  now = new Date(),
  options?: { bypassCache?: boolean }
): Promise<EnVocabTeacherQuizLive> {
  const at = Date.now();
  if (
    !options?.bypassCache &&
    enVocabDbState.teacherQuizLiveReadCache &&
    at - enVocabDbState.teacherQuizLiveReadCache.at < EN_VOCAB_SETTING_READ_CACHE_MS
  ) {
    return normalizeEnVocabTeacherQuizLive(enVocabDbState.teacherQuizLiveReadCache.value, now);
  }

  const raw = await readEnVocabTeacherQuizLiveRaw(db);
  const normalized = normalizeEnVocabTeacherQuizLive(raw, now);
  if (!enVocabDbState.devStoreEnabled && raw?.date && raw.date !== normalized.date) {
    const saved = await saveEnVocabTeacherQuizLive(db, normalized);
    return saved;
  }
  enVocabDbState.teacherQuizLiveReadCache = { at, value: normalized };
  return normalized;
}

export async function setEnVocabTeacherQuizLiveWord(
  db: D1Database,
  wordId: number | null,
  now = new Date()
): Promise<EnVocabTeacherQuizLive> {
  const current = await getEnVocabTeacherQuizLive(db, now);
  const parsedId =
    wordId != null && Number.isFinite(wordId) && wordId > 0
      ? Math.floor(wordId)
      : null;
  const wordChanged = current.word_id !== parsedId;
  const next: EnVocabTeacherQuizLive = {
    ...current,
    word_id: parsedId,
    updated_at: parsedId != null ? now.toISOString() : null,
    ...(wordChanged
      ? {
          student_peek_word_id: null,
          student_peek_by: null,
          student_peek_at: null,
        }
      : {}),
  };
  return saveEnVocabTeacherQuizLive(db, next);
}

export type SendEnVocabTeacherQuizLivePronounceResult =
  | { ok: true; live: EnVocabTeacherQuizLive; signal: EnVocabTeacherPronounceSignal }
  | {
      ok: false;
      error: "no_active_word" | "word_mismatch" | "word_not_found" | "empty_word";
    };

/** 老师点「发送读音」：只写 live 信号，不改当前词 / peek，不存音频 */
export async function sendEnVocabTeacherQuizLivePronounce(
  db: D1Database,
  wordId: number,
  now = new Date()
): Promise<SendEnVocabTeacherQuizLivePronounceResult> {
  const parsedId =
    Number.isFinite(wordId) && wordId > 0 ? Math.floor(wordId) : 0;
  if (!parsedId) {
    return { ok: false, error: "word_not_found" };
  }
  const current = await getEnVocabTeacherQuizLive(db, now, {
    bypassCache: true,
  });
  if (current.word_id == null) {
    return { ok: false, error: "no_active_word" };
  }
  if (current.word_id !== parsedId) {
    return { ok: false, error: "word_mismatch" };
  }
  const word = await getEnVocabWordByIdLite(db, parsedId);
  if (!word) {
    return { ok: false, error: "word_not_found" };
  }
  const text = (word.word || "").trim();
  if (!text) {
    return { ok: false, error: "empty_word" };
  }
  const at = now.toISOString();
  const next: EnVocabTeacherQuizLive = {
    ...current,
    pronounce_word_id: parsedId,
    pronounce_text: text,
    pronounce_at: at,
  };
  const live = await saveEnVocabTeacherQuizLive(db, next);
  return {
    ok: true,
    live,
    signal: { word_id: parsedId, text, at },
  };
}

export async function getEnVocabWordByIdLite(
  db: D1Database,
  wordId: number
): Promise<EnVocabWord | null> {
  if (enVocabDbState.devStoreEnabled) {
    const word = enVocabDbState.devWords.find((w) => w.id === wordId);
    if (!word) return null;
    const hasNotes = Boolean((word.class_notes || "").trim());
    return {
      ...word,
      class_notes: null,
      class_notes_present: hasNotes,
    };
  }
  const row = await db
    .prepare(
      `SELECT id, word, reading, reading_source, meaning, meaning_source, pos, kind, category, upload_source, ref_key,
              cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date,
              last_review_level, last_review_at, last_usage_levels, created_at, updated_at,
              mnemonic, usage, usage_source, example_sentences, example_sentences_source,
              (CASE WHEN class_notes IS NOT NULL THEN 1 ELSE 0 END) AS has_class_notes
       FROM en_vocab_word
       WHERE id = ?1`
    )
    .bind(wordId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return mapSharedListWordRow(row);
}

export type EnVocabTeacherQuizLivePeekResult =
  | {
      ok: true;
      word: EnVocabWord;
      refs: Record<string, EnVocabRef>;
      item: EnVocabSharedItem;
    }
  | { ok: false; error: "no_active_word" | "word_not_found" };

export async function peekEnVocabTeacherQuizLiveWord(
  db: D1Database,
  studentUsername: string,
  now = new Date()
): Promise<EnVocabTeacherQuizLivePeekResult> {
  const live = await getEnVocabTeacherQuizLive(db, now, { bypassCache: true });
  const wordId = live.word_id;
  if (!wordId) {
    return { ok: false, error: "no_active_word" };
  }
  const word = await getEnVocabWordByIdLite(db, wordId);
  if (!word) {
    return { ok: false, error: "word_not_found" };
  }

  const studentBy = studentUsername.trim();
  const peekAt = now.toISOString();
  const nextLive: EnVocabTeacherQuizLive = {
    ...live,
    student_peek_word_id: wordId,
    student_peek_by: studentBy,
    student_peek_at: peekAt,
  };
  await saveEnVocabTeacherQuizLive(db, nextLive);

  await ensureEnVocabSharedSchema(db);
  const today = beijingDateString(now);
  let sharedRow: { id: number; shared_by: string; shared_at: string };

  if (enVocabDbState.devStoreEnabled) {
    const existing = enVocabDbState.devShared.find(
      (s) => s.share_date === today && s.word_id === wordId
    );
    if (existing) {
      sharedRow = {
        id: existing.id,
        shared_by: existing.shared_by,
        shared_at: existing.shared_at,
      };
    } else {
      const id = enVocabDbState.devSharedNextId++;
      enVocabDbState.devShared.push({
        id,
        word_id: wordId,
        shared_by: studentBy,
        shared_at: peekAt,
        share_date: today,
      });
      sharedRow = { id, shared_by: studentBy, shared_at: peekAt };
    }
  } else {
    const existing = await db
      .prepare(
        `SELECT id, shared_by, shared_at FROM en_vocab_shared
         WHERE share_date = ?1 AND word_id = ?2
         LIMIT 1`
      )
      .bind(today, wordId)
      .first<{ id: number; shared_by: string; shared_at: string }>();

    if (existing) {
      sharedRow = {
        id: Number(existing.id),
        shared_by: String(existing.shared_by),
        shared_at: String(existing.shared_at),
      };
    } else {
      await db
        .prepare(
          `INSERT INTO en_vocab_shared (word_id, shared_by, shared_at, share_date)
           VALUES (?1, ?2, ?3, ?4)`
        )
        .bind(wordId, studentBy, peekAt, today)
        .run();
      const inserted = await db
        .prepare(
          `SELECT id, shared_by, shared_at FROM en_vocab_shared
           WHERE share_date = ?1 AND word_id = ?2
           LIMIT 1`
        )
        .bind(today, wordId)
        .first<{ id: number; shared_by: string; shared_at: string }>();
      if (!inserted) {
        return { ok: false, error: "word_not_found" };
      }
      sharedRow = {
        id: Number(inserted.id),
        shared_by: String(inserted.shared_by),
        shared_at: String(inserted.shared_at),
      };
    }
  }

  const refs: Record<string, EnVocabRef> = {};
  if (word.ref_key) {
    const refList = await listEnVocabRefsByKeys(db, [word.ref_key]);
    for (const ref of refList) {
      refs[ref.ref_key] = ref;
    }
  }

  const item: EnVocabSharedItem = mapSharedRow(
    {
      id: sharedRow.id,
      word_id: word.id,
      shared_by: sharedRow.shared_by,
      shared_at: sharedRow.shared_at,
      share_date: today,
    },
    word
  );

  invalidateEnVocabSharedTodayCache();
  return { ok: true, word, refs, item };
}

export async function isEnVocabTeacherQuizLiveStudentPeekedForWord(
  db: D1Database,
  wordId: number,
  now = new Date()
): Promise<boolean> {
  const live = await getEnVocabTeacherQuizLive(db, now);
  return isEnVocabTeacherQuizLiveStudentPeeked(live, wordId);
}
