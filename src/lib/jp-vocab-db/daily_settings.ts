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
} from "./helpers";
import {
  listJpVocabWordsForPool,
} from "./words";

async function readJpVocabQuizPriorityBoostRaw(
  db: D1Database
): Promise<JpVocabQuizPriorityBoost | null> {
  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devQuizPriorityBoost;
  }

  await ensureJpVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM jp_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_QUIZ_PRIORITY_BOOST_KEY)
    .first<{ value: string }>();
  if (!row?.value) return null;
  try {
    return normalizeJpVocabQuizPriorityBoost(JSON.parse(row.value));
  } catch {
    return null;
  }
}

export async function saveJpVocabQuizPriorityBoost(
  db: D1Database,
  boost: JpVocabQuizPriorityBoost | null
): Promise<void> {
  if (jpVocabDbState.devStoreEnabled) {
    jpVocabDbState.devQuizPriorityBoost = boost;
    return;
  }

  await ensureJpVocabSettingSchema(db);
  if (!boost) {
    await db
      .prepare(`DELETE FROM jp_vocab_setting WHERE key = ?1`)
      .bind(JP_VOCAB_QUIZ_PRIORITY_BOOST_KEY)
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO jp_vocab_setting (key, value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .bind(JP_VOCAB_QUIZ_PRIORITY_BOOST_KEY, JSON.stringify(boost), nowIso())
    .run();
}

export async function getJpVocabQuizPriorityBoost(
  db: D1Database
): Promise<JpVocabQuizPriorityBoost | null> {
  return readJpVocabQuizPriorityBoostRaw(db);
}

export async function boostJpVocabQuizPriority(
  db: D1Database,
  wordId: number,
  options: { now?: Date } = {}
): Promise<
  | { ok: true; quiz_priority_boost: JpVocabQuizPriorityBoost }
  | { ok: false; error: string }
> {
  const now = options.now ?? new Date();
  const words = await listJpVocabWordsForPool(db);
  if (!words.some((word) => word.id === wordId)) {
    return { ok: false, error: "not_found" };
  }

  const current = await readJpVocabQuizPriorityBoostRaw(db);
  const next = appendJpVocabQuizPriorityBoostEntry(current, wordId, now);
  await saveJpVocabQuizPriorityBoost(db, next);
  return { ok: true, quiz_priority_boost: next };
}

export async function computeJpVocabDailyDisplayOrderFromDb(
  db: D1Database,
  words: JpVocabWord[],
  now = new Date()
): Promise<{ ids: number[]; consumedBoost: boolean }> {
  const today = beijingDateString(now);
  const [boost, timeWeight] = await Promise.all([
    readJpVocabQuizPriorityBoostRaw(db),
    getJpVocabQuizTimeWeight(db),
  ]);
  const boostMap = buildJpVocabQuizPriorityBoostSeqMap(boost, today);
  const ids = computeJpVocabDailyDisplayOrder(
    words,
    now,
    boostMap,
    timeWeight
  );
  return { ids, consumedBoost: boostMap.size > 0 };
}

export async function maybeClearConsumedJpVocabQuizPriorityBoost(
  db: D1Database,
  effectiveDate: string,
  consumed: boolean
): Promise<void> {
  if (!consumed) return;
  const boost = await readJpVocabQuizPriorityBoostRaw(db);
  const next = clearJpVocabQuizPriorityBoostForDate(boost, effectiveDate);
  if (next !== boost) {
    await saveJpVocabQuizPriorityBoost(db, next);
  }
}

export async function pruneJpVocabQuizPriorityBoostForDeletedWords(
  db: D1Database,
  removedWordIds: Set<number>
): Promise<void> {
  if (removedWordIds.size === 0) return;
  const boost = await readJpVocabQuizPriorityBoostRaw(db);
  const next = pruneJpVocabQuizPriorityBoostWordIds(boost, removedWordIds);
  if (next !== boost) {
    await saveJpVocabQuizPriorityBoost(db, next);
  }
}

export async function readJpVocabDailyDisplayOrderRaw(
  db: D1Database
): Promise<JpVocabDailyDisplayOrder | null> {
  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devDailyDisplayOrder.ids.length ? jpVocabDbState.devDailyDisplayOrder : null;
  }

  await ensureJpVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM jp_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_DAILY_DISPLAY_ORDER_KEY)
    .first<{ value: string }>();

  if (!row?.value) return null;

  try {
    const parsed = JSON.parse(row.value) as Partial<JpVocabDailyDisplayOrder>;
    if (!parsed.date || !Array.isArray(parsed.ids)) return null;
    const order: JpVocabDailyDisplayOrder = {
      date: parsed.date,
      ids: parsed.ids.map((id) => Number(id)).filter((id) => id > 0),
    };
    if (Object.prototype.hasOwnProperty.call(parsed, "round_checked_ids")) {
      order.round_checked_ids = normalizeJpVocabRoundCheckedIds(
        parsed.round_checked_ids
      );
    }
    return order;
  } catch {
    return null;
  }
}

export async function saveJpVocabDailyDisplayOrder(
  db: D1Database,
  order: JpVocabDailyDisplayOrder
): Promise<void> {
  if (jpVocabDbState.devStoreEnabled) {
    jpVocabDbState.devDailyDisplayOrder = order;
    return;
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
    .bind(JP_VOCAB_DAILY_DISPLAY_ORDER_KEY, JSON.stringify(order), nowIso())
    .run();
}

/** 当日已有顺序则沿用（仅合并增删词条）；跨日则按抽查优先级重排 */
export async function ensureJpVocabDailyDisplayOrder(
  db: D1Database,
  words: JpVocabWord[]
): Promise<JpVocabDailyDisplayOrder> {
  const today = beijingDateString();
  const stored = await readJpVocabDailyDisplayOrderRaw(db);

  if (stored?.date === today && stored.ids.length > 0) {
    const merged = mergeJpVocabDailyDisplayOrder(stored.ids, words);
    const round_checked_ids = resolveJpVocabRoundCheckedIds(
      stored.round_checked_ids,
      words
    );
    const prevChecked = normalizeJpVocabRoundCheckedIds(stored.round_checked_ids);
    const roundCheckedChanged =
      prevChecked.length !== round_checked_ids.length ||
      prevChecked.some((id) => !round_checked_ids.includes(id));
    const order = {
      date: today,
      ids: merged,
      round_checked_ids,
    };
    if (
      merged.length !== stored.ids.length ||
      merged.some((id, i) => id !== stored.ids[i]) ||
      roundCheckedChanged
    ) {
      await saveJpVocabDailyDisplayOrder(db, order);
    }
    return order;
  }

  const { ids, consumedBoost } = await computeJpVocabDailyDisplayOrderFromDb(
    db,
    words
  );
  const order = {
    date: today,
    ids,
    round_checked_ids: [] as number[],
  };
  await saveJpVocabDailyDisplayOrder(db, order);
  await maybeClearConsumedJpVocabQuizPriorityBoost(db, today, consumedBoost);
  return order;
}

/** 强制按当前数据重算当日顺序（如今日重置 / 全部重置后） */
export async function refreshJpVocabDailyDisplayOrder(
  db: D1Database,
  words: JpVocabWord[],
  now = new Date()
): Promise<JpVocabDailyDisplayOrder> {
  const today = beijingDateString(now);
  const { ids, consumedBoost } = await computeJpVocabDailyDisplayOrderFromDb(
    db,
    words,
    now
  );
  const order = {
    date: today,
    ids,
    round_checked_ids: [] as number[],
  };
  await saveJpVocabDailyDisplayOrder(db, order);
  await maybeClearConsumedJpVocabQuizPriorityBoost(db, today, consumedBoost);
  return order;
}

export async function markJpVocabWordRoundChecked(
  db: D1Database,
  wordId: number
): Promise<void> {
  if (jpVocabDbState.devStoreEnabled) {
    jpVocabDbState.devDailyDisplayOrder = markJpVocabRoundChecked(jpVocabDbState.devDailyDisplayOrder, wordId);
    return;
  }

  const stored = await readJpVocabDailyDisplayOrderRaw(db);
  const today = beijingDateString();
  const base =
    stored?.date === today
      ? stored
      : { date: today, ids: [] as number[], round_checked_ids: [] as number[] };
  const next = markJpVocabRoundChecked(base, wordId);
  if ((next.round_checked_ids ?? []).length !== (base.round_checked_ids ?? []).length) {
    await saveJpVocabDailyDisplayOrder(db, next);
  }
}

export async function unmarkJpVocabWordRoundChecked(
  db: D1Database,
  wordId: number
): Promise<JpVocabDailyDisplayOrder | null> {
  if (jpVocabDbState.devStoreEnabled) {
    const next = unmarkJpVocabRoundChecked(jpVocabDbState.devDailyDisplayOrder, wordId);
    if (
      (next.round_checked_ids ?? []).length !==
      (jpVocabDbState.devDailyDisplayOrder.round_checked_ids ?? []).length
    ) {
      jpVocabDbState.devDailyDisplayOrder = next;
      return next;
    }
    return null;
  }

  const stored = await readJpVocabDailyDisplayOrderRaw(db);
  const today = beijingDateString();
  const base =
    stored?.date === today
      ? stored
      : { date: today, ids: [] as number[], round_checked_ids: [] as number[] };
  const next = unmarkJpVocabRoundChecked(base, wordId);
  if ((next.round_checked_ids ?? []).length !== (base.round_checked_ids ?? []).length) {
    await saveJpVocabDailyDisplayOrder(db, next);
    return next;
  }
  return null;
}

export async function appendJpVocabWordToDailyDisplayOrder(
  db: D1Database,
  wordId: number
): Promise<void> {
  const stored = await readJpVocabDailyDisplayOrderRaw(db);
  const today = beijingDateString();
  // 跨日或空顺序：必须全量 ensure（从未抽查优先重排）。禁止写成 {date:today, ids:[新词]}，
  // 否则同日 merge 会把其余词条按任意顺序堆在后面，序号与今日池严重错位。
  if (!stored?.ids.length || stored.date !== today) {
    const words = await listJpVocabWordsForPool(db);
    await ensureJpVocabDailyDisplayOrder(db, words);
    return;
  }
  const next = appendJpVocabDailyDisplayOrderId(stored, wordId);
  if (next.ids.length !== stored.ids.length) {
    await saveJpVocabDailyDisplayOrder(db, next);
  }
}

export async function ensureJpVocabSettingSchema(db: D1Database): Promise<void> {
  if (jpVocabDbState.devStoreEnabled || jpVocabDbState.jpVocabSettingSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_vocab_setting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
  jpVocabDbState.jpVocabSettingSchemaReady = true;
}

export async function getJpVocabDailyQuizStyle(
  db: D1Database
): Promise<JpVocabDailyQuizStyle> {
  if (jpVocabDbState.devStoreEnabled) {
    return normalizeJpVocabDailyQuizStyle(jpVocabDbState.devDailyQuizStyle);
  }

  await ensureJpVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM jp_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_DAILY_QUIZ_STYLE_KEY)
    .first<{ value: string }>();

  if (!row?.value) {
    return JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT;
  }

  try {
    return normalizeJpVocabDailyQuizStyle(
      JSON.parse(row.value) as Partial<JpVocabDailyQuizStyle>
    );
  } catch {
    return JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT;
  }
}

export async function setJpVocabDailyQuizStyle(
  db: D1Database,
  style: JpVocabDailyQuizStyle
): Promise<JpVocabDailyQuizStyle> {
  const normalized = normalizeJpVocabDailyQuizStyle(style);

  if (jpVocabDbState.devStoreEnabled) {
    jpVocabDbState.devDailyQuizStyle = normalized;
    return normalized;
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
    .bind(
      JP_VOCAB_DAILY_QUIZ_STYLE_KEY,
      JSON.stringify(normalized),
      nowIso()
    )
    .run();

  return normalized;
}

/** 久未复习抬升权重：固定默认 0.1（SRS 为主序后不再开放管理员调节） */
export async function getJpVocabQuizTimeWeight(
  _db: D1Database
): Promise<number> {
  return JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT;
}

export async function getJpVocabTeacherVisibleLimit(
  db: D1Database,
  opts?: { bypassCache?: boolean }
): Promise<JpVocabTeacherVisibleLimit> {
  if (jpVocabDbState.devStoreEnabled) {
    return normalizeJpVocabTeacherVisibleLimit(jpVocabDbState.devTeacherVisibleLimit);
  }

  const now = Date.now();
  if (
    !opts?.bypassCache &&
    jpVocabDbState.teacherVisibleLimitReadCache &&
    now - jpVocabDbState.teacherVisibleLimitReadCache.at < JP_VOCAB_SETTING_READ_CACHE_MS
  ) {
    const cached = jpVocabDbState.teacherVisibleLimitReadCache.value;
    const today = beijingDateString();
    if (!cached.date || cached.date === today) {
      return cached;
    }
  }

  const raw = await readJpVocabTeacherVisibleLimitRaw(db);
  const normalized = normalizeJpVocabTeacherVisibleLimit(raw);
  const today = beijingDateString();
  if (raw?.date && raw.date !== today) {
    const rolled = await saveJpVocabTeacherVisibleLimit(db, {
      ...normalized,
      visible_ids: undefined,
    });
    jpVocabDbState.teacherVisibleLimitReadCache = { at: now, value: rolled };
    return rolled;
  }
  jpVocabDbState.teacherVisibleLimitReadCache = { at: now, value: normalized };
  return normalized;
}

export async function readJpVocabTeacherVisibleLimitRaw(
  db: D1Database
): Promise<Partial<JpVocabTeacherVisibleLimit> | null> {
  await ensureJpVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM jp_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_TEACHER_VISIBLE_LIMIT_KEY)
    .first<{ value: string }>();

  if (!row?.value) return null;

  try {
    return JSON.parse(row.value) as Partial<JpVocabTeacherVisibleLimit>;
  } catch {
    return null;
  }
}

/** 读取老师可见批次；仅在目标数大于已生成池时重算并落库 */
export async function ensureJpVocabTeacherVisibleLimit(
  db: D1Database,
  ctx?: { words: JpVocabWord[]; displayOrder: JpVocabDailyDisplayOrder }
): Promise<JpVocabTeacherVisibleLimit> {
  const current = await getJpVocabTeacherVisibleLimit(db);
  const words = ctx?.words ?? (await listJpVocabWordsForPool(db));
  const displayOrder =
    ctx?.displayOrder ?? (await ensureJpVocabDailyDisplayOrder(db, words));
  if (
    !shouldMaterializeJpVocabTeacherVisibleLimit(current, {
      displayOrder,
      words,
    })
  ) {
    return current;
  }
  const materialized = materializeJpVocabTeacherVisibleLimit(
    current,
    displayOrder,
    words
  );
  if (!teacherVisibleLimitNeedsPersist(current, materialized)) {
    return materialized;
  }
  return saveJpVocabTeacherVisibleLimit(db, {
    ...materialized,
    quiz_target_adjusted_at: current.quiz_target_adjusted_at,
  });
}

export function withJpVocabTargetAdjustmentMarker(
  materialized: JpVocabTeacherVisibleLimit,
  now = new Date()
): JpVocabTeacherVisibleLimit {
  return {
    ...materialized,
    quiz_target_adjusted_at: formatReviewIso(now),
  };
}

export async function saveJpVocabTeacherVisibleLimit(
  db: D1Database,
  limit: JpVocabTeacherVisibleLimit
): Promise<JpVocabTeacherVisibleLimit> {
  const next = normalizeJpVocabTeacherVisibleLimit({
    ...limit,
    date: limit.date ?? beijingDateString(),
  });

  if (jpVocabDbState.devStoreEnabled) {
    jpVocabDbState.devTeacherVisibleLimit = next;
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
    .bind(
      JP_VOCAB_TEACHER_VISIBLE_LIMIT_KEY,
      JSON.stringify(next),
      nowIso()
    )
    .run();

  jpVocabDbState.teacherVisibleLimitReadCache = { at: Date.now(), value: next };
  return next;
}

export async function expandJpVocabTeacherVisibleLimit(
  db: D1Database,
  releaseCount: number
): Promise<JpVocabTeacherVisibleLimit> {
  const current = await getJpVocabTeacherVisibleLimit(db);
  const addCount = Math.max(1, Math.floor(releaseCount));
  const words = await listJpVocabWordsForPool(db);
  const displayOrder = await ensureJpVocabDailyDisplayOrder(db, words);

  const previousTotal = current.released_today ? current.release_count : 0;
  const newTotal = previousTotal + addCount;

  const draft: JpVocabTeacherVisibleLimit = {
    ...current,
    released_today: true,
    release_count: newTotal,
    excluded_batch_ids: [],
  };

  const materialized = materializeJpVocabTeacherVisibleLimit(
    draft,
    displayOrder,
    words
  );

  if (!materialized.visible_ids?.length) {
    throw new Error("no_release_candidates");
  }

  if (materialized.visible_ids.length < newTotal) {
    return saveJpVocabTeacherVisibleLimit(
      db,
      withJpVocabTargetAdjustmentMarker({
        ...materialized,
        release_count: materialized.visible_ids.length,
      })
    );
  }

  return saveJpVocabTeacherVisibleLimit(
    db,
    withJpVocabTargetAdjustmentMarker(materialized)
  );
}

export async function setJpVocabDailyQuizTarget(
  db: D1Database,
  targetCount: number,
  hideCheckedToday = false
): Promise<JpVocabTeacherVisibleLimit> {
  const current = await getJpVocabTeacherVisibleLimit(db);
  const quiz_target = Math.min(Math.max(1, Math.floor(targetCount)), 999);
  const words = await listJpVocabWordsForPool(db);
  const displayOrder = await ensureJpVocabDailyDisplayOrder(db, words);

  const draft: JpVocabTeacherVisibleLimit = {
    ...current,
    quiz_target,
    hide_checked_today: hideCheckedToday,
  };

  const materialized = applyJpVocabQuizTargetVisiblePlan(
    draft,
    displayOrder,
    words
  );

  if (!materialized.visible_ids?.length) {
    throw new Error("no_release_candidates");
  }

  return saveJpVocabTeacherVisibleLimit(
    db,
    withJpVocabTargetAdjustmentMarker(materialized)
  );
}

/** 北京时间跨日清理时恢复老师默认可见序号 1–20，抽查目标恢复默认 20 */
export async function resetJpVocabTeacherVisibleLimit(
  db: D1Database
): Promise<JpVocabTeacherVisibleLimit> {
  const current = await getJpVocabTeacherVisibleLimit(db);
  return saveJpVocabTeacherVisibleLimit(db, {
    ...current,
    date: beijingDateString(),
    limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    quiz_target: JP_VOCAB_DAILY_QUIZ_TOP,
    released_today: false,
    release_count: JP_VOCAB_DAILY_QUIZ_TOP,
    hide_checked_today: false,
    excluded_batch_ids: [],
    visible_ids: undefined,
    quiz_target_adjusted_at: undefined,
    sticky_visible_ids: undefined,
    quiz_target_base_checked: undefined,
  });
}

export async function ensureJpVocabSharedSchema(db: D1Database): Promise<void> {
  if (jpVocabDbState.devStoreEnabled) return;
  if (!jpVocabDbState.jpVocabSharedSchemaReady) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS jp_vocab_shared (
         id         INTEGER PRIMARY KEY AUTOINCREMENT,
         word_id    INTEGER NOT NULL,
         shared_by  TEXT    NOT NULL,
         shared_at  TEXT    NOT NULL,
         share_date TEXT    NOT NULL,
         FOREIGN KEY (word_id) REFERENCES jp_vocab_word (id) ON DELETE CASCADE
       )`
      )
      .run();
    await db
      .prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_jp_vocab_shared_day_word
       ON jp_vocab_shared (share_date, word_id)`
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_jp_vocab_shared_date
       ON jp_vocab_shared (share_date)`
      )
      .run();
    jpVocabDbState.jpVocabSharedSchemaReady = true;
  }
  if (jpVocabDbState.jpVocabSharedColumnsReady) return;
  const info = await db
    .prepare(`PRAGMA table_info(jp_vocab_shared)`)
    .all<{ name: string }>();
  const cols = new Set((info.results ?? []).map((row) => row.name));
  if (!cols.has("auto_marked_level")) {
    await db
      .prepare(`ALTER TABLE jp_vocab_shared ADD COLUMN auto_marked_level TEXT`)
      .run();
  }
  jpVocabDbState.jpVocabSharedColumnsReady = true;
}

export function mapSharedRow(
  row: Record<string, unknown>,
  word: JpVocabWord
): JpVocabSharedItem {
  return {
    id: Number(row.id),
    word_id: Number(row.word_id),
    shared_by: String(row.shared_by),
    shared_at: String(row.shared_at),
    share_date: String(row.share_date),
    level: resolveJpVocabSharedTeacherLevel(word),
    word,
  };
}

export function isJpVocabWordCheckedToday(word: JpVocabWord, now = new Date()): boolean {
  if (
    effectiveTodayCheckCount(word.today_check_count ?? 0, word.today_check_date, now) >
    0
  ) {
    return true;
  }
  if (!word.last_review_at || !word.last_review_level) return false;
  return word.last_review_at.slice(0, 10) === beijingDateString(now);
}

