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
  ensureVocabWordSchema,
  listJpVocabRefs,
  listJpVocabRefsByKeys,
  mapSharedListWordRow,
  seedIfEmpty,
} from "./helpers";
import {
  resetJpVocabTeacherVisibleLimit, refreshJpVocabDailyDisplayOrder, readJpVocabTeacherVisibleLimitRaw, readJpVocabDailyDisplayOrderRaw, ensureJpVocabSharedSchema, ensureJpVocabSettingSchema,
} from "./daily_settings";
import {
  ensureJpVocabShareRequestSchema,
} from "./share";
import {
  listJpVocabWords,
} from "./words";

export type JpVocabDailyRolloverResult = {
  date: string;
  dry_run: boolean;
  teacher_visible_reset: boolean;
  display_order_refreshed: boolean;
  deleted_shared: number;
  deleted_share_requests: number;
  cleared_today_checks: number;
};

export function teacherVisibleNeedsDailyReset(
  raw: Partial<JpVocabTeacherVisibleLimit> | null,
  today: string
): boolean {
  return !raw?.date || raw.date !== today;
}

/**
 * 北京时间跨日清理：仅当日临时状态（释放批次、共享、协助请求、今日抽查次数等）。
 * 不删除词条、不重置历史复习统计（cnt_very / cnt_normal / cnt_weak）。
 */
export async function runJpVocabDailyRolloverInDb(
  db: D1Database,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<JpVocabDailyRolloverResult> {
  const dryRun = Boolean(options.dryRun);
  const now = options.now ?? new Date();
  const today = beijingDateString(now);
  const ts = nowIso();

  await seedIfEmpty(db);

  if (jpVocabDbState.devStoreEnabled) {
    const teacher_visible_reset = teacherVisibleNeedsDailyReset(
      jpVocabDbState.devTeacherVisibleLimit,
      today
    );
    const display_order_refreshed =
      !jpVocabDbState.devDailyDisplayOrder.date || jpVocabDbState.devDailyDisplayOrder.date !== today;
    const deleted_shared = jpVocabDbState.devShared.filter((row) => row.share_date < today).length;
    const deleted_share_requests = jpVocabDbState.devShareRequests.filter(
      (row) => row.request_date < today
    ).length;
    const cleared_today_checks = jpVocabDbState.devWords.filter(
      (word) => word.today_check_date && word.today_check_date < today
    ).length;

    if (!dryRun) {
      if (teacher_visible_reset) {
        jpVocabDbState.devTeacherVisibleLimit = await resetJpVocabTeacherVisibleLimit(db);
      }
      if (display_order_refreshed) {
        jpVocabDbState.devDailyDisplayOrder = await refreshJpVocabDailyDisplayOrder(db, jpVocabDbState.devWords);
      }
      if (deleted_shared > 0) {
        for (let i = jpVocabDbState.devShared.length - 1; i >= 0; i -= 1) {
          if (jpVocabDbState.devShared[i].share_date < today) jpVocabDbState.devShared.splice(i, 1);
        }
        invalidateJpVocabSharedTodayCache();
      }
      if (deleted_share_requests > 0) {
        for (let i = jpVocabDbState.devShareRequests.length - 1; i >= 0; i -= 1) {
          if (jpVocabDbState.devShareRequests[i].request_date < today) {
            jpVocabDbState.devShareRequests.splice(i, 1);
          }
        }
      }
      if (cleared_today_checks > 0) {
        for (let i = 0; i < jpVocabDbState.devWords.length; i += 1) {
          const word = jpVocabDbState.devWords[i];
          if (word.today_check_date && word.today_check_date < today) {
            jpVocabDbState.devWords[i] = {
              ...word,
              today_check_count: 0,
              today_check_date: null,
              updated_at: ts,
            };
          }
        }
      }
    }

    return {
      date: today,
      dry_run: dryRun,
      teacher_visible_reset,
      display_order_refreshed,
      deleted_shared,
      deleted_share_requests,
      cleared_today_checks,
    };
  }

  const rawVisible = await readJpVocabTeacherVisibleLimitRaw(db);
  const teacher_visible_reset = teacherVisibleNeedsDailyReset(rawVisible, today);

  const storedOrder = await readJpVocabDailyDisplayOrderRaw(db);
  const display_order_refreshed =
    !storedOrder?.date || storedOrder.date !== today;

  await ensureJpVocabSharedSchema(db);
  const sharedCountRow = await db
    .prepare(`SELECT COUNT(*) AS c FROM jp_vocab_shared WHERE share_date < ?1`)
    .bind(today)
    .first<{ c: number }>();
  const deleted_shared = Number(sharedCountRow?.c ?? 0);

  await ensureJpVocabShareRequestSchema(db);
  const requestCountRow = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM jp_vocab_share_request WHERE request_date < ?1`
    )
    .bind(today)
    .first<{ c: number }>();
  const deleted_share_requests = Number(requestCountRow?.c ?? 0);

  await ensureVocabWordSchema(db);
  const checkCountRow = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM jp_vocab_word
       WHERE today_check_date IS NOT NULL AND today_check_date < ?1`
    )
    .bind(today)
    .first<{ c: number }>();
  const cleared_today_checks = Number(checkCountRow?.c ?? 0);

  if (dryRun) {
    return {
      date: today,
      dry_run: true,
      teacher_visible_reset,
      display_order_refreshed,
      deleted_shared,
      deleted_share_requests,
      cleared_today_checks,
    };
  }

  if (teacher_visible_reset) {
    await resetJpVocabTeacherVisibleLimit(db);
  }

  if (display_order_refreshed) {
    const words = await listJpVocabWords(db);
    await refreshJpVocabDailyDisplayOrder(db, words);
  }

  if (deleted_shared > 0) {
    await db
      .prepare(`DELETE FROM jp_vocab_shared WHERE share_date < ?1`)
      .bind(today)
      .run();
    invalidateJpVocabSharedTodayCache();
  }

  if (deleted_share_requests > 0) {
    await db
      .prepare(`DELETE FROM jp_vocab_share_request WHERE request_date < ?1`)
      .bind(today)
      .run();
  }

  if (cleared_today_checks > 0) {
    await db
      .prepare(
        `UPDATE jp_vocab_word
         SET today_check_count = 0,
             today_check_date = NULL,
             updated_at = ?1
         WHERE today_check_date IS NOT NULL AND today_check_date < ?2`
      )
      .bind(ts, today)
      .run();
  }

  return {
    date: today,
    dry_run: false,
    teacher_visible_reset,
    display_order_refreshed,
    deleted_shared,
    deleted_share_requests,
    cleared_today_checks,
  };
}

async function readJpVocabTeacherQuizLiveRaw(
  db: D1Database
): Promise<Partial<JpVocabTeacherQuizLive> | null> {
  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devTeacherQuizLive;
  }
  await ensureJpVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM jp_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_TEACHER_QUIZ_LIVE_KEY)
    .first<{ value: string }>();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as Partial<JpVocabTeacherQuizLive>;
  } catch {
    return null;
  }
}

async function saveJpVocabTeacherQuizLive(
  db: D1Database,
  live: JpVocabTeacherQuizLive
): Promise<JpVocabTeacherQuizLive> {
  const next = normalizeJpVocabTeacherQuizLive(live);
  if (jpVocabDbState.devStoreEnabled) {
    jpVocabDbState.devTeacherQuizLive = next;
    return next;
  }
  await ensureJpVocabSettingSchema(db);
  await db
    .prepare(
      `INSERT INTO jp_vocab_setting (key, value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .bind(JP_VOCAB_TEACHER_QUIZ_LIVE_KEY, JSON.stringify(next), nowIso())
    .run();
  jpVocabDbState.teacherQuizLiveReadCache = { at: Date.now(), value: next };
  return next;
}

export async function getJpVocabTeacherQuizLive(
  db: D1Database,
  now = new Date(),
  options?: { bypassCache?: boolean }
): Promise<JpVocabTeacherQuizLive> {
  const at = Date.now();
  if (
    !options?.bypassCache &&
    jpVocabDbState.teacherQuizLiveReadCache &&
    at - jpVocabDbState.teacherQuizLiveReadCache.at < JP_VOCAB_SETTING_READ_CACHE_MS
  ) {
    return normalizeJpVocabTeacherQuizLive(jpVocabDbState.teacherQuizLiveReadCache.value, now);
  }

  const raw = await readJpVocabTeacherQuizLiveRaw(db);
  const normalized = normalizeJpVocabTeacherQuizLive(raw, now);
  if (!jpVocabDbState.devStoreEnabled && raw?.date && raw.date !== normalized.date) {
    const saved = await saveJpVocabTeacherQuizLive(db, normalized);
    return saved;
  }
  jpVocabDbState.teacherQuizLiveReadCache = { at, value: normalized };
  return normalized;
}

export async function setJpVocabTeacherQuizLiveWord(
  db: D1Database,
  wordId: number | null,
  now = new Date()
): Promise<JpVocabTeacherQuizLive> {
  const current = await getJpVocabTeacherQuizLive(db, now);
  const parsedId =
    wordId != null && Number.isFinite(wordId) && wordId > 0
      ? Math.floor(wordId)
      : null;
  const wordChanged = current.word_id !== parsedId;
  const next: JpVocabTeacherQuizLive = {
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
  return saveJpVocabTeacherQuizLive(db, next);
}

async function getJpVocabWordByIdLite(
  db: D1Database,
  wordId: number
): Promise<JpVocabWord | null> {
  if (jpVocabDbState.devStoreEnabled) {
    const word = jpVocabDbState.devWords.find((w) => w.id === wordId);
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
      `SELECT id, word, reading, meaning, pos, kind, ref_key,
              cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date,
              last_review_level, last_review_at, srs_interval_days, srs_due_date,
              created_at, updated_at,
              example_sentences, example_sentences_source, meaning_source,
              usage, usage_source, connection, connection_source,
              (CASE WHEN class_notes IS NOT NULL THEN 1 ELSE 0 END) AS has_class_notes
       FROM jp_vocab_word
       WHERE id = ?1`
    )
    .bind(wordId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return mapSharedListWordRow(row);
}

export type JpVocabTeacherQuizLivePeekResult =
  | {
      ok: true;
      word: JpVocabWord;
      refs: Record<string, JpVocabRef>;
      item: JpVocabSharedItem;
    }
  | { ok: false; error: "no_active_word" | "word_not_found" };

export async function peekJpVocabTeacherQuizLiveWord(
  db: D1Database,
  studentUsername: string,
  now = new Date()
): Promise<JpVocabTeacherQuizLivePeekResult> {
  const live = await getJpVocabTeacherQuizLive(db, now, { bypassCache: true });
  const wordId = live.word_id;
  if (!wordId) {
    return { ok: false, error: "no_active_word" };
  }
  const word = await getJpVocabWordByIdLite(db, wordId);
  if (!word) {
    return { ok: false, error: "word_not_found" };
  }

  const studentBy = studentUsername.trim();
  const peekAt = now.toISOString();
  const nextLive: JpVocabTeacherQuizLive = {
    ...live,
    student_peek_word_id: wordId,
    student_peek_by: studentBy,
    student_peek_at: peekAt,
  };
  await saveJpVocabTeacherQuizLive(db, nextLive);

  await ensureJpVocabSharedSchema(db);
  const today = beijingDateString(now);
  let sharedRow: { id: number; shared_by: string; shared_at: string };

  if (jpVocabDbState.devStoreEnabled) {
    const existing = jpVocabDbState.devShared.find(
      (s) => s.share_date === today && s.word_id === wordId
    );
    if (existing) {
      sharedRow = {
        id: existing.id,
        shared_by: existing.shared_by,
        shared_at: existing.shared_at,
      };
    } else {
      const id = jpVocabDbState.devSharedNextId++;
      jpVocabDbState.devShared.push({
        id,
        word_id: wordId,
        shared_by: studentBy,
        shared_at: peekAt,
        share_date: today,
        auto_marked_level: null,
      });
      sharedRow = { id, shared_by: studentBy, shared_at: peekAt };
    }
  } else {
    const existing = await db
      .prepare(
        `SELECT id, shared_by, shared_at FROM jp_vocab_shared
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
          `INSERT INTO jp_vocab_shared (word_id, shared_by, shared_at, share_date, auto_marked_level)
           VALUES (?1, ?2, ?3, ?4, NULL)`
        )
        .bind(wordId, studentBy, peekAt, today)
        .run();
      const inserted = await db
        .prepare(
          `SELECT id, shared_by, shared_at FROM jp_vocab_shared
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

  const refs: Record<string, JpVocabRef> = {};
  if (word.ref_key) {
    const refList = await listJpVocabRefsByKeys(db, [word.ref_key]);
    for (const ref of refList) {
      refs[ref.ref_key] = ref;
    }
  }

  const level = resolveJpVocabSharedTeacherLevel(word, now);

  const item: JpVocabSharedItem = {
    id: sharedRow.id,
    word_id: word.id,
    shared_by: sharedRow.shared_by,
    shared_at: sharedRow.shared_at,
    share_date: today,
    word,
    ...(level ? { level } : {}),
  };

  invalidateJpVocabSharedTodayCache();
  return { ok: true, word, refs, item };
}

export async function isJpVocabTeacherQuizLiveStudentPeekedForWord(
  db: D1Database,
  wordId: number,
  now = new Date()
): Promise<boolean> {
  const live = await getJpVocabTeacherQuizLive(db, now);
  return isJpVocabTeacherQuizLiveStudentPeeked(live, wordId);
}

export async function ensureJpVocabReviewDoneSchema(db: D1Database): Promise<void> {
  if (jpVocabDbState.devStoreEnabled || jpVocabDbState.jpVocabReviewDoneSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_vocab_review_done (
        word_id INTEGER PRIMARY KEY,
        reviewed_at TEXT NOT NULL,
        FOREIGN KEY (word_id) REFERENCES jp_vocab_word (id) ON DELETE CASCADE
      )`
    )
    .run();
  jpVocabDbState.jpVocabReviewDoneSchemaReady = true;
}

export async function getJpVocabReviewProgress(
  db: D1Database
): Promise<JpVocabReviewProgress> {
  if (jpVocabDbState.devStoreEnabled) {
    return normalizeJpVocabReviewProgress({
      reviewed_word_ids: [...jpVocabDbState.devReviewDoneWordIds],
    });
  }
  await ensureJpVocabReviewDoneSchema(db);
  const rows = await db
    .prepare(`SELECT word_id FROM jp_vocab_review_done ORDER BY reviewed_at ASC`)
    .all<{ word_id: number }>();
  const reviewed_word_ids = (rows.results ?? [])
    .map((row) => Number(row.word_id))
    .filter((id) => id > 0);
  return normalizeJpVocabReviewProgress({ reviewed_word_ids });
}

/** 复习卡片点「下一个」：记录当前词已完成复习（去重；不按日清零） */
export async function recordJpVocabReviewDone(
  db: D1Database,
  wordId: number
): Promise<JpVocabReviewProgress> {
  const id = Math.floor(Number(wordId));
  if (!Number.isFinite(id) || id <= 0) {
    return getJpVocabReviewProgress(db);
  }
  const current = await getJpVocabReviewProgress(db);
  if (current.reviewed_word_ids.includes(id)) {
    return current;
  }
  if (jpVocabDbState.devStoreEnabled) {
    jpVocabDbState.devReviewDoneWordIds.push(id);
    return normalizeJpVocabReviewProgress({
      reviewed_word_ids: jpVocabDbState.devReviewDoneWordIds,
    });
  }
  await ensureJpVocabReviewDoneSchema(db);
  await db
    .prepare(
      `INSERT INTO jp_vocab_review_done (word_id, reviewed_at)
       VALUES (?1, ?2)
       ON CONFLICT(word_id) DO NOTHING`
    )
    .bind(id, nowIso())
    .run();
  return getJpVocabReviewProgress(db);
}

/** 用户手动清除全部复习进度 */
export async function clearJpVocabReviewDone(
  db: D1Database
): Promise<JpVocabReviewProgress> {
  if (jpVocabDbState.devStoreEnabled) {
    jpVocabDbState.devReviewDoneWordIds.length = 0;
    return normalizeJpVocabReviewProgress(null);
  }
  await ensureJpVocabReviewDoneSchema(db);
  await db.prepare(`DELETE FROM jp_vocab_review_done`).run();
  return normalizeJpVocabReviewProgress(null);
}
