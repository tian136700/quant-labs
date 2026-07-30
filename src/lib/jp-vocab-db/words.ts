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
import { parseJpVocabAnnotationInput } from "@/lib/jp-vocab-annotation";
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
  normalizeWord,
  normalizeKind,
  mapRow,
  ensureVocabWordSchema,
  WORD_SELECT,
  refsRecord,
  upsertJpVocabRefMetadata,
  saveJpVocabRefFileMeta,
  getJpVocabRef,
  listJpVocabRefs,
  seedIfEmpty,
} from "./helpers";

import {
  ensureJpVocabSharedSchema,
  markJpVocabWordRoundChecked,
  pruneJpVocabQuizPriorityBoostForDeletedWords,
  ensureJpVocabDailyDisplayOrder,
  saveJpVocabDailyDisplayOrder,
  getJpVocabTeacherVisibleLimit,
  saveJpVocabTeacherVisibleLimit,
  refreshJpVocabDailyDisplayOrder,
  readJpVocabTeacherVisibleLimitRaw,
  appendJpVocabWordToDailyDisplayOrder,
} from "./daily_settings";
import {
  ensureJpVocabReviewDoneSchema,
  getJpVocabTeacherQuizLive,
  setJpVocabTeacherQuizLiveWord,
} from "./live_rollover";

export async function listJpVocabWords(db: D1Database): Promise<JpVocabWord[]> {
  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (jpVocabDbState.devStoreEnabled) {
    return sortJpVocabWords(jpVocabDbState.devWords);
  }

  const result = await db
    .prepare(
      `${WORD_SELECT}
       ORDER BY cnt_weak DESC, cnt_normal DESC, word COLLATE NOCASE ASC`
    )
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export async function listJpVocabWordsWithRefs(db: D1Database): Promise<{
  words: JpVocabWord[];
  refs: Record<string, JpVocabRef>;
}> {
  const [words, refs] = await Promise.all([
    listJpVocabWords(db),
    listJpVocabRefs(db),
  ]);
  return { words, refs: refsRecord(refs) };
}

/** 增量同步：仅返回 updated_at 晚于 since 的词条（轻量轮询用） */
export async function listJpVocabWordsChangedSince(
  db: D1Database,
  since: string
): Promise<JpVocabWord[]> {
  const marker = since.trim();
  if (!marker) return [];

  await ensureVocabWordSchema(db);

  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devWords
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

export async function existsJpVocabWordByLemma(
  db: D1Database,
  word: string,
  kind?: JpVocabKind
): Promise<boolean> {
  const target = (word || "").trim();
  if (!target) return false;

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (jpVocabDbState.devStoreEnabled) {
    const normalizedTarget = target.toLowerCase();
    return jpVocabDbState.devWords.some((item) => {
      if ((item.word || "").trim().toLowerCase() !== normalizedTarget) return false;
      return kind ? item.kind === kind : true;
    });
  }

  const result = kind
    ? await db
        .prepare(
          `SELECT id FROM jp_vocab_word
           WHERE LOWER(TRIM(word)) = LOWER(?1)
             AND kind = ?2
           LIMIT 1`
        )
        .bind(target, kind)
        .first<{ id: number }>()
    : await db
        .prepare(
          `SELECT id FROM jp_vocab_word
           WHERE LOWER(TRIM(word)) = LOWER(?1)
           LIMIT 1`
        )
        .bind(target)
        .first<{ id: number }>();

  return Boolean(result?.id);
}

export type DeleteJpVocabWordsResult =
  | {
      ok: true;
      deleted: number;
      words: JpVocabWord[];
      display_order: JpVocabDailyDisplayOrder;
    }
  | { ok: false; error: string };

/** 管理员删除词条（按 id） */
/**
 * 删词前清子表。D1 上仅靠 ON DELETE CASCADE 常会报
 * FOREIGN KEY constraint failed（词条已共享/带读/复习时尤甚）。
 */
export async function deleteJpVocabWordDependentRows(
  db: D1Database,
  ids: number[]
): Promise<void> {
  if (!ids.length) return;

  await ensureJpVocabSharedSchema(db);
  await ensureJpVocabReviewDoneSchema(db);
  await ensureJpVocabCoachSchema(db);

  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  await db.batch([
    db
      .prepare(`DELETE FROM jp_vocab_shared WHERE word_id IN (${placeholders})`)
      .bind(...ids),
    db
      .prepare(
        `DELETE FROM jp_vocab_review_done WHERE word_id IN (${placeholders})`
      )
      .bind(...ids),
    db
      .prepare(
        `DELETE FROM jp_vocab_coach_item WHERE word_id IN (${placeholders})`
      )
      .bind(...ids),
  ]);
  invalidateJpVocabSharedTodayCache();
}

export async function clearJpVocabTeacherQuizLiveIfDeleted(
  db: D1Database,
  deletedIds: Set<number>
): Promise<void> {
  if (!deletedIds.size) return;
  const live = await getJpVocabTeacherQuizLive(db);
  if (live.word_id != null && deletedIds.has(live.word_id)) {
    await setJpVocabTeacherQuizLiveWord(db, null);
  }
}

export async function deleteJpVocabWordsByIds(
  db: D1Database,
  wordIds: number[]
): Promise<DeleteJpVocabWordsResult> {
  const ids = [
    ...new Set(
      wordIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  if (!ids.length) {
    return { ok: false, error: "word_ids_empty" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  await ensureJpVocabSharedSchema(db);
  const idSet = new Set(ids);

  if (jpVocabDbState.devStoreEnabled) {
    let deleted = 0;
    for (let i = jpVocabDbState.devWords.length - 1; i >= 0; i--) {
      if (idSet.has(jpVocabDbState.devWords[i].id)) {
        jpVocabDbState.devWords.splice(i, 1);
        deleted++;
      }
    }
    for (let i = jpVocabDbState.devShared.length - 1; i >= 0; i--) {
      if (idSet.has(jpVocabDbState.devShared[i].word_id)) {
        jpVocabDbState.devShared.splice(i, 1);
      }
    }
    if (deleted === 0) {
      return { ok: false, error: "not_found" };
    }
    invalidateJpVocabSharedTodayCache();
    await clearJpVocabTeacherQuizLiveIfDeleted(db, idSet);
    await pruneJpVocabQuizPriorityBoostForDeletedWords(db, idSet);
    const words = [...jpVocabDbState.devWords];
    let display_order = await ensureJpVocabDailyDisplayOrder(db, words);
    const validIds = new Set(words.map((w) => w.id));
    const nextIds = display_order.ids.filter((id) => validIds.has(id));
    const round_checked_ids = (display_order.round_checked_ids ?? []).filter((id) =>
      validIds.has(id)
    );
    if (
      nextIds.length !== display_order.ids.length ||
      round_checked_ids.length !== (display_order.round_checked_ids ?? []).length
    ) {
      display_order = { ...display_order, ids: nextIds, round_checked_ids };
      await saveJpVocabDailyDisplayOrder(db, display_order);
    }
    return { ok: true, deleted, words, display_order };
  }

  await deleteJpVocabWordDependentRows(db, ids);

  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(`DELETE FROM jp_vocab_word WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();

  const deleted = Number(result.meta?.changes ?? 0);
  if (deleted === 0) {
    return { ok: false, error: "not_found" };
  }

  await clearJpVocabTeacherQuizLiveIfDeleted(db, idSet);
  await pruneJpVocabQuizPriorityBoostForDeletedWords(db, idSet);

  const words = await listJpVocabWords(db);
  let display_order = await ensureJpVocabDailyDisplayOrder(db, words);
  const validIds = new Set(words.map((w) => w.id));
  const nextIds = display_order.ids.filter((id) => validIds.has(id));
  const round_checked_ids = (display_order.round_checked_ids ?? []).filter((id) =>
    validIds.has(id)
  );
  if (
    nextIds.length !== display_order.ids.length ||
    round_checked_ids.length !== (display_order.round_checked_ids ?? []).length
  ) {
    display_order = { ...display_order, ids: nextIds, round_checked_ids };
    await saveJpVocabDailyDisplayOrder(db, display_order);
  }

  // 今日抽查池里若仍挂着已删 id，重算落库，避免老师端继续操作幽灵词条
  const visible = await getJpVocabTeacherVisibleLimit(db);
  const prunedVisible = materializeJpVocabTeacherVisibleLimit(
    visible,
    display_order,
    words
  );
  if (teacherVisibleLimitNeedsPersist(visible, prunedVisible)) {
    await saveJpVocabTeacherVisibleLimit(db, prunedVisible);
  }

  return { ok: true, deleted, words, display_order };
}

export type ResetJpVocabReviewsResult =
  | {
      ok: true;
      words: JpVocabWord[];
      display_order: JpVocabDailyDisplayOrder;
      teacher_visible_limit: JpVocabTeacherVisibleLimit;
    }
  | { ok: false; error: string };

/**
 * 管理员重置时必须清共享：否则学生端仍见旧共享，且与「从未抽查」矛盾。
 * （英语还会用今日共享锁死熟悉程度勾选。）
 */
export async function clearJpVocabSharedOnReset(
  db: D1Database,
  scope: "today" | "all"
): Promise<void> {
  await ensureJpVocabSharedSchema(db);
  const today = beijingDateString();
  if (jpVocabDbState.devStoreEnabled) {
    if (scope === "all") {
      jpVocabDbState.devShared.length = 0;
    } else {
      for (let i = jpVocabDbState.devShared.length - 1; i >= 0; i--) {
        if (jpVocabDbState.devShared[i].share_date === today) {
          jpVocabDbState.devShared.splice(i, 1);
        }
      }
    }
    invalidateJpVocabSharedTodayCache();
    await setJpVocabTeacherQuizLiveWord(db, null);
    return;
  }
  if (scope === "all") {
    await db.prepare(`DELETE FROM jp_vocab_shared`).run();
  } else {
    await db
      .prepare(`DELETE FROM jp_vocab_shared WHERE share_date = ?1`)
      .bind(today)
      .run();
  }
  invalidateJpVocabSharedTodayCache();
  await setJpVocabTeacherQuizLiveWord(db, null);
}

export async function resetAllJpVocabReviews(
  db: D1Database
): Promise<ResetJpVocabReviewsResult> {
  await seedIfEmpty(db);
  const ts = nowIso();

  if (jpVocabDbState.devStoreEnabled) {
    for (let i = 0; i < jpVocabDbState.devWords.length; i++) {
      jpVocabDbState.devWords[i] = {
        ...jpVocabDbState.devWords[i],
        cnt_very: 0,
        cnt_normal: 0,
        cnt_weak: 0,
        today_check_count: 0,
        today_check_date: null,
        last_review_level: null,
        last_review_at: null,
        srs_interval_days: 0,
        srs_due_date: null,
        updated_at: ts,
      };
    }
    await clearJpVocabSharedOnReset(db, "all");
    const words = sortJpVocabWords(jpVocabDbState.devWords);
    jpVocabDbState.devDailyDisplayOrder = await refreshJpVocabDailyDisplayOrder(db, words);
    const teacher_visible_limit = await getJpVocabTeacherVisibleLimit(db);
    return { ok: true, words, display_order: jpVocabDbState.devDailyDisplayOrder, teacher_visible_limit };
  }

  await db
    .prepare(
      `UPDATE jp_vocab_word
       SET cnt_very = 0, cnt_normal = 0, cnt_weak = 0,
           today_check_count = 0, today_check_date = NULL,
           last_review_level = NULL, last_review_at = NULL,
           srs_interval_days = 0, srs_due_date = NULL,
           updated_at = ?1`
    )
    .bind(ts)
    .run();

  await clearJpVocabSharedOnReset(db, "all");

  const words = await listJpVocabWords(db);
  const display_order = await refreshJpVocabDailyDisplayOrder(db, words);
  const teacher_visible_limit = await getJpVocabTeacherVisibleLimit(db);
  return { ok: true, words, display_order, teacher_visible_limit };
}

export async function resetTodayJpVocabRound(
  db: D1Database
): Promise<ResetJpVocabReviewsResult> {
  await seedIfEmpty(db);
  await clearJpVocabSharedOnReset(db, "today");
  const words = await listJpVocabWords(db);
  const display_order = await refreshJpVocabDailyDisplayOrder(db, words);
  const raw = await readJpVocabTeacherVisibleLimitRaw(db);
  const today = beijingDateString();
  const current = normalizeJpVocabTeacherVisibleLimit(raw);
  const teacher_visible_limit = await saveJpVocabTeacherVisibleLimit(
    db,
    applyJpVocabQuizTargetVisiblePlan(
      {
        ...current,
        date: today,
        quiz_target: current.quiz_target,
      },
      display_order,
      words
    )
  );
  return { ok: true, words, display_order, teacher_visible_limit };
}

export type UploadJpVocabWordsResult =
  | { ok: true; added: number; skipped: number; total: number }
  | { ok: false; error: string };

export async function uploadJpVocabWords(
  db: D1Database,
  words: JpVocabUploadInput[],
  replace = false,
  refs: JpVocabRefUploadInput[] = []
): Promise<UploadJpVocabWordsResult> {
  const cleaned: Array<{
    word: string;
    reading: string | null;
    meaning: string | null;
    kind: JpVocabKind;
    ref_key: string | null;
    annotation: string | null;
  }> = [];
  for (const w of words) {
    const word = normalizeWord(w.word);
    if (!word) continue;
    const kind = normalizeKind(w.kind);
    const annotationParsed = parseJpVocabAnnotationInput(w.annotation);
    if (!annotationParsed.ok) {
      return { ok: false, error: "invalid_annotation" };
    }
    cleaned.push({
      word,
      reading: await resolveJpVocabReadingIfMissing(
        word,
        kind,
        (w.reading || "").trim() || null
      ),
      meaning: (w.meaning || "").trim() || null,
      kind,
      ref_key: w.ref_key ? normalizeJpVocabRefKey(w.ref_key) || null : null,
      annotation: annotationParsed.value,
    });
  }

  if (!cleaned.length) {
    return { ok: false, error: "words_empty" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  const ts = nowIso();

  if (refs.length) {
    await upsertJpVocabRefMetadata(db, refs);
  }

  if (jpVocabDbState.devStoreEnabled) {
    if (replace) {
      jpVocabDbState.devWords.length = 0;
      jpVocabDbState.devNextId = 1;
    }
    let added = 0;
    let skipped = 0;
    for (const item of cleaned) {
      const exists = jpVocabDbState.devWords.some((w) => w.word === item.word);
      if (exists && !replace) {
        skipped++;
        continue;
      }
      jpVocabDbState.devWords.push({
        id: jpVocabDbState.devNextId++,
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
        annotation: item.annotation,
        created_at: ts,
        updated_at: ts,
      });
      added++;
    }
    return { ok: true, added, skipped, total: jpVocabDbState.devWords.length };
  }

  if (replace) {
    // 全量替换：先清子表，再删词（勿只 DELETE jp_vocab_word，D1 外键会炸）
    await ensureJpVocabSharedSchema(db);
    await ensureJpVocabReviewDoneSchema(db);
    await ensureJpVocabCoachSchema(db);
    await db.batch([
      db.prepare("DELETE FROM jp_vocab_shared"),
      db.prepare("DELETE FROM jp_vocab_review_done"),
      db.prepare("DELETE FROM jp_vocab_coach_item"),
      db.prepare("DELETE FROM jp_vocab_word"),
    ]);
    invalidateJpVocabSharedTodayCache();
  }

  let added = 0;
  let skipped = 0;
  const existing = replace
    ? new Set<string>()
    : new Set(
        (
          await db
            .prepare("SELECT word FROM jp_vocab_word")
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
          `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, annotation, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, NULL, NULL, ?6, ?7, ?7)`
        )
        .bind(
          item.word,
          item.reading,
          item.meaning,
          item.kind,
          item.ref_key,
          item.annotation,
          ts
        )
    );
    added++;
  }

  if (inserts.length) {
    await db.batch(inserts);
  }

  const totalRow = await db
    .prepare("SELECT COUNT(*) AS c FROM jp_vocab_word")
    .first<{ c: number }>();

  return {
    ok: true,
    added,
    skipped,
    total: totalRow?.c ?? 0,
  };
}

export type AddJpVocabWordResult =
  | { ok: true; word: JpVocabWord }
  | { ok: false; error: string };

export async function addJpVocabWord(
  db: D1Database,
  input: JpVocabUploadInput
): Promise<AddJpVocabWordResult> {
  const lemma = normalizeJpVocabNaAdjStoredEntry(
    input.word,
    (input.reading || "").trim() || null
  );
  const word = lemma.word;
  if (!word) return { ok: false, error: "word_required" };

  const kind = normalizeKind(input.kind);
  const exampleSentences = (input.example_sentences || "").trim() || null;
  const meaning = (input.meaning || "").trim() || null;
  const item = {
    word,
    reading: await resolveJpVocabReadingIfMissing(
      word,
      kind,
      lemma.reading
    ),
    meaning,
    meaning_source: meaning ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL : null,
    kind,
    ref_key: input.ref_key
      ? normalizeJpVocabRefKey(input.ref_key) || null
      : null,
    class_notes: (input.class_notes || "").trim() || null,
    example_sentences: exampleSentences,
    example_sentences_source: exampleSentences
      ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
      : null,
  };

  await seedIfEmpty(db);
  // 入库标记用北京时间，供「今日新词次日置顶」判断（created_at 前 10 位）
  const ts = beijingDateTimeString();

  if (jpVocabDbState.devStoreEnabled) {
    if (jpVocabDbState.devWords.some((w) => w.word === item.word)) {
      return { ok: false, error: "word_duplicate" };
    }
    const created: JpVocabWord = {
      id: jpVocabDbState.devNextId++,
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
      example_sentences: item.example_sentences,
      example_sentences_source: item.example_sentences_source,
      meaning_source: item.meaning_source,
      created_at: ts,
      updated_at: ts,
    };
    jpVocabDbState.devWords.push(created);
    const today = beijingDateString();
    if (
      !jpVocabDbState.devDailyDisplayOrder.ids.length ||
      jpVocabDbState.devDailyDisplayOrder.date !== today
    ) {
      jpVocabDbState.devDailyDisplayOrder = await ensureJpVocabDailyDisplayOrder(db, jpVocabDbState.devWords);
    } else {
      jpVocabDbState.devDailyDisplayOrder = appendJpVocabDailyDisplayOrderId(
        jpVocabDbState.devDailyDisplayOrder,
        created.id
      );
    }
    return { ok: true, word: created };
  }

  const existing = await db
    .prepare("SELECT id FROM jp_vocab_word WHERE word = ?1 LIMIT 1")
    .bind(item.word)
    .first<{ id: number }>();

  if (existing) return { ok: false, error: "word_duplicate" };

  const insertResult = await db
    .prepare(
      `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, example_sentences, example_sentences_source, meaning_source, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, NULL, ?6, ?7, ?8, ?9, ?10, ?10)`
    )
    .bind(
      item.word,
      item.reading,
      item.meaning,
      item.kind,
      item.ref_key,
      item.class_notes,
      item.example_sentences,
      item.example_sentences_source,
      item.meaning_source,
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
  await appendJpVocabWordToDailyDisplayOrder(db, created.id);
  return { ok: true, word: created };
}

/** 按图片内容 hash 去重：相同字节共用 ref_key，已存在则跳过上传 */
export async function getOrUploadJpVocabRefByContent(
  env: CloudflareEnv,
  db: D1Database,
  bytes: ArrayBuffer,
  mediaType: JpVocabMediaType,
  title: string | null
): Promise<{ ref: JpVocabRef; deduped: boolean }> {
  const refKey = await jpVocabRefKeyFromBytes(bytes);
  const existing = await getJpVocabRef(db, refKey);

  if (existing) {
    const hasFile = await jpVocabRefFileExists(
      env,
      refKey,
      existing.media_type,
      existing.r2_key
    );
    if (hasFile) {
      return { ref: existing, deduped: true };
    }
  }

  const stored = await putJpVocabRefFile(env, refKey, mediaType, bytes);
  const ref = await saveJpVocabRefFileMeta(
    db,
    refKey,
    title,
    mediaType,
    stored.r2_key
  );
  return { ref, deduped: false };
}

/** 新课标记完成时：仅写入尚不存在的词条（已存在则跳过）并带上教案 ref_key */
