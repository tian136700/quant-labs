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
  refsRecord,
  upsertEnVocabRefMetadata,
  saveEnVocabRefFileMeta,
  getEnVocabRef,
  listEnVocabRefs,
  seedIfEmpty,
} from "./helpers";

import {
  ensureEnVocabSharedSchema,
  markEnVocabWordRoundChecked,
  getEnVocabTeacherVisibleLimit,
  saveEnVocabTeacherVisibleLimit,
  refreshEnVocabDailyDisplayOrder,
  appendEnVocabWordToDailyDisplayOrder,
} from "./daily_settings";
import {
  setEnVocabTeacherQuizLiveWord,
} from "./live";

export async function listEnVocabWords(db: D1Database): Promise<EnVocabWord[]> {
  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (enVocabDbState.devStoreEnabled) {
    return sortEnVocabWords(enVocabDbState.devWords);
  }

  const result = await db
    .prepare(
      `${WORD_SELECT}
       ORDER BY cnt_weak DESC, cnt_normal DESC, word COLLATE NOCASE ASC`
    )
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export async function listEnVocabWordsWithRefs(db: D1Database): Promise<{
  words: EnVocabWord[];
  refs: Record<string, EnVocabRef>;
}> {
  const [words, refs] = await Promise.all([
    listEnVocabWords(db),
    listEnVocabRefs(db),
  ]);
  return { words, refs: refsRecord(refs) };
}

/** 增量同步：仅返回 updated_at 晚于 since 的词条（轻量轮询用） */
export async function listEnVocabWordsChangedSince(
  db: D1Database,
  since: string
): Promise<EnVocabWord[]> {
  const marker = since.trim();
  if (!marker) return [];

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (enVocabDbState.devStoreEnabled) {
    return enVocabDbState.devWords
      .filter((w) => w.updated_at > marker)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  }

  const result = await db
    .prepare(
      `${WORD_SELECT} WHERE updated_at > ?1 ORDER BY updated_at ASC LIMIT 200`
    )
    .bind(marker)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export type RecordEnVocabReviewOptions = {
  /** 勾选后同步到学生「今日背英语单词」（对齐日语 shareToStudy） */
  shareToStudy?: boolean;
  sharedBy?: string;
};

export type RecordEnVocabReviewResult =
  | {
      ok: true;
      word: EnVocabWord;
      /** 该词今日已在共享列表（含本次新写入或原本已共享） */
      shared?: boolean;
      /** 本次新写入 en_vocab_shared */
      shared_new?: boolean;
    }
  | { ok: false; error: string };

export async function persistEnVocabReviewUpdate(
  db: D1Database,
  wordId: number,
  current: EnVocabWord,
  level: EnVocabLevel,
  usageLevels: EnVocabLevel[] | null,
  options?: RecordEnVocabReviewOptions
): Promise<RecordEnVocabReviewResult> {
  const { word: reviewed } = applyEnVocabReview(current, level);
  const updated: EnVocabWord =
    usageLevels != null
      ? {
          ...reviewed,
          last_usage_levels: serializeEnVocabLastUsageLevels(usageLevels),
        }
      : reviewed;

  const sharedByTrim = (options?.sharedBy || "").trim();
  const shouldShare = Boolean(options?.shareToStudy && sharedByTrim);

  if (enVocabDbState.devStoreEnabled) {
    const idx = enVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    enVocabDbState.devWords[idx] = updated;
    enVocabDbState.devDailyDisplayOrder = markEnVocabRoundChecked(
      enVocabDbState.devDailyDisplayOrder,
      wordId
    );

    let shared = false;
    let shared_new = false;
    if (shouldShare) {
      await ensureEnVocabSharedSchema(db);
      const today = beijingDateString();
      const already = enVocabDbState.devShared.some(
        (s) => s.share_date === today && s.word_id === wordId
      );
      shared = already;
      if (!already) {
        const ts = updated.updated_at || nowIso();
        enVocabDbState.devShared.push({
          id: enVocabDbState.devSharedNextId++,
          word_id: wordId,
          shared_by: sharedByTrim,
          shared_at: ts,
          share_date: today,
        });
        shared = true;
        shared_new = true;
      }
    }
    if (shared_new) {
      invalidateEnVocabSharedTodayCache();
    }
    return { ok: true, word: updated, shared, shared_new };
  }

  if (shouldShare) {
    await ensureEnVocabSharedSchema(db);
  }
  const today = beijingDateString();
  let alreadySharedToday = false;
  if (shouldShare) {
    const existing = await db
      .prepare(
        `SELECT 1 AS ok FROM en_vocab_shared
         WHERE share_date = ?1 AND word_id = ?2
         LIMIT 1`
      )
      .bind(today, wordId)
      .first<{ ok: number }>();
    alreadySharedToday = Boolean(existing);
  }
  const batchStmts = [
    db
      .prepare(
        `UPDATE en_vocab_word
       SET cnt_very = ?1,
           cnt_normal = ?2,
           cnt_weak = ?3,
           today_check_count = ?4,
           today_check_date = ?5,
           last_review_level = ?6,
           last_review_at = ?7,
           last_usage_levels = COALESCE(?8, last_usage_levels),
           updated_at = ?9
       WHERE id = ?10`
      )
      .bind(
        updated.cnt_very,
        updated.cnt_normal,
        updated.cnt_weak,
        updated.today_check_count,
        updated.today_check_date,
        updated.last_review_level,
        updated.last_review_at,
        usageLevels != null
          ? serializeEnVocabLastUsageLevels(usageLevels)
          : null,
        updated.updated_at,
        wordId
      ),
  ];

  if (shouldShare && !alreadySharedToday) {
    batchStmts.push(
      db
        .prepare(
          `INSERT INTO en_vocab_shared (word_id, shared_by, shared_at, share_date)
       VALUES (?1, ?2, ?3, ?4)`
        )
        .bind(wordId, sharedByTrim, updated.updated_at, today)
    );
  }

  const batchResults = await db.batch(batchStmts);

  if (!batchResults[0]?.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  await markEnVocabWordRoundChecked(db, wordId);

  let shared = false;
  let shared_new = false;
  if (shouldShare) {
    shared_new = !alreadySharedToday;
    shared = shared_new || alreadySharedToday;
  }

  if (shared_new) {
    invalidateEnVocabSharedTodayCache();
  }

  return { ok: true, word: updated, shared, shared_new };
}

export async function recordEnVocabReview(
  db: D1Database,
  wordId: number,
  level: EnVocabLevel,
  options?: RecordEnVocabReviewOptions
): Promise<RecordEnVocabReviewResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  if (!isEnVocabLevel(level)) {
    return { ok: false, error: "level_invalid" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (enVocabDbState.devStoreEnabled) {
    const idx = enVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    const current = enVocabDbState.devWords[idx];
    if (isEnVocabWordReviewLocked(current)) {
      return { ok: false, error: "review_locked" };
    }
    return persistEnVocabReviewUpdate(db, wordId, current, level, null, options);
  }

  const row = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  const current = mapRow(row);
  if (isEnVocabWordReviewLocked(current)) {
    return { ok: false, error: "review_locked" };
  }

  return persistEnVocabReviewUpdate(db, wordId, current, level, null, options);
}

/** 老师抽查卡：按用法勾选 → 汇总总体后写入 cnt_* / last_review_* / last_usage_levels；可顺带共享到学生端 */
export async function recordEnVocabReviewWithUsageLevels(
  db: D1Database,
  wordId: number,
  usageLevels: EnVocabLevel[],
  options?: RecordEnVocabReviewOptions
): Promise<RecordEnVocabReviewResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  if (!Array.isArray(usageLevels) || !usageLevels.length) {
    return { ok: false, error: "usage_levels_invalid" };
  }
  if (!usageLevels.every(isEnVocabLevel)) {
    return { ok: false, error: "usage_levels_invalid" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  let current: EnVocabWord;
  if (enVocabDbState.devStoreEnabled) {
    const idx = enVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    current = enVocabDbState.devWords[idx];
  } else {
    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();
    if (!row) return { ok: false, error: "not_found" };
    current = mapRow(row);
  }

  if (isEnVocabWordReviewLocked(current)) {
    return { ok: false, error: "review_locked" };
  }

  const expectedCount = listEnVocabUsagePointsForDisplay(current.usage).points
    .length;
  if (expectedCount > 0 && usageLevels.length !== expectedCount) {
    return { ok: false, error: "usage_levels_count_mismatch" };
  }
  if (expectedCount === 0 && usageLevels.length !== 1) {
    return { ok: false, error: "usage_levels_count_mismatch" };
  }

  let overall: EnVocabLevel;
  try {
    overall = aggregateEnVocabUsageLevels(usageLevels);
  } catch {
    return { ok: false, error: "usage_levels_invalid" };
  }

  return persistEnVocabReviewUpdate(
    db,
    wordId,
    current,
    overall,
    usageLevels,
    options
  );
}

export type ResetEnVocabReviewsResult =
  | { ok: true; words: EnVocabWord[]; display_order: EnVocabDailyDisplayOrder }
  | { ok: false; error: string };

/**
 * 管理员重置时必须清共享：英语「今日已共享」会锁死熟悉程度勾选；
 * 只清 cnt_* / last_review_* 会留下「从未抽查 + 已共享」矛盾态。
 */
export async function clearEnVocabSharedOnReset(
  db: D1Database,
  scope: "today" | "all"
): Promise<void> {
  await ensureEnVocabSharedSchema(db);
  const today = beijingDateString();
  if (enVocabDbState.devStoreEnabled) {
    if (scope === "all") {
      enVocabDbState.devShared.length = 0;
    } else {
      for (let i = enVocabDbState.devShared.length - 1; i >= 0; i--) {
        if (enVocabDbState.devShared[i].share_date === today) {
          enVocabDbState.devShared.splice(i, 1);
        }
      }
    }
    invalidateEnVocabSharedTodayCache();
    await setEnVocabTeacherQuizLiveWord(db, null);
    return;
  }
  if (scope === "all") {
    await db.prepare(`DELETE FROM en_vocab_shared`).run();
  } else {
    await db
      .prepare(`DELETE FROM en_vocab_shared WHERE share_date = ?1`)
      .bind(today)
      .run();
  }
  invalidateEnVocabSharedTodayCache();
  await setEnVocabTeacherQuizLiveWord(db, null);
}

export async function resetAllEnVocabReviews(
  db: D1Database
): Promise<ResetEnVocabReviewsResult> {
  await seedIfEmpty(db);
  const ts = nowIso();

  if (enVocabDbState.devStoreEnabled) {
    for (let i = 0; i < enVocabDbState.devWords.length; i++) {
      enVocabDbState.devWords[i] = {
        ...enVocabDbState.devWords[i],
        cnt_very: 0,
        cnt_normal: 0,
        cnt_weak: 0,
        today_check_count: 0,
        today_check_date: null,
        last_review_level: null,
        last_review_at: null,
        last_usage_levels: null,
        updated_at: ts,
      };
    }
    await clearEnVocabSharedOnReset(db, "all");
    const words = sortEnVocabWords(enVocabDbState.devWords);
    enVocabDbState.devDailyDisplayOrder = await refreshEnVocabDailyDisplayOrder(db, words);
    const current = await getEnVocabTeacherVisibleLimit(db);
    await saveEnVocabTeacherVisibleLimit(
      db,
      materializeEnVocabTeacherVisible(current, words, enVocabDbState.devDailyDisplayOrder)
    );
    return { ok: true, words, display_order: enVocabDbState.devDailyDisplayOrder };
  }

  await db
    .prepare(
      `UPDATE en_vocab_word
       SET cnt_very = 0, cnt_normal = 0, cnt_weak = 0,
           today_check_count = 0, today_check_date = NULL,
           last_review_level = NULL, last_review_at = NULL,
           last_usage_levels = NULL,
           updated_at = ?1`
    )
    .bind(ts)
    .run();

  await clearEnVocabSharedOnReset(db, "all");

  const words = await listEnVocabWords(db);
  const display_order = await refreshEnVocabDailyDisplayOrder(db, words);
  // 强制按新日序重算可见池（ensure 在已有 visible_ids 时会短路）
  const current = await getEnVocabTeacherVisibleLimit(db);
  await saveEnVocabTeacherVisibleLimit(
    db,
    materializeEnVocabTeacherVisible(current, words, display_order)
  );
  return { ok: true, words, display_order };
}

export async function resetTodayEnVocabRound(
  db: D1Database
): Promise<ResetEnVocabReviewsResult> {
  await seedIfEmpty(db);
  // 今日重置也要清今日共享，否则「已共享」锁仍挡住下午再抽 / 再勾熟悉程度
  await clearEnVocabSharedOnReset(db, "today");
  const words = await listEnVocabWords(db);
  const display_order = await refreshEnVocabDailyDisplayOrder(db, words);
  const current = await getEnVocabTeacherVisibleLimit(db);
  await saveEnVocabTeacherVisibleLimit(
    db,
    materializeEnVocabTeacherVisible(current, words, display_order)
  );
  return { ok: true, words, display_order };
}

export type UploadEnVocabWordsResult =
  | { ok: true; added: number; skipped: number; total: number }
  | { ok: false; error: string };

export async function uploadEnVocabWords(
  db: D1Database,
  words: EnVocabUploadInput[],
  replace = false,
  refs: EnVocabRefUploadInput[] = []
): Promise<UploadEnVocabWordsResult> {
  const cleaned = words
    .map((w) => ({
      word: normalizeWord(w.word),
      reading: (w.reading || "").trim() || null,
      meaning: (w.meaning || "").trim() || null,
      kind: normalizeKind(w.kind),
      ref_key: w.ref_key ? normalizeEnVocabRefKey(w.ref_key) || null : null,
    }))
    .filter((w) => w.word);

  if (!cleaned.length) {
    return { ok: false, error: "words_empty" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  if (refs.length) {
    await upsertEnVocabRefMetadata(db, refs);
  }

  if (enVocabDbState.devStoreEnabled) {
    if (replace) {
      enVocabDbState.devWords.length = 0;
      enVocabDbState.devNextId = 1;
    }
    let added = 0;
    let skipped = 0;
    for (const item of cleaned) {
      const exists = enVocabDbState.devWords.some((w) => w.word === item.word);
      if (exists && !replace) {
        skipped++;
        continue;
      }
      enVocabDbState.devWords.push({
        id: enVocabDbState.devNextId++,
        word: item.word,
        reading: item.reading,
        meaning: item.meaning,
        pos: null,
        kind: item.kind,
        ref_key: item.ref_key,
        cnt_very: 0,
        cnt_normal: 0,
        cnt_weak: 0,
        today_check_count: 0,
        today_check_date: null,
        class_notes: null,
        created_at: ts,
        updated_at: ts,
      });
      added++;
    }
    return { ok: true, added, skipped, total: enVocabDbState.devWords.length };
  }

  if (replace) {
    await db.prepare("DELETE FROM en_vocab_word").run();
  }

  let added = 0;
  let skipped = 0;
  const existing = replace
    ? new Set<string>()
    : new Set(
        (
          await db
            .prepare("SELECT word FROM en_vocab_word")
            .all<{ word: string }>()
        ).results?.map((r) => r.word) ?? []
      );

  const inserts: D1PreparedStatement[] = [];
  for (const item of cleaned) {
    if (existing.has(item.word)) {
      skipped++;
      continue;
    }
    existing.add(item.word);
    inserts.push(
      db
        .prepare(
          `INSERT INTO en_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, NULL, NULL, ?6, ?6)`
        )
        .bind(
          item.word,
          item.reading,
          item.meaning,
          item.kind,
          item.ref_key,
          ts
        )
    );
    added++;
  }

  if (inserts.length) {
    await db.batch(inserts);
  }

  const totalRow = await db
    .prepare("SELECT COUNT(*) AS c FROM en_vocab_word")
    .first<{ c: number }>();

  return {
    ok: true,
    added,
    skipped,
    total: totalRow?.c ?? 0,
  };
}

export type AddEnVocabWordResult =
  | { ok: true; word: EnVocabWord }
  | { ok: false; error: string };

export async function addEnVocabWord(
  db: D1Database,
  input: EnVocabUploadInput
): Promise<AddEnVocabWordResult> {
  const word = normalizeWord(input.word);
  if (!word) return { ok: false, error: "word_required" };

  const item = {
    word,
    reading: (input.reading || "").trim() || null,
    meaning: (input.meaning || "").trim() || null,
    kind: normalizeKind(input.kind),
    ref_key: input.ref_key
      ? normalizeEnVocabRefKey(input.ref_key) || null
      : null,
    class_notes: (input.class_notes || "").trim() || null,
  };

  await seedIfEmpty(db);
  const ts = nowIso();

  if (enVocabDbState.devStoreEnabled) {
    if (enVocabDbState.devWords.some((w) => w.word === item.word)) {
      return { ok: false, error: "word_duplicate" };
    }
    const created: EnVocabWord = {
      id: enVocabDbState.devNextId++,
      word: item.word,
      reading: item.reading,
      meaning: item.meaning,
      pos: null,
      kind: item.kind,
      ref_key: item.ref_key,
      cnt_very: 0,
      cnt_normal: 0,
      cnt_weak: 0,
      today_check_count: 0,
      today_check_date: null,
      class_notes: item.class_notes,
      created_at: ts,
      updated_at: ts,
    };
    enVocabDbState.devWords.push(created);
    enVocabDbState.devDailyDisplayOrder = appendEnVocabDailyDisplayOrderId(
      enVocabDbState.devDailyDisplayOrder,
      created.id
    );
    return { ok: true, word: created };
  }

  const existing = await db
    .prepare("SELECT id FROM en_vocab_word WHERE word = ?1 LIMIT 1")
    .bind(item.word)
    .first<{ id: number }>();

  if (existing) return { ok: false, error: "word_duplicate" };

  const insertResult = await db
    .prepare(
      `INSERT INTO en_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, NULL, ?6, ?7, ?7)`
    )
    .bind(
      item.word,
      item.reading,
      item.meaning,
      item.kind,
      item.ref_key,
      item.class_notes,
      ts
    )
    .run();

  const newId = insertResult.meta?.last_row_id;
  if (!newId) return { ok: false, error: "insert_failed" };

  const row = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(newId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "insert_failed" };

  const created = mapRow(row);
  await appendEnVocabWordToDailyDisplayOrder(db, created.id);
  return { ok: true, word: created };
}

/** 按图片内容 hash 去重：相同字节共用 ref_key，已存在则跳过上传 */
export async function getOrUploadEnVocabRefByContent(
  env: CloudflareEnv,
  db: D1Database,
  bytes: ArrayBuffer,
  mediaType: EnVocabMediaType,
  title: string | null
): Promise<{ ref: EnVocabRef; deduped: boolean }> {
  const refKey = await enVocabRefKeyFromBytes(bytes);
  const existing = await getEnVocabRef(db, refKey);

  if (existing) {
    const hasFile = await enVocabRefFileExists(
      env,
      refKey,
      existing.media_type,
      existing.r2_key
    );
    if (hasFile) {
      return { ref: existing, deduped: true };
    }
  }

  const stored = await putEnVocabRefFile(env, refKey, mediaType, bytes);
  const ref = await saveEnVocabRefFileMeta(
    db,
    refKey,
    title,
    mediaType,
    stored.r2_key
  );
  return { ref, deduped: false };
}

/** 新课标记完成时：仅写入尚不存在的词条（已存在则跳过）并带上教案 ref_key */
