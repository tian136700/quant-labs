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
  enVocabTodayCheckStats,
} from "@/lib/en-vocab-daily-check";
import {
  appendEnVocabDailyDisplayOrderId,
  computeEnVocabDailyDisplayOrder,
  EN_VOCAB_DAILY_ORDER_ALGO,
  enVocabDailyOrderAlgoCurrent,
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
} from "./helpers";
import {
  listEnVocabWords,
} from "./words";

/**
 * fill list_missing 专用：只读当日日序 ids，不触发重算 / 可见池物化。
 * 无当日顺序时返回 []（调用方回退按 id）。
 */
export async function peekEnVocabDailyDisplayOrderIds(
  db: D1Database
): Promise<number[]> {
  const stored = await readEnVocabDailyDisplayOrderRaw(db);
  if (!stored?.ids?.length) return [];
  if (stored.date !== beijingDateString()) return [];
  return stored.ids;
}

async function readEnVocabDailyDisplayOrderRaw(
  db: D1Database
): Promise<EnVocabDailyDisplayOrder | null> {
  if (enVocabDbState.devStoreEnabled) {
    return enVocabDbState.devDailyDisplayOrder.ids.length ? enVocabDbState.devDailyDisplayOrder : null;
  }

  await ensureEnVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM en_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_DAILY_DISPLAY_ORDER_KEY)
    .first<{ value: string }>();

  if (!row?.value) return null;

  try {
    const parsed = JSON.parse(row.value) as Partial<EnVocabDailyDisplayOrder>;
    if (!parsed.date || !Array.isArray(parsed.ids)) return null;
    const order: EnVocabDailyDisplayOrder = {
      date: parsed.date,
      ids: parsed.ids.map((id) => Number(id)).filter((id) => id > 0),
    };
    if (typeof parsed.order_algo === "string" && parsed.order_algo.trim()) {
      order.order_algo = parsed.order_algo.trim();
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "round_checked_ids")) {
      order.round_checked_ids = normalizeEnVocabRoundCheckedIds(
        parsed.round_checked_ids
      );
    }
    return order;
  } catch {
    return null;
  }
}

export async function saveEnVocabDailyDisplayOrder(
  db: D1Database,
  order: EnVocabDailyDisplayOrder
): Promise<void> {
  if (enVocabDbState.devStoreEnabled) {
    enVocabDbState.devDailyDisplayOrder = order;
    return;
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
    .bind(JP_VOCAB_DAILY_DISPLAY_ORDER_KEY, JSON.stringify(order), nowIso())
    .run();
}

/** 当日已有顺序且算法版本匹配则沿用（仅合并增删词条）；跨日 / 算法升级则按日语优先级重排 */
export async function ensureEnVocabDailyDisplayOrder(
  db: D1Database,
  words: EnVocabWord[]
): Promise<EnVocabDailyDisplayOrder> {
  const today = beijingDateString();
  const stored = await readEnVocabDailyDisplayOrderRaw(db);

  if (
    stored?.date === today &&
    stored.ids.length > 0 &&
    enVocabDailyOrderAlgoCurrent(stored)
  ) {
    const merged = mergeEnVocabDailyDisplayOrder(stored.ids, words);
    const round_checked_ids =
      stored.round_checked_ids ??
      words
        .filter(
          (w) =>
            effectiveTodayCheckCount(
              w.today_check_count ?? 0,
              w.today_check_date
            ) > 0
        )
        .map((w) => w.id);
    const order: EnVocabDailyDisplayOrder = {
      date: today,
      ids: merged,
      round_checked_ids,
      order_algo: EN_VOCAB_DAILY_ORDER_ALGO,
    };
    if (
      merged.length !== stored.ids.length ||
      merged.some((id, i) => id !== stored.ids[i]) ||
      stored.round_checked_ids === undefined ||
      stored.order_algo !== EN_VOCAB_DAILY_ORDER_ALGO
    ) {
      await saveEnVocabDailyDisplayOrder(db, order);
    }
    return order;
  }

  const order: EnVocabDailyDisplayOrder = {
    date: today,
    ids: computeEnVocabDailyDisplayOrder(words),
    round_checked_ids: [] as number[],
    order_algo: EN_VOCAB_DAILY_ORDER_ALGO,
  };
  await saveEnVocabDailyDisplayOrder(db, order);
  // 跨日 / 算法升级：同步重物化老师可见池，避免仍用旧 visible_ids
  const current = await getEnVocabTeacherVisibleLimit(db, { bypassCache: true });
  await saveEnVocabTeacherVisibleLimit(
    db,
    materializeEnVocabTeacherVisible(
      {
        ...current,
        date: today,
        quiz_target: current.quiz_target || EN_VOCAB_TEACHER_VISIBLE_DEFAULT,
      },
      words,
      order
    )
  );
  return order;
}

/** 强制按当前数据重算当日顺序（如今日重置 / 全部重置后） */
export async function refreshEnVocabDailyDisplayOrder(
  db: D1Database,
  words: EnVocabWord[]
): Promise<EnVocabDailyDisplayOrder> {
  const today = beijingDateString();
  const order: EnVocabDailyDisplayOrder = {
    date: today,
    ids: computeEnVocabDailyDisplayOrder(words),
    round_checked_ids: [] as number[],
    order_algo: EN_VOCAB_DAILY_ORDER_ALGO,
  };
  await saveEnVocabDailyDisplayOrder(db, order);
  const current = await getEnVocabTeacherVisibleLimit(db, { bypassCache: true });
  await saveEnVocabTeacherVisibleLimit(
    db,
    materializeEnVocabTeacherVisible(
      {
        ...current,
        date: today,
        quiz_target: current.quiz_target || EN_VOCAB_TEACHER_VISIBLE_DEFAULT,
      },
      words,
      order
    )
  );
  return order;
}

export async function markEnVocabWordRoundChecked(
  db: D1Database,
  wordId: number
): Promise<void> {
  if (enVocabDbState.devStoreEnabled) {
    enVocabDbState.devDailyDisplayOrder = markEnVocabRoundChecked(enVocabDbState.devDailyDisplayOrder, wordId);
    return;
  }

  const stored = await readEnVocabDailyDisplayOrderRaw(db);
  const today = beijingDateString();
  const base =
    stored?.date === today
      ? stored
      : { date: today, ids: [] as number[], round_checked_ids: [] as number[] };
  const next = markEnVocabRoundChecked(base, wordId);
  if ((next.round_checked_ids ?? []).length !== (base.round_checked_ids ?? []).length) {
    await saveEnVocabDailyDisplayOrder(db, next);
  }
}

export async function appendEnVocabWordToDailyDisplayOrder(
  db: D1Database,
  wordId: number
): Promise<void> {
  const stored = await readEnVocabDailyDisplayOrderRaw(db);
  const today = beijingDateString();
  const base =
    stored?.date === today
      ? stored
      : { date: today, ids: [] as number[] };
  const next = appendEnVocabDailyDisplayOrderId(base, wordId);
  if (next.ids.length !== base.ids.length) {
    await saveEnVocabDailyDisplayOrder(db, next);
  }
}

export async function ensureEnVocabSettingSchema(db: D1Database): Promise<void> {
  if (enVocabDbState.devStoreEnabled) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS en_vocab_setting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
}

export async function getEnVocabDailyQuizStyle(
  db: D1Database
): Promise<EnVocabDailyQuizStyle> {
  if (enVocabDbState.devStoreEnabled) {
    return normalizeEnVocabDailyQuizStyle(enVocabDbState.devDailyQuizStyle);
  }

  await ensureEnVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM en_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_DAILY_QUIZ_STYLE_KEY)
    .first<{ value: string }>();

  if (!row?.value) {
    return JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT;
  }

  try {
    return normalizeEnVocabDailyQuizStyle(
      JSON.parse(row.value) as Partial<EnVocabDailyQuizStyle>
    );
  } catch {
    return JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT;
  }
}

export async function setEnVocabDailyQuizStyle(
  db: D1Database,
  style: EnVocabDailyQuizStyle
): Promise<EnVocabDailyQuizStyle> {
  const normalized = normalizeEnVocabDailyQuizStyle(style);

  if (enVocabDbState.devStoreEnabled) {
    enVocabDbState.devDailyQuizStyle = normalized;
    return normalized;
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
    .bind(
      JP_VOCAB_DAILY_QUIZ_STYLE_KEY,
      JSON.stringify(normalized),
      nowIso()
    )
    .run();

  return normalized;
}

export async function readEnVocabTeacherVisibleLimitRaw(
  db: D1Database
): Promise<unknown> {
  await ensureEnVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM en_vocab_setting WHERE key = ?1`)
    .bind(EN_VOCAB_TEACHER_VISIBLE_LIMIT_KEY)
    .first<{ value: string }>();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export async function saveEnVocabTeacherVisibleLimit(
  db: D1Database,
  visible: EnVocabTeacherVisibleLimit
): Promise<EnVocabTeacherVisibleLimit> {
  const next = normalizeEnVocabTeacherVisibleLimit(visible);
  if (enVocabDbState.devStoreEnabled) {
    enVocabDbState.devTeacherVisibleLimit = next;
    enVocabDbState.teacherVisibleLimitReadCache = { at: Date.now(), value: next };
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
    .bind(EN_VOCAB_TEACHER_VISIBLE_LIMIT_KEY, JSON.stringify(next), nowIso())
    .run();
  enVocabDbState.teacherVisibleLimitReadCache = { at: Date.now(), value: next };
  return next;
}

export async function getEnVocabTeacherVisibleLimit(
  db: D1Database,
  opts?: { bypassCache?: boolean }
): Promise<EnVocabTeacherVisibleLimit> {
  if (enVocabDbState.devStoreEnabled) {
    return normalizeEnVocabTeacherVisibleLimit(enVocabDbState.devTeacherVisibleLimit);
  }

  const now = Date.now();
  if (
    !opts?.bypassCache &&
    enVocabDbState.teacherVisibleLimitReadCache &&
    now - enVocabDbState.teacherVisibleLimitReadCache.at < EN_VOCAB_SETTING_READ_CACHE_MS
  ) {
    const cached = enVocabDbState.teacherVisibleLimitReadCache.value;
    const today = beijingDateString();
    if (!cached.date || cached.date === today) {
      return cached;
    }
  }

  const raw = await readEnVocabTeacherVisibleLimitRaw(db);
  const normalized = normalizeEnVocabTeacherVisibleLimit(raw);
  const today = beijingDateString();
  const rawDate =
    raw && typeof raw === "object" && typeof (raw as { date?: unknown }).date === "string"
      ? String((raw as { date: string }).date)
      : null;
  if (rawDate && rawDate !== today) {
    const rolled = await saveEnVocabTeacherVisibleLimit(db, {
      ...normalized,
      visible_ids: undefined,
    });
    return rolled;
  }
  enVocabDbState.teacherVisibleLimitReadCache = { at: now, value: normalized };
  return normalized;
}

/** 读取老师可见池；跨日或未生成 visible_ids 时按日序前 N 物化并落库 */
export async function ensureEnVocabTeacherVisibleLimit(
  db: D1Database,
  ctx?: { words?: EnVocabWord[]; display_order?: EnVocabDailyDisplayOrder }
): Promise<EnVocabTeacherVisibleLimit> {
  const words = ctx?.words ?? (await listEnVocabWords(db));
  const display_order =
    ctx?.display_order ?? (await ensureEnVocabDailyDisplayOrder(db, words));
  const current = await getEnVocabTeacherVisibleLimit(db);
  const today = beijingDateString();

  if (!words.length) {
    const empty: EnVocabTeacherVisibleLimit = {
      ...current,
      date: today,
      quiz_target: current.quiz_target || EN_VOCAB_TEACHER_VISIBLE_DEFAULT,
      released_today: false,
      visible_ids: [],
      release_count: 0,
    };
    return saveEnVocabTeacherVisibleLimit(db, empty);
  }

  const quiz_target = current.quiz_target || EN_VOCAB_TEACHER_VISIBLE_DEFAULT;
  // 当日已有可见池则沿用（对齐日语）；日序算法升级时由 ensureEnVocabDailyDisplayOrder 强制重物化
  if (
    current.date === today &&
    current.visible_ids?.length &&
    current.released_today
  ) {
    return current;
  }

  const materialized = materializeEnVocabTeacherVisible(
    {
      ...current,
      date: today,
      quiz_target,
    },
    words,
    display_order
  );
  return saveEnVocabTeacherVisibleLimit(db, materialized);
}

export async function setEnVocabDailyQuizTarget(
  db: D1Database,
  targetCount: number
): Promise<EnVocabTeacherVisibleLimit> {
  const words = await listEnVocabWords(db);
  if (!words.length) {
    throw new Error("empty_quiz_pool");
  }
  const display_order = await ensureEnVocabDailyDisplayOrder(db, words);
  const current = await getEnVocabTeacherVisibleLimit(db);
  const quiz_target = Math.min(
    Math.max(1, Math.floor(targetCount)),
    Math.max(1, words.length)
  );
  const draft: EnVocabTeacherVisibleLimit = {
    ...current,
    quiz_target,
  };
  const materialized = withEnVocabTargetAdjustmentMarker(
    materializeEnVocabTeacherVisible(draft, words, display_order)
  );
  if (!materialized.visible_ids?.length) {
    throw new Error("no_release_candidates");
  }
  return saveEnVocabTeacherVisibleLimit(db, materialized);
}

export async function ensureEnVocabSharedSchema(db: D1Database): Promise<void> {
  if (enVocabDbState.devStoreEnabled || enVocabDbState.enVocabSharedSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS en_vocab_shared (
         id         INTEGER PRIMARY KEY AUTOINCREMENT,
         word_id    INTEGER NOT NULL,
         shared_by  TEXT    NOT NULL,
         shared_at  TEXT    NOT NULL,
         share_date TEXT    NOT NULL,
         FOREIGN KEY (word_id) REFERENCES en_vocab_word (id) ON DELETE CASCADE
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_en_vocab_shared_day_word
       ON en_vocab_shared (share_date, word_id)`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_en_vocab_shared_date
       ON en_vocab_shared (share_date)`
    )
    .run();
  enVocabDbState.enVocabSharedSchemaReady = true;
}

export function mapSharedRow(
  row: Record<string, unknown>,
  word: EnVocabWord
): EnVocabSharedItem {
  const level: EnVocabLevel =
    word.last_review_level === "very" ||
    word.last_review_level === "normal" ||
    word.last_review_level === "weak"
      ? word.last_review_level
      : "weak";
  return {
    id: Number(row.id),
    word_id: Number(row.word_id),
    shared_by: String(row.shared_by),
    shared_at: String(row.shared_at),
    share_date: String(row.share_date),
    level,
    word,
  };
}

export function isEnVocabWordCheckedToday(word: EnVocabWord, now = new Date()): boolean {
  if (
    effectiveTodayCheckCount(word.today_check_count ?? 0, word.today_check_date, now) >
    0
  ) {
    return true;
  }
  if (!word.last_review_at || !word.last_review_level) return false;
  return word.last_review_at.slice(0, 10) === beijingDateString(now);
}

/** 轻量统计今日已抽查词条数（抽完禁用跟踪用） */
export async function countEnVocabTodayCheckedWords(
  db: D1Database,
  now = new Date()
): Promise<number> {
  if (enVocabDbState.devStoreEnabled) {
    return enVocabTodayCheckStats(enVocabDbState.devWords, now).wordCount;
  }

  await ensureVocabWordSchema(db);
  const today = beijingDateString(now);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM en_vocab_word
       WHERE today_check_date = ?1 AND COALESCE(today_check_count, 0) > 0`
    )
    .bind(today)
    .first<{ cnt: number }>();
  return Math.max(0, Number(row?.cnt ?? 0));
}

export type EnVocabDailyQuizProgressDb = {
  total: number;
  checked: number;
  remaining: number;
  complete: boolean;
};

export async function getEnVocabDailyQuizProgress(
  db: D1Database,
  now = new Date()
): Promise<EnVocabDailyQuizProgressDb> {
  const [checked, teacherVisibleLimit] = await Promise.all([
    countEnVocabTodayCheckedWords(db, now),
    getEnVocabTeacherVisibleLimit(db),
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
 * 学生 `/api/en-vocab/shared` 用：只回传分母（管理员今日抽查数量）。
 * 分子由客户端按今日共享列表条数自算（peek 入列表不写 today_check）。
 */
export async function getEnVocabStudyQuizProgressTarget(
  db: D1Database
): Promise<EnVocabDailyQuizProgressDb> {
  const teacherVisibleLimit = await getEnVocabTeacherVisibleLimit(db);
  const total = Math.max(0, Math.floor(teacherVisibleLimit.quiz_target));
  return {
    total,
    checked: 0,
    remaining: total,
    complete: false,
  };
}

