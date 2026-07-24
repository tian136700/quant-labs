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


const SEED_WORDS: EnVocabUploadInput[] = [
  {
    word: "however",
    reading: "/haʊˈevər/",
    meaning: "然而；不过",
    kind: "word",
  },
  {
    word: "Present Perfect",
    meaning: "现在完成时",
    kind: "grammar",
    ref_key: "demo-lesson-grammar",
  },
  {
    word: "look forward to",
    reading: "/lʊk ˈfɔːrwərd tuː/",
    meaning: "期待；盼望",
    kind: "word",
  },
];

export const SEED_REFS: EnVocabRefUploadInput[] = [
  {
    ref_key: "demo-lesson-grammar",
    title: "Present Perfect 用法",
    media_type: "image",
  },
];

export function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function normalizeWord(raw: string): string {
  return (raw || "").trim();
}

export function normalizeKind(raw?: EnVocabKind | null): EnVocabKind {
  return raw === "grammar" ? "grammar" : "word";
}

export function normalizeMediaType(raw?: EnVocabMediaType | null): EnVocabMediaType {
  return raw === "pdf" ? "pdf" : "image";
}

export function mapRefRow(row: Record<string, unknown>): EnVocabRef {
  return {
    ref_key: String(row.ref_key),
    title: row.title != null ? String(row.title) : null,
    media_type: row.media_type === "pdf" ? "pdf" : "image",
    r2_key: String(row.r2_key),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapRow(row: Record<string, unknown>): EnVocabWord {
  const todayCheckDate =
    row.today_check_date != null ? String(row.today_check_date) : null;
  return {
    id: Number(row.id),
    word: String(row.word),
    reading: row.reading != null ? String(row.reading) : null,
    reading_source:
      row.reading_source != null && String(row.reading_source).trim()
        ? String(row.reading_source).trim()
        : null,
    meaning: row.meaning != null ? String(row.meaning) : null,
    meaning_source:
      row.meaning_source != null && String(row.meaning_source).trim()
        ? String(row.meaning_source).trim()
        : null,
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
    usage:
      row.usage != null && String(row.usage).trim()
        ? String(row.usage)
        : null,
    usage_source:
      row.usage_source != null && String(row.usage_source).trim()
        ? String(row.usage_source).trim()
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
    last_review_level:
      row.last_review_level === "very" ||
      row.last_review_level === "normal" ||
      row.last_review_level === "weak"
        ? row.last_review_level
        : null,
    last_review_at:
      row.last_review_at != null ? String(row.last_review_at) : null,
    last_usage_levels:
      row.last_usage_levels != null && String(row.last_usage_levels).trim()
        ? String(row.last_usage_levels)
        : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function isSqliteDuplicateColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate column name/i.test(msg);
}

/** D1 多 isolate 并发 ALTER 时吞掉 duplicate column，避免 schemaReady 永远起不来 */
export async function addEnVocabWordColumnIfMissing(
  db: D1Database,
  cols: Set<string>,
  name: string,
  sqlType: string
): Promise<void> {
  if (cols.has(name)) return;
  try {
    await db
      .prepare(`ALTER TABLE en_vocab_word ADD COLUMN ${name} ${sqlType}`)
      .run();
    cols.add(name);
  } catch (err) {
    if (isSqliteDuplicateColumnError(err)) {
      cols.add(name);
      return;
    }
    throw err;
  }
}

export async function ensureVocabWordSchema(db: D1Database): Promise<void> {
  if (enVocabDbState.devStoreEnabled) return;
  if (
    enVocabDbState.vocabWordSchemaReady &&
    enVocabDbState.vocabWordSchemaVersion >= EN_VOCAB_WORD_SCHEMA_VERSION
  ) {
    return;
  }
  const info = await db
    .prepare(`PRAGMA table_info(en_vocab_word)`)
    .all<{ name: string }>();
  const cols = new Set((info.results ?? []).map((row) => row.name));
  await addEnVocabWordColumnIfMissing(
    db,
    cols,
    "today_check_count",
    "INTEGER NOT NULL DEFAULT 0"
  );
  await addEnVocabWordColumnIfMissing(db, cols, "today_check_date", "TEXT");
  await addEnVocabWordColumnIfMissing(db, cols, "pos", "TEXT");
  await addEnVocabWordColumnIfMissing(db, cols, "last_review_level", "TEXT");
  await addEnVocabWordColumnIfMissing(db, cols, "last_review_at", "TEXT");
  await addEnVocabWordColumnIfMissing(db, cols, "reading_source", "TEXT");
  await addEnVocabWordColumnIfMissing(db, cols, "meaning_source", "TEXT");
  await addEnVocabWordColumnIfMissing(db, cols, "example_sentences", "TEXT");
  await addEnVocabWordColumnIfMissing(
    db,
    cols,
    "example_sentences_source",
    "TEXT"
  );
  await addEnVocabWordColumnIfMissing(db, cols, "mnemonic", "TEXT");
  await addEnVocabWordColumnIfMissing(db, cols, "usage", "TEXT");
  await addEnVocabWordColumnIfMissing(db, cols, "usage_source", "TEXT");
  await addEnVocabWordColumnIfMissing(db, cols, "last_usage_levels", "TEXT");
  enVocabDbState.vocabWordSchemaVersion = EN_VOCAB_WORD_SCHEMA_VERSION;
  enVocabDbState.vocabWordSchemaReady = true;
}

/** 供 fill-* 等轻量入口在写库前确保列存在 */
export async function ensureEnVocabWordSchema(db: D1Database): Promise<void> {
  await ensureVocabWordSchema(db);
}

export function mapSharedListWordRow(row: Record<string, unknown>): EnVocabWord {
  const word = mapRow({ ...row, class_notes: null });
  return {
    ...word,
    class_notes: null,
    class_notes_present: Boolean(Number(row.has_class_notes)),
  };
}

export async function listEnVocabRefsByKeys(
  db: D1Database,
  keys: string[]
): Promise<EnVocabRef[]> {
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (!unique.length) return [];
  if (enVocabDbState.devStoreEnabled) {
    return unique
      .map((k) => enVocabDbState.devRefs.get(k))
      .filter((r): r is EnVocabRef => r != null);
  }
  const placeholders = unique.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM en_vocab_ref
       WHERE ref_key IN (${placeholders})
       ORDER BY ref_key ASC`
    )
    .bind(...unique)
    .all<Record<string, unknown>>();
  return (result.results || []).map(mapRefRow);
}

export const WORD_SELECT = `SELECT id, word, reading, reading_source, meaning, meaning_source, pos, kind, ref_key,
  cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, mnemonic,
  usage, usage_source, example_sentences, example_sentences_source,
  last_review_level, last_review_at, last_usage_levels, created_at, updated_at FROM en_vocab_word`;

export function refsRecord(refs: EnVocabRef[]): Record<string, EnVocabRef> {
  return Object.fromEntries(refs.map((r) => [r.ref_key, r]));
}

export async function upsertRefMetadataDev(
  item: EnVocabRefUploadInput,
  ts: string
): Promise<EnVocabRef | null> {
  const refKey = normalizeEnVocabRefKey(item.ref_key);
  if (!refKey) return null;

  const mediaType = normalizeMediaType(item.media_type);
  const existing = enVocabDbState.devRefs.get(refKey);
  const ref: EnVocabRef = {
    ref_key: refKey,
    title: (item.title || "").trim() || existing?.title || null,
    media_type: mediaType,
    r2_key: existing?.r2_key || enVocabRefLocalMarker(refKey),
    created_at: existing?.created_at || ts,
    updated_at: ts,
  };
  enVocabDbState.devRefs.set(refKey, ref);
  return ref;
}

export async function upsertRefMetadataDb(
  db: D1Database,
  item: EnVocabRefUploadInput,
  ts: string
): Promise<void> {
  const refKey = normalizeEnVocabRefKey(item.ref_key);
  if (!refKey) return;

  const mediaType = normalizeMediaType(item.media_type);
  const title = (item.title || "").trim() || null;

  await db
    .prepare(
      `INSERT INTO en_vocab_ref (ref_key, title, media_type, r2_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(ref_key) DO UPDATE SET
         title = COALESCE(excluded.title, en_vocab_ref.title),
         media_type = excluded.media_type,
         updated_at = excluded.updated_at`
    )
    .bind(refKey, title, mediaType, enVocabRefLocalMarker(refKey), ts)
    .run();
}

export async function upsertEnVocabRefMetadata(
  db: D1Database,
  refs: EnVocabRefUploadInput[]
): Promise<void> {
  const cleaned = refs
    .map((r) => ({
      ref_key: normalizeEnVocabRefKey(r.ref_key),
      title: (r.title || "").trim() || null,
      media_type: normalizeMediaType(r.media_type),
    }))
    .filter((r) => r.ref_key);

  if (!cleaned.length) return;

  const ts = nowIso();

  if (enVocabDbState.devStoreEnabled) {
    for (const item of cleaned) {
      await upsertRefMetadataDev(item, ts);
    }
    return;
  }

  for (const item of cleaned) {
    await upsertRefMetadataDb(db, item, ts);
  }
}

export async function saveEnVocabRefFileMeta(
  db: D1Database,
  refKey: string,
  title: string | null,
  mediaType: EnVocabMediaType,
  r2Key: string
): Promise<EnVocabRef> {
  const key = normalizeEnVocabRefKey(refKey);
  if (!key) throw new Error("ref_key_invalid");

  const ts = nowIso();

  if (enVocabDbState.devStoreEnabled) {
    const existing = enVocabDbState.devRefs.get(key);
    const ref: EnVocabRef = {
      ref_key: key,
      title: title || existing?.title || null,
      media_type: mediaType,
      r2_key: r2Key,
      created_at: existing?.created_at || ts,
      updated_at: ts,
    };
    enVocabDbState.devRefs.set(key, ref);
    return ref;
  }

  await db
    .prepare(
      `INSERT INTO en_vocab_ref (ref_key, title, media_type, r2_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(ref_key) DO UPDATE SET
         title = COALESCE(excluded.title, en_vocab_ref.title),
         media_type = excluded.media_type,
         r2_key = excluded.r2_key,
         updated_at = excluded.updated_at`
    )
    .bind(key, title, mediaType, r2Key, ts)
    .run();

  const row = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM en_vocab_ref WHERE ref_key = ?1`
    )
    .bind(key)
    .first<Record<string, unknown>>();

  if (!row) throw new Error("ref_save_failed");
  return mapRefRow(row);
}

export async function getEnVocabRef(
  db: D1Database,
  refKey: string
): Promise<EnVocabRef | null> {
  const key = normalizeEnVocabRefKey(refKey);
  if (!key) return null;

  if (enVocabDbState.devStoreEnabled) {
    return enVocabDbState.devRefs.get(key) ?? null;
  }

  const row = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM en_vocab_ref WHERE ref_key = ?1`
    )
    .bind(key)
    .first<Record<string, unknown>>();

  return row ? mapRefRow(row) : null;
}

export async function listEnVocabRefs(db: D1Database): Promise<EnVocabRef[]> {
  if (enVocabDbState.devStoreEnabled) {
    return [...enVocabDbState.devRefs.values()].sort((a, b) =>
      a.ref_key.localeCompare(b.ref_key)
    );
  }

  const result = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM en_vocab_ref ORDER BY ref_key ASC`
    )
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRefRow);
}

export async function seedIfEmpty(db: D1Database): Promise<void> {
  if (enVocabDbState.devStoreEnabled) {
    if (enVocabDbState.devSeeded || enVocabDbState.devWords.length > 0) return;
    const ts = nowIso();
    for (const item of SEED_REFS) {
      await upsertRefMetadataDev(item, ts);
    }
    for (const item of SEED_WORDS) {
      enVocabDbState.devWords.push({
        id: enVocabDbState.devNextId++,
        word: item.word,
        reading: item.reading?.trim() || null,
        meaning: item.meaning?.trim() || null,
        pos: null,
        kind: normalizeKind(item.kind),
        ref_key: item.ref_key
          ? normalizeEnVocabRefKey(item.ref_key) || null
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
    enVocabDbState.devSeeded = true;
    return;
  }

  const countRow = await db
    .prepare("SELECT COUNT(*) AS c FROM en_vocab_word")
    .first<{ c: number }>();
  if ((countRow?.c ?? 0) > 0) return;

  const ts = nowIso();
  await upsertEnVocabRefMetadata(db, SEED_REFS);

  const stmts = SEED_WORDS.map((item) =>
    db
      .prepare(
        `INSERT INTO en_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, NULL, NULL, ?6, ?6)`
      )
      .bind(
        item.word,
        item.reading?.trim() || null,
        item.meaning?.trim() || null,
        normalizeKind(item.kind),
        item.ref_key ? normalizeEnVocabRefKey(item.ref_key) || null : null,
        ts
      )
  );
  await db.batch(stmts);
}

