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
import { normalizeJpVocabAnnotation } from "@/lib/jp-vocab-annotation";
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


const SEED_WORDS: JpVocabUploadInput[] = [
  {
    word: "～ばかり",
    meaning: "（刚刚，只是……）",
    kind: "grammar",
    ref_key: "demo-lesson3-grammar",
    example_sentences: "遊んでばかりいます。\n今来たばかりです。",
  },
  {
    word: "～ようになる",
    meaning: "（变得能够……）",
    kind: "grammar",
    ref_key: "demo-lesson3-grammar",
    example_sentences: "日本語が話せるようになりました。\n毎日早く起きるようになりました。",
  },
  {
    word: "～に来る",
    meaning: "（来……做……）",
    kind: "grammar",
    ref_key: "demo-lesson3-grammar",
    example_sentences: "ご飯を食べに来ます。\n買い物に来ました。",
  },
];

export const SEED_REFS: JpVocabRefUploadInput[] = [
  {
    ref_key: "demo-lesson3-grammar",
    title: "3つの大切な文法",
    media_type: "image",
  },
];

export function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** trim + な形容词尾「だ」剥成词干（重要だ→重要）；读音请配 normalizeJpVocabNaAdjStoredEntry */
export function normalizeWord(raw: string): string {
  return normalizeJpVocabNaAdjStoredEntry(raw || "", null).word;
}

export function normalizeKind(raw?: JpVocabKind | null): JpVocabKind {
  return raw === "grammar" ? "grammar" : "word";
}

export function normalizeMediaType(raw?: JpVocabMediaType | null): JpVocabMediaType {
  return raw === "pdf" ? "pdf" : "image";
}

export function mapRefRow(row: Record<string, unknown>): JpVocabRef {
  return {
    ref_key: String(row.ref_key),
    title: row.title != null ? String(row.title) : null,
    media_type: row.media_type === "pdf" ? "pdf" : "image",
    r2_key: String(row.r2_key),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapRow(row: Record<string, unknown>): JpVocabWord {
  const todayCheckDate =
    row.today_check_date != null ? String(row.today_check_date) : null;
  return {
    id: Number(row.id),
    word: String(row.word),
    reading: row.reading != null ? String(row.reading) : null,
    meaning: row.meaning != null ? String(row.meaning) : null,
    pos:
      row.pos != null && String(row.pos).trim() ? String(row.pos) : null,
    kind: row.kind === "grammar" ? "grammar" : "word",
    ref_key: row.ref_key != null ? String(row.ref_key) : null,
    cnt_very: Number(row.cnt_very) || 0,
    cnt_normal: Number(row.cnt_normal) || 0,
    cnt_weak: Number(row.cnt_weak) || 0,
    today_check_count: effectiveTodayCheckCount(
      Number(row.today_check_count) || 0,
      todayCheckDate
    ),
    today_check_date: todayCheckDate,
    class_notes:
      row.class_notes != null && String(row.class_notes).trim()
        ? String(row.class_notes)
        : null,
    mnemonic:
      row.mnemonic != null && String(row.mnemonic).trim()
        ? String(row.mnemonic)
        : null,
    annotation: normalizeJpVocabAnnotation(
      row.annotation != null ? String(row.annotation) : null
    ),
    course_label:
      row.course_label != null && String(row.course_label).trim()
        ? String(row.course_label).trim().slice(0, 120)
        : null,
    example_sentences:
      row.example_sentences != null && String(row.example_sentences).trim()
        ? String(row.example_sentences)
        : null,
    example_sentences_source:
      row.example_sentences_source != null &&
      String(row.example_sentences_source).trim()
        ? String(row.example_sentences_source).trim()
        : null,
    meaning_source:
      row.meaning_source != null && String(row.meaning_source).trim()
        ? String(row.meaning_source).trim()
        : null,
    pos_source:
      row.pos_source != null && String(row.pos_source).trim()
        ? String(row.pos_source).trim()
        : null,
    usage:
      row.usage != null && String(row.usage).trim()
        ? String(row.usage)
        : null,
    usage_source:
      row.usage_source != null && String(row.usage_source).trim()
        ? String(row.usage_source).trim()
        : null,
    connection:
      row.connection != null && String(row.connection).trim()
        ? String(row.connection)
        : null,
    connection_source:
      row.connection_source != null && String(row.connection_source).trim()
        ? String(row.connection_source).trim()
        : null,
    last_review_level:
      row.last_review_level === "very" ||
      row.last_review_level === "normal" ||
      row.last_review_level === "weak"
        ? row.last_review_level
        : null,
    last_review_at:
      row.last_review_at != null ? String(row.last_review_at) : null,
    srs_interval_days: Math.max(0, Math.floor(Number(row.srs_interval_days) || 0)),
    srs_due_date:
      row.srs_due_date != null && /^\d{4}-\d{2}-\d{2}$/.test(String(row.srs_due_date).trim())
        ? String(row.srs_due_date).trim()
        : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function ensureVocabWordSchema(db: D1Database): Promise<void> {
  if (jpVocabDbState.devStoreEnabled || jpVocabDbState.vocabWordSchemaReady) return;
  const info = await db
    .prepare(`PRAGMA table_info(jp_vocab_word)`)
    .all<{ name: string }>();
  const cols = new Set((info.results ?? []).map((row) => row.name));
  if (!cols.has("today_check_count")) {
    await db
      .prepare(
        `ALTER TABLE jp_vocab_word ADD COLUMN today_check_count INTEGER NOT NULL DEFAULT 0`
      )
      .run();
  }
  if (!cols.has("today_check_date")) {
    await db
      .prepare(`ALTER TABLE jp_vocab_word ADD COLUMN today_check_date TEXT`)
      .run();
  }
  if (!cols.has("pos")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN pos TEXT`).run();
  }
  if (!cols.has("last_review_level")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN last_review_level TEXT`).run();
  }
  if (!cols.has("last_review_at")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN last_review_at TEXT`).run();
  }
  if (!cols.has("mnemonic")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN mnemonic TEXT`).run();
  }
  if (!cols.has("example_sentences")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN example_sentences TEXT`).run();
  }
  if (!cols.has("example_sentences_source")) {
    await db
      .prepare(`ALTER TABLE jp_vocab_word ADD COLUMN example_sentences_source TEXT`)
      .run();
  }
  if (!cols.has("meaning_source")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN meaning_source TEXT`).run();
  }
  if (!cols.has("pos_source")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN pos_source TEXT`).run();
  }
  if (!cols.has("usage")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN usage TEXT`).run();
  }
  if (!cols.has("usage_source")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN usage_source TEXT`).run();
  }
  if (!cols.has("connection")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN connection TEXT`).run();
  }
  if (!cols.has("connection_source")) {
    await db
      .prepare(`ALTER TABLE jp_vocab_word ADD COLUMN connection_source TEXT`)
      .run();
  }
  if (!cols.has("srs_interval_days")) {
    await db
      .prepare(
        `ALTER TABLE jp_vocab_word ADD COLUMN srs_interval_days INTEGER NOT NULL DEFAULT 0`
      )
      .run();
  }
  if (!cols.has("srs_due_date")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN srs_due_date TEXT`).run();
  }
  if (!cols.has("annotation")) {
    try {
      await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN annotation TEXT`).run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column name/i.test(msg)) throw err;
    }
  }
  if (!cols.has("course_label")) {
    try {
      await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN course_label TEXT`).run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate column name/i.test(msg)) throw err;
    }
  }
  jpVocabDbState.vocabWordSchemaReady = true;
}

/** 供 fill-example 等轻量入口在写库前确保列存在 */
export async function ensureJpVocabWordSchema(db: D1Database): Promise<void> {
  await ensureVocabWordSchema(db);
}

export const WORD_SELECT = `SELECT id, word, reading, meaning, pos, kind, ref_key,
  cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, mnemonic, annotation, course_label, example_sentences,
  example_sentences_source, meaning_source, pos_source, usage, usage_source, connection, connection_source,
  last_review_level, last_review_at, srs_interval_days, srs_due_date, created_at, updated_at FROM jp_vocab_word`;

/**
 * 可见池 / 日序 rematerialize 用：禁止扫 class_notes、例句、巧记、用法等大字段。
 * 管理员勾「非常熟悉」后若用 WORD_SELECT 全表 → 极易 Worker 1102。
 */
export const WORD_SELECT_POOL = `SELECT id, word, reading, meaning, pos, kind, ref_key,
  cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, annotation, course_label,
  last_review_level, last_review_at, srs_interval_days, srs_due_date, created_at, updated_at
  FROM jp_vocab_word`;

export function refsRecord(refs: JpVocabRef[]): Record<string, JpVocabRef> {
  return Object.fromEntries(refs.map((r) => [r.ref_key, r]));
}

export async function upsertRefMetadataDev(
  item: JpVocabRefUploadInput,
  ts: string
): Promise<JpVocabRef | null> {
  const refKey = normalizeJpVocabRefKey(item.ref_key);
  if (!refKey) return null;

  const mediaType = normalizeMediaType(item.media_type);
  const existing = jpVocabDbState.devRefs.get(refKey);
  const ref: JpVocabRef = {
    ref_key: refKey,
    title: (item.title || "").trim() || existing?.title || null,
    media_type: mediaType,
    r2_key: existing?.r2_key || jpVocabRefLocalMarker(refKey),
    created_at: existing?.created_at || ts,
    updated_at: ts,
  };
  jpVocabDbState.devRefs.set(refKey, ref);
  return ref;
}

export async function upsertRefMetadataDb(
  db: D1Database,
  item: JpVocabRefUploadInput,
  ts: string
): Promise<void> {
  const refKey = normalizeJpVocabRefKey(item.ref_key);
  if (!refKey) return;

  const mediaType = normalizeMediaType(item.media_type);
  const title = (item.title || "").trim() || null;

  await db
    .prepare(
      `INSERT INTO jp_vocab_ref (ref_key, title, media_type, r2_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(ref_key) DO UPDATE SET
         title = COALESCE(excluded.title, jp_vocab_ref.title),
         media_type = excluded.media_type,
         updated_at = excluded.updated_at`
    )
    .bind(refKey, title, mediaType, jpVocabRefLocalMarker(refKey), ts)
    .run();
}

export async function upsertJpVocabRefMetadata(
  db: D1Database,
  refs: JpVocabRefUploadInput[]
): Promise<void> {
  const cleaned = refs
    .map((r) => ({
      ref_key: normalizeJpVocabRefKey(r.ref_key),
      title: (r.title || "").trim() || null,
      media_type: normalizeMediaType(r.media_type),
    }))
    .filter((r) => r.ref_key);

  if (!cleaned.length) return;

  const ts = nowIso();

  if (jpVocabDbState.devStoreEnabled) {
    for (const item of cleaned) {
      await upsertRefMetadataDev(item, ts);
    }
    return;
  }

  for (const item of cleaned) {
    await upsertRefMetadataDb(db, item, ts);
  }
}

export async function saveJpVocabRefFileMeta(
  db: D1Database,
  refKey: string,
  title: string | null,
  mediaType: JpVocabMediaType,
  r2Key: string
): Promise<JpVocabRef> {
  const key = normalizeJpVocabRefKey(refKey);
  if (!key) throw new Error("ref_key_invalid");

  const ts = nowIso();

  if (jpVocabDbState.devStoreEnabled) {
    const existing = jpVocabDbState.devRefs.get(key);
    const ref: JpVocabRef = {
      ref_key: key,
      title: title || existing?.title || null,
      media_type: mediaType,
      r2_key: r2Key,
      created_at: existing?.created_at || ts,
      updated_at: ts,
    };
    jpVocabDbState.devRefs.set(key, ref);
    return ref;
  }

  await db
    .prepare(
      `INSERT INTO jp_vocab_ref (ref_key, title, media_type, r2_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(ref_key) DO UPDATE SET
         title = COALESCE(excluded.title, jp_vocab_ref.title),
         media_type = excluded.media_type,
         r2_key = excluded.r2_key,
         updated_at = excluded.updated_at`
    )
    .bind(key, title, mediaType, r2Key, ts)
    .run();

  const row = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM jp_vocab_ref WHERE ref_key = ?1`
    )
    .bind(key)
    .first<Record<string, unknown>>();

  if (!row) throw new Error("ref_save_failed");
  return mapRefRow(row);
}

export async function getJpVocabRef(
  db: D1Database,
  refKey: string
): Promise<JpVocabRef | null> {
  const key = normalizeJpVocabRefKey(refKey);
  if (!key) return null;

  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devRefs.get(key) ?? null;
  }

  const row = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM jp_vocab_ref WHERE ref_key = ?1`
    )
    .bind(key)
    .first<Record<string, unknown>>();

  return row ? mapRefRow(row) : null;
}

export async function listJpVocabRefs(db: D1Database): Promise<JpVocabRef[]> {
  if (jpVocabDbState.devStoreEnabled) {
    return [...jpVocabDbState.devRefs.values()].sort((a, b) =>
      a.ref_key.localeCompare(b.ref_key)
    );
  }

  const result = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM jp_vocab_ref ORDER BY ref_key ASC`
    )
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRefRow);
}

export async function listJpVocabRefsByKeys(
  db: D1Database,
  refKeys: string[]
): Promise<JpVocabRef[]> {
  const unique = [...new Set(refKeys.filter(Boolean))];
  if (!unique.length) return [];

  if (jpVocabDbState.devStoreEnabled) {
    return unique
      .map((key) => jpVocabDbState.devRefs.get(key))
      .filter((ref): ref is JpVocabRef => ref != null);
  }

  const placeholders = unique.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM jp_vocab_ref
       WHERE ref_key IN (${placeholders})
       ORDER BY ref_key ASC`
    )
    .bind(...unique)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRefRow);
}

export function mapSharedListWordRow(row: Record<string, unknown>): JpVocabWord {
  const word = mapRow({ ...row, class_notes: null });
  return {
    ...word,
    class_notes: null,
    class_notes_present: Boolean(Number(row.has_class_notes)),
  };
}

export async function seedIfEmpty(db: D1Database): Promise<void> {
  if (jpVocabDbState.devStoreEnabled) {
    if (jpVocabDbState.devSeeded || jpVocabDbState.devWords.length > 0) return;
    const ts = nowIso();
    for (const item of SEED_REFS) {
      await upsertRefMetadataDev(item, ts);
    }
    for (const item of SEED_WORDS) {
      jpVocabDbState.devWords.push({
        id: jpVocabDbState.devNextId++,
        word: item.word,
        reading: item.reading?.trim() || null,
        meaning: item.meaning?.trim() || null,
        pos: null,
        kind: normalizeKind(item.kind),
        ref_key: item.ref_key
          ? normalizeJpVocabRefKey(item.ref_key) || null
          : null,
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
    jpVocabDbState.devSeeded = true;
    return;
  }

  const countRow = await db
    .prepare("SELECT COUNT(*) AS c FROM jp_vocab_word")
    .first<{ c: number }>();
  if ((countRow?.c ?? 0) > 0) return;

  const ts = nowIso();
  await upsertJpVocabRefMetadata(db, SEED_REFS);

  const stmts = SEED_WORDS.map((item) =>
    db
      .prepare(
        `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, NULL, NULL, ?6, ?6)`
      )
      .bind(
        item.word,
        item.reading?.trim() || null,
        item.meaning?.trim() || null,
        normalizeKind(item.kind),
        item.ref_key ? normalizeJpVocabRefKey(item.ref_key) || null : null,
        ts
      )
  );
  await db.batch(stmts);
}

