import "server-only";

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
import { applyEnVocabReview } from "@/lib/en-vocab-review";
import { parseLessonContent } from "@/lib/en-lesson-shared";
import { listEnLessons } from "@/lib/en-lesson-db";
import { listEnLessonNotesByLessonId, replaceLessonNotesForItem } from "@/lib/en-lesson-note-db";
import type { EnLessonRecord } from "@/lib/types";

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

const SEED_REFS: EnVocabRefUploadInput[] = [
  {
    ref_key: "demo-lesson-grammar",
    title: "Present Perfect 用法",
    media_type: "image",
  },
];

let devStoreEnabled = false;
const devWords: EnVocabWord[] = [];
const devRefs = new Map<string, EnVocabRef>();
let devNextId = 1;
let devSeeded = false;
let vocabWordSchemaReady = false;
let devDailyQuizStyle: EnVocabDailyQuizStyle = {
  ...JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
};
let devDailyDisplayOrder: EnVocabDailyDisplayOrder = {
  date: "",
  ids: [],
  round_checked_ids: [],
};
const devShared: Array<{
  id: number;
  word_id: number;
  shared_by: string;
  shared_at: string;
  share_date: string;
}> = [];
let devSharedNextId = 1;
let enVocabSharedSchemaReady = false;

/** 学生「今日共享」列表短缓存：合并多端轮询，降低 D1 / CPU（对齐 jp-vocab） */
const EN_VOCAB_SHARED_LIST_CACHE_MS = 5_000;
let sharedTodayListCache: {
  at: number;
  date: string;
  value: { items: EnVocabSharedItem[]; refs: Record<string, EnVocabRef> };
} | null = null;
let sharedTodayListCacheGen = 0;
let sharedTodayListInflight: Promise<{
  items: EnVocabSharedItem[];
  refs: Record<string, EnVocabRef>;
}> | null = null;

function invalidateEnVocabSharedTodayCache() {
  sharedTodayListCache = null;
  sharedTodayListCacheGen += 1;
}

const JP_VOCAB_DAILY_QUIZ_STYLE_KEY = "daily_quiz_style";
const JP_VOCAB_DAILY_DISPLAY_ORDER_KEY = "daily_display_order";

export function enableEnVocabDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeWord(raw: string): string {
  return (raw || "").trim();
}

function normalizeKind(raw?: EnVocabKind | null): EnVocabKind {
  return raw === "grammar" ? "grammar" : "word";
}

function normalizeMediaType(raw?: EnVocabMediaType | null): EnVocabMediaType {
  return raw === "pdf" ? "pdf" : "image";
}

function mapRefRow(row: Record<string, unknown>): EnVocabRef {
  return {
    ref_key: String(row.ref_key),
    title: row.title != null ? String(row.title) : null,
    media_type: row.media_type === "pdf" ? "pdf" : "image",
    r2_key: String(row.r2_key),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRow(row: Record<string, unknown>): EnVocabWord {
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
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function ensureVocabWordSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled || vocabWordSchemaReady) return;
  const info = await db
    .prepare(`PRAGMA table_info(en_vocab_word)`)
    .all<{ name: string }>();
  const cols = new Set((info.results ?? []).map((row) => row.name));
  if (!cols.has("today_check_count")) {
    await db
      .prepare(
        `ALTER TABLE en_vocab_word ADD COLUMN today_check_count INTEGER NOT NULL DEFAULT 0`
      )
      .run();
  }
  if (!cols.has("today_check_date")) {
    await db
      .prepare(`ALTER TABLE en_vocab_word ADD COLUMN today_check_date TEXT`)
      .run();
  }
  if (!cols.has("pos")) {
    await db.prepare(`ALTER TABLE en_vocab_word ADD COLUMN pos TEXT`).run();
  }
  if (!cols.has("last_review_level")) {
    await db.prepare(`ALTER TABLE en_vocab_word ADD COLUMN last_review_level TEXT`).run();
  }
  if (!cols.has("last_review_at")) {
    await db.prepare(`ALTER TABLE en_vocab_word ADD COLUMN last_review_at TEXT`).run();
  }
  if (!cols.has("reading_source")) {
    await db.prepare(`ALTER TABLE en_vocab_word ADD COLUMN reading_source TEXT`).run();
  }
  if (!cols.has("meaning_source")) {
    await db.prepare(`ALTER TABLE en_vocab_word ADD COLUMN meaning_source TEXT`).run();
  }
  if (!cols.has("example_sentences")) {
    await db.prepare(`ALTER TABLE en_vocab_word ADD COLUMN example_sentences TEXT`).run();
  }
  if (!cols.has("example_sentences_source")) {
    await db
      .prepare(`ALTER TABLE en_vocab_word ADD COLUMN example_sentences_source TEXT`)
      .run();
  }
  vocabWordSchemaReady = true;
}

/** 供 fill-* 等轻量入口在写库前确保列存在 */
export async function ensureEnVocabWordSchema(db: D1Database): Promise<void> {
  await ensureVocabWordSchema(db);
}

function mapSharedListWordRow(row: Record<string, unknown>): EnVocabWord {
  const word = mapRow({ ...row, class_notes: null });
  return {
    ...word,
    class_notes: null,
    class_notes_present: Boolean(Number(row.has_class_notes)),
  };
}

async function listEnVocabRefsByKeys(
  db: D1Database,
  keys: string[]
): Promise<EnVocabRef[]> {
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (!unique.length) return [];
  if (devStoreEnabled) {
    return unique
      .map((k) => devRefs.get(k))
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

const WORD_SELECT = `SELECT id, word, reading, reading_source, meaning, meaning_source, pos, kind, ref_key,
  cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes,
  example_sentences, example_sentences_source,
  last_review_level, last_review_at, created_at, updated_at FROM en_vocab_word`;

function refsRecord(refs: EnVocabRef[]): Record<string, EnVocabRef> {
  return Object.fromEntries(refs.map((r) => [r.ref_key, r]));
}

async function upsertRefMetadataDev(
  item: EnVocabRefUploadInput,
  ts: string
): Promise<EnVocabRef | null> {
  const refKey = normalizeEnVocabRefKey(item.ref_key);
  if (!refKey) return null;

  const mediaType = normalizeMediaType(item.media_type);
  const existing = devRefs.get(refKey);
  const ref: EnVocabRef = {
    ref_key: refKey,
    title: (item.title || "").trim() || existing?.title || null,
    media_type: mediaType,
    r2_key: existing?.r2_key || enVocabRefLocalMarker(refKey),
    created_at: existing?.created_at || ts,
    updated_at: ts,
  };
  devRefs.set(refKey, ref);
  return ref;
}

async function upsertRefMetadataDb(
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

  if (devStoreEnabled) {
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

  if (devStoreEnabled) {
    const existing = devRefs.get(key);
    const ref: EnVocabRef = {
      ref_key: key,
      title: title || existing?.title || null,
      media_type: mediaType,
      r2_key: r2Key,
      created_at: existing?.created_at || ts,
      updated_at: ts,
    };
    devRefs.set(key, ref);
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

  if (devStoreEnabled) {
    return devRefs.get(key) ?? null;
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
  if (devStoreEnabled) {
    return [...devRefs.values()].sort((a, b) =>
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

async function seedIfEmpty(db: D1Database): Promise<void> {
  if (devStoreEnabled) {
    if (devSeeded || devWords.length > 0) return;
    const ts = nowIso();
    for (const item of SEED_REFS) {
      await upsertRefMetadataDev(item, ts);
    }
    for (const item of SEED_WORDS) {
      devWords.push({
        id: devNextId++,
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
    devSeeded = true;
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

export async function listEnVocabWords(db: D1Database): Promise<EnVocabWord[]> {
  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (devStoreEnabled) {
    return sortEnVocabWords(devWords);
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

  if (devStoreEnabled) {
    return devWords
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

export type RecordEnVocabReviewResult =
  | { ok: true; word: EnVocabWord }
  | { ok: false; error: string };

export async function recordEnVocabReview(
  db: D1Database,
  wordId: number,
  level: EnVocabLevel
): Promise<RecordEnVocabReviewResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  if (!["very", "normal", "weak"].includes(level)) {
    return { ok: false, error: "level_invalid" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  await ensureEnVocabSharedSchema(db);

  if (await isEnVocabWordSharedToday(db, wordId)) {
    return { ok: false, error: "shared_level_locked" };
  }

  if (devStoreEnabled) {
    const idx = devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    const { word: updated } = applyEnVocabReview(devWords[idx], level);
    devWords[idx] = updated;
    devDailyDisplayOrder = markEnVocabRoundChecked(devDailyDisplayOrder, wordId);
    return { ok: true, word: updated };
  }

  const row = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };

  const current = mapRow(row);
  const { word: updated } = applyEnVocabReview(current, level);

  const result = await db
    .prepare(
      `UPDATE en_vocab_word
       SET cnt_very = ?1,
           cnt_normal = ?2,
           cnt_weak = ?3,
           today_check_count = ?4,
           today_check_date = ?5,
           last_review_level = ?6,
           last_review_at = ?7,
           updated_at = ?8
       WHERE id = ?9`
    )
    .bind(
      updated.cnt_very,
      updated.cnt_normal,
      updated.cnt_weak,
      updated.today_check_count,
      updated.today_check_date,
      updated.last_review_level,
      updated.last_review_at,
      updated.updated_at,
      wordId
    )
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  await markEnVocabWordRoundChecked(db, wordId);

  return { ok: true, word: updated };
}

export type ResetEnVocabReviewsResult =
  | { ok: true; words: EnVocabWord[]; display_order: EnVocabDailyDisplayOrder }
  | { ok: false; error: string };

export async function resetAllEnVocabReviews(
  db: D1Database
): Promise<ResetEnVocabReviewsResult> {
  await seedIfEmpty(db);
  const ts = nowIso();

  if (devStoreEnabled) {
    for (let i = 0; i < devWords.length; i++) {
      devWords[i] = {
        ...devWords[i],
        cnt_very: 0,
        cnt_normal: 0,
        cnt_weak: 0,
        today_check_count: 0,
        today_check_date: null,
        last_review_level: null,
        last_review_at: null,
        updated_at: ts,
      };
    }
    const words = sortEnVocabWords(devWords);
    devDailyDisplayOrder = await refreshEnVocabDailyDisplayOrder(db, words);
    return { ok: true, words, display_order: devDailyDisplayOrder };
  }

  await db
    .prepare(
      `UPDATE en_vocab_word
       SET cnt_very = 0, cnt_normal = 0, cnt_weak = 0,
           today_check_count = 0, today_check_date = NULL,
           last_review_level = NULL, last_review_at = NULL,
           updated_at = ?1`
    )
    .bind(ts)
    .run();

  const words = await listEnVocabWords(db);
  const display_order = await refreshEnVocabDailyDisplayOrder(db, words);
  return { ok: true, words, display_order };
}

export async function resetTodayEnVocabRound(
  db: D1Database
): Promise<ResetEnVocabReviewsResult> {
  await seedIfEmpty(db);
  const words = await listEnVocabWords(db);
  const display_order = await refreshEnVocabDailyDisplayOrder(db, words);
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

  if (devStoreEnabled) {
    if (replace) {
      devWords.length = 0;
      devNextId = 1;
    }
    let added = 0;
    let skipped = 0;
    for (const item of cleaned) {
      const exists = devWords.some((w) => w.word === item.word);
      if (exists && !replace) {
        skipped++;
        continue;
      }
      devWords.push({
        id: devNextId++,
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
    return { ok: true, added, skipped, total: devWords.length };
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

  if (devStoreEnabled) {
    if (devWords.some((w) => w.word === item.word)) {
      return { ok: false, error: "word_duplicate" };
    }
    const created: EnVocabWord = {
      id: devNextId++,
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
    devWords.push(created);
    devDailyDisplayOrder = appendEnVocabDailyDisplayOrderId(
      devDailyDisplayOrder,
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
export async function upsertEnVocabFromLesson(
  db: D1Database,
  items: { word: string; kind: EnVocabKind; ref_key: string | null }[],
  refs: EnVocabRefUploadInput[] = []
): Promise<void> {
  if (!items.length) return;
  if (refs.length) await upsertEnVocabRefMetadata(db, refs);

  const ts = nowIso();

  if (devStoreEnabled) {
    for (const item of items) {
      const word = normalizeWord(item.word);
      if (!word) continue;
      const kind = normalizeKind(item.kind);
      const refKey = item.ref_key;
      const idx = devWords.findIndex((w) => w.word === word);
      if (idx >= 0) {
        continue;
      }
      devWords.push({
          id: devNextId++,
          word,
          reading: null,
          meaning: null,
          pos: null,
          kind,
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
    const refKey = item.ref_key;

    const existing = await db
      .prepare("SELECT id FROM en_vocab_word WHERE word = ?1 LIMIT 1")
      .bind(word)
      .first<{ id: number }>();

    if (existing) continue;

    await db
      .prepare(
        `INSERT INTO en_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
         VALUES (?1, NULL, NULL, ?2, ?3, 0, 0, 0, 0, NULL, NULL, ?4, ?4)`
      )
      .bind(word, kind, refKey, ts)
      .run();
  }
}

function combineLessonNotes(notes: { body: string }[]): string | null {
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

  if (devStoreEnabled) {
    for (const item of items) {
      const combined = combineLessonNotes(
        notes.filter((n) => n.item_word === item)
      );
      const idx = devWords.findIndex((w) => {
        if (w.word !== item) return false;
        if (refKey) return w.ref_key === refKey;
        return w.ref_key == null && w.kind === kind;
      });
      if (idx >= 0) {
        devWords[idx] = {
          ...devWords[idx],
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

  if (devStoreEnabled) {
    for (let i = 0; i < devWords.length; i++) {
      const w = devWords[i];
      if (!cleaned.includes(w.word) || w.ref_key !== fromKey) continue;
      devWords[i] = { ...w, ref_key: toKey, updated_at: ts };
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

  if (devStoreEnabled) {
    for (let i = devWords.length - 1; i >= 0; i--) {
      const w = devWords[i];
      if (!cleaned.includes(w.word)) continue;
      if (refKey) {
        if (w.ref_key === refKey) devWords.splice(i, 1);
      } else if (w.ref_key == null && w.kind === normalizedKind) {
        devWords.splice(i, 1);
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

  if (devStoreEnabled) {
    let deleted = 0;
    for (let i = devWords.length - 1; i >= 0; i--) {
      if (idSet.has(devWords[i].id)) {
        devWords.splice(i, 1);
        deleted++;
      }
    }
    for (let i = devShared.length - 1; i >= 0; i--) {
      if (idSet.has(devShared[i].word_id)) {
        devShared.splice(i, 1);
      }
    }
    if (deleted === 0) {
      return { ok: false, error: "not_found" };
    }
    invalidateEnVocabSharedTodayCache();
    const words = [...devWords];
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
  // D1：先清 shared，再删词；勿只靠 ON DELETE CASCADE
  await ensureEnVocabSharedSchema(db);
  await db
    .prepare(`DELETE FROM en_vocab_shared WHERE word_id IN (${placeholders})`)
    .bind(...ids)
    .run();
  const result = await db
    .prepare(`DELETE FROM en_vocab_word WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();

  const deleted = Number(result.meta?.changes ?? 0);
  if (deleted === 0) {
    return { ok: false, error: "not_found" };
  }

  invalidateEnVocabSharedTodayCache();
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

function lessonMatchesVocabWord(lesson: EnLessonRecord, word: EnVocabWord): boolean {
  if (!lesson.completed) return false;
  const items = parseLessonContent(lesson.content);
  if (!items.includes(word.word)) return false;
  if (word.ref_key) return lesson.ref_key === word.ref_key;
  return lesson.ref_key == null && lesson.kind === word.kind;
}

export type UpdateEnVocabClassNotesResult =
  | { ok: true; word: EnVocabWord }
  | { ok: false; error: string };

export async function getEnVocabClassNotes(
  db: D1Database,
  wordId: number
): Promise<UpdateEnVocabClassNotesResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await ensureVocabWordSchema(db);

  if (devStoreEnabled) {
    const word = devWords.find((w) => w.id === wordId);
    if (!word) return { ok: false, error: "not_found" };
    return { ok: true, word };
  }

  const row = await db
    .prepare(
      `SELECT id, word, reading, meaning, pos, kind, ref_key,
              cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date,
              class_notes, last_review_level, last_review_at, created_at, updated_at
       FROM en_vocab_word WHERE id = ?1`
    )
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, word: mapRow(row) };
}

/** 更新单词复习页课堂笔记，并同步回关联的新课笔记 */
export async function updateEnVocabClassNotes(
  db: D1Database,
  wordId: number,
  classNotes: string | null,
  operatorUsername: string
): Promise<UpdateEnVocabClassNotesResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const normalized = (classNotes || "").trim() || null;
  const ts = nowIso();

  let word: EnVocabWord | undefined;

  if (devStoreEnabled) {
    const idx = devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devWords[idx] = {
      ...devWords[idx],
      class_notes: normalized,
      updated_at: ts,
    };
    word = devWords[idx];
  } else {
    const result = await db
      .prepare(
        `UPDATE en_vocab_word SET class_notes = ?1, updated_at = ?2 WHERE id = ?3`
      )
      .bind(normalized, ts, wordId)
      .run();

    if (!result.meta?.changes) {
      return { ok: false, error: "not_found" };
    }

    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();

    if (!row) return { ok: false, error: "not_found" };
    word = mapRow(row);
  }

  const lessons = await listEnLessons(db);
  for (const lesson of lessons) {
    if (!lessonMatchesVocabWord(lesson, word)) continue;
    const sync = await replaceLessonNotesForItem(
      db,
      lesson.id,
      word.word,
      normalized,
      operatorUsername
    );
    if (!sync.ok) return sync;
  }

  invalidateEnVocabSharedTodayCache();
  return { ok: true, word };
}

export type UpdateEnVocabWordFieldsResult =
  | { ok: true; word: EnVocabWord }
  | { ok: false; error: string };

/** 更新单词表中的词条文本、释义或词性 */
export async function updateEnVocabWordFields(
  db: D1Database,
  wordId: number,
  fields: { word?: string; meaning?: string | null; pos?: string | null }
): Promise<UpdateEnVocabWordFieldsResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  let current: EnVocabWord | undefined;

  if (devStoreEnabled) {
    current = devWords.find((w) => w.id === wordId);
  } else {
    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();
    if (row) current = mapRow(row);
  }

  if (!current) return { ok: false, error: "not_found" };

  const nextWord =
    fields.word !== undefined ? normalizeWord(fields.word) : current.word;
  const nextMeaning =
    fields.meaning !== undefined
      ? (fields.meaning || "").trim() || null
      : current.meaning;
  const nextPos =
    fields.pos !== undefined
      ? (fields.pos || "").trim() || null
      : current.pos;

  if (fields.word !== undefined && !nextWord) {
    return { ok: false, error: "word_required" };
  }

  if (nextWord !== current.word) {
    if (devStoreEnabled) {
      if (devWords.some((w) => w.id !== wordId && w.word === nextWord)) {
        return { ok: false, error: "word_duplicate" };
      }
    } else {
      const dup = await db
        .prepare("SELECT id FROM en_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1")
        .bind(nextWord, wordId)
        .first<{ id: number }>();
      if (dup) return { ok: false, error: "word_duplicate" };
    }
  }

  if (devStoreEnabled) {
    const idx = devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devWords[idx] = {
      ...devWords[idx],
      word: nextWord,
      meaning: nextMeaning,
      pos: nextPos,
      updated_at: ts,
    };
    return { ok: true, word: devWords[idx] };
  }

  const result = await db
    .prepare(
      `UPDATE en_vocab_word SET word = ?1, meaning = ?2, pos = ?3, updated_at = ?4 WHERE id = ?5`
    )
    .bind(nextWord, nextMeaning, nextPos, ts, wordId)
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  const row = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, word: mapRow(row) };
}

export type EnVocabWordEntryInput = {
  kind?: EnVocabKind;
  word?: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
  class_notes?: string | null;
  example_sentences?: string | null;
};

/** 一次性更新词条可编辑字段，并同步备注到关联新课 */
export async function updateEnVocabWordEntry(
  db: D1Database,
  wordId: number,
  input: EnVocabWordEntryInput,
  operatorUsername: string
): Promise<UpdateEnVocabWordFieldsResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  let current: EnVocabWord | undefined;

  if (devStoreEnabled) {
    current = devWords.find((w) => w.id === wordId);
  } else {
    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();
    if (row) current = mapRow(row);
  }

  if (!current) return { ok: false, error: "not_found" };

  const nextKind =
    input.kind !== undefined ? normalizeKind(input.kind) : current.kind;
  const nextWord =
    input.word !== undefined ? normalizeWord(input.word) : current.word;
  const nextReading =
    nextKind === "grammar"
      ? null
      : input.reading !== undefined
        ? (input.reading || "").trim() || null
        : current.reading;
  const nextMeaning =
    input.meaning !== undefined
      ? (input.meaning || "").trim() || null
      : current.meaning;
  const nextPos =
    input.pos !== undefined
      ? (input.pos || "").trim() || null
      : current.pos;
  const nextNotes =
    input.class_notes !== undefined
      ? (input.class_notes || "").trim() || null
      : current.class_notes;
  const nextExamples =
    input.example_sentences !== undefined
      ? (input.example_sentences || "").trim() || null
      : current.example_sentences ?? null;

  const readingChanged =
    input.reading !== undefined &&
    (nextReading || null) !== (current.reading || null);
  const meaningChanged =
    input.meaning !== undefined &&
    (nextMeaning || null) !== (current.meaning || null);
  const examplesChanged =
    input.example_sentences !== undefined &&
    (nextExamples || null) !== (current.example_sentences || null);

  const nextReadingSource = readingChanged
    ? nextReading
      ? "手动"
      : null
    : current.reading_source ?? null;
  const nextMeaningSource = meaningChanged
    ? nextMeaning
      ? "手动"
      : null
    : current.meaning_source ?? null;
  const nextExampleSource = examplesChanged
    ? nextExamples
      ? "手动"
      : null
    : current.example_sentences_source ?? null;

  if (!nextWord) return { ok: false, error: "word_required" };

  if (nextWord !== current.word) {
    if (devStoreEnabled) {
      if (devWords.some((w) => w.id !== wordId && w.word === nextWord)) {
        return { ok: false, error: "word_duplicate" };
      }
    } else {
      const dup = await db
        .prepare("SELECT id FROM en_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1")
        .bind(nextWord, wordId)
        .first<{ id: number }>();
      if (dup) return { ok: false, error: "word_duplicate" };
    }
  }

  if (devStoreEnabled) {
    const idx = devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devWords[idx] = {
      ...devWords[idx],
      kind: nextKind,
      word: nextWord,
      reading: nextReading,
      reading_source: nextReadingSource,
      meaning: nextMeaning,
      meaning_source: nextMeaningSource,
      pos: nextPos,
      class_notes: nextNotes,
      example_sentences: nextExamples,
      example_sentences_source: nextExampleSource,
      updated_at: ts,
    };
    current = devWords[idx];
  } else {
    const result = await db
      .prepare(
        `UPDATE en_vocab_word
         SET kind = ?1, word = ?2, reading = ?3, reading_source = ?4,
             meaning = ?5, meaning_source = ?6, pos = ?7, class_notes = ?8,
             example_sentences = ?9, example_sentences_source = ?10,
             updated_at = ?11
         WHERE id = ?12`
      )
      .bind(
        nextKind,
        nextWord,
        nextReading,
        nextReadingSource,
        nextMeaning,
        nextMeaningSource,
        nextPos,
        nextNotes,
        nextExamples,
        nextExampleSource,
        ts,
        wordId
      )
      .run();

    if (!result.meta?.changes) {
      return { ok: false, error: "not_found" };
    }

    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();

    if (!row) return { ok: false, error: "not_found" };
    current = mapRow(row);
  }

  if (input.class_notes !== undefined) {
    const lessons = await listEnLessons(db);
    for (const lesson of lessons) {
      if (!lessonMatchesVocabWord(lesson, current)) continue;
      const sync = await replaceLessonNotesForItem(
        db,
        lesson.id,
        current.word,
        nextNotes,
        operatorUsername
      );
      if (!sync.ok) return sync;
    }
  }

  return { ok: true, word: current };
}

async function readEnVocabDailyDisplayOrderRaw(
  db: D1Database
): Promise<EnVocabDailyDisplayOrder | null> {
  if (devStoreEnabled) {
    return devDailyDisplayOrder.ids.length ? devDailyDisplayOrder : null;
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

async function saveEnVocabDailyDisplayOrder(
  db: D1Database,
  order: EnVocabDailyDisplayOrder
): Promise<void> {
  if (devStoreEnabled) {
    devDailyDisplayOrder = order;
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

/** 当日已有顺序则沿用（仅合并增删词条）；跨日则按抽查优先级重排 */
export async function ensureEnVocabDailyDisplayOrder(
  db: D1Database,
  words: EnVocabWord[]
): Promise<EnVocabDailyDisplayOrder> {
  const today = beijingDateString();
  const stored = await readEnVocabDailyDisplayOrderRaw(db);

  if (stored?.date === today && stored.ids.length > 0) {
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
    const order = {
      date: today,
      ids: merged,
      round_checked_ids,
    };
    if (
      merged.length !== stored.ids.length ||
      merged.some((id, i) => id !== stored.ids[i]) ||
      stored.round_checked_ids === undefined
    ) {
      await saveEnVocabDailyDisplayOrder(db, order);
    }
    return order;
  }

  const order = {
    date: today,
    ids: computeEnVocabDailyDisplayOrder(words),
    round_checked_ids: [] as number[],
  };
  await saveEnVocabDailyDisplayOrder(db, order);
  return order;
}

/** 强制按当前数据重算当日顺序（如今日重置 / 全部重置后） */
export async function refreshEnVocabDailyDisplayOrder(
  db: D1Database,
  words: EnVocabWord[]
): Promise<EnVocabDailyDisplayOrder> {
  const order = {
    date: beijingDateString(),
    ids: computeEnVocabDailyDisplayOrder(words),
    round_checked_ids: [] as number[],
  };
  await saveEnVocabDailyDisplayOrder(db, order);
  return order;
}

export async function markEnVocabWordRoundChecked(
  db: D1Database,
  wordId: number
): Promise<void> {
  if (devStoreEnabled) {
    devDailyDisplayOrder = markEnVocabRoundChecked(devDailyDisplayOrder, wordId);
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

async function ensureEnVocabSettingSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled) return;
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
  if (devStoreEnabled) {
    return normalizeEnVocabDailyQuizStyle(devDailyQuizStyle);
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

  if (devStoreEnabled) {
    devDailyQuizStyle = normalized;
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

async function ensureEnVocabSharedSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled || enVocabSharedSchemaReady) return;
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
  enVocabSharedSchemaReady = true;
}

function mapSharedRow(
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

function isEnVocabWordCheckedToday(word: EnVocabWord, now = new Date()): boolean {
  if (
    effectiveTodayCheckCount(word.today_check_count ?? 0, word.today_check_date, now) >
    0
  ) {
    return true;
  }
  if (!word.last_review_at || !word.last_review_level) return false;
  return word.last_review_at.slice(0, 10) === beijingDateString(now);
}

export type ShareEnVocabWordResult =
  | { ok: true; item: EnVocabSharedItem; word: EnVocabWord }
  | { ok: false; error: string };

async function isEnVocabWordSharedToday(
  db: D1Database,
  wordId: number,
  now = new Date()
): Promise<boolean> {
  await ensureEnVocabSharedSchema(db);
  const today = beijingDateString(now);
  if (devStoreEnabled) {
    return devShared.some((s) => s.share_date === today && s.word_id === wordId);
  }
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM en_vocab_shared
       WHERE share_date = ?1 AND word_id = ?2
       LIMIT 1`
    )
    .bind(today, wordId)
    .first<{ ok: number }>();
  return Boolean(row);
}

export async function listEnVocabSharedTodayWordIds(
  db: D1Database,
  now = new Date()
): Promise<number[]> {
  await ensureEnVocabSharedSchema(db);
  const today = beijingDateString(now);
  if (devStoreEnabled) {
    return devShared
      .filter((s) => s.share_date === today)
      .map((s) => s.word_id);
  }
  const result = await db
    .prepare(
      `SELECT word_id FROM en_vocab_shared
       WHERE share_date = ?1
       ORDER BY shared_at ASC, id ASC`
    )
    .bind(today)
    .all<{ word_id: number }>();
  return (result.results ?? []).map((row) => Number(row.word_id));
}

export async function shareEnVocabWord(
  db: D1Database,
  wordId: number,
  sharedBy: string
): Promise<ShareEnVocabWordResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  const sharedByTrim = (sharedBy || "").trim();
  if (!sharedByTrim) {
    return { ok: false, error: "shared_by_required" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  await ensureEnVocabSharedSchema(db);

  const today = beijingDateString();
  const ts = nowIso();

  if (devStoreEnabled) {
    const word = devWords.find((w) => w.id === wordId);
    if (!word) return { ok: false, error: "not_found" };
    if (await isEnVocabWordSharedToday(db, wordId)) {
      return { ok: false, error: "already_shared_today" };
    }
    let updatedWord = word;
    if (!isEnVocabWordCheckedToday(word)) {
      const review = await recordEnVocabReview(db, wordId, "weak");
      if (!review.ok) return { ok: false, error: review.error };
      updatedWord = review.word;
    }
    const sharedRow = {
      id: devSharedNextId++,
      word_id: wordId,
      shared_by: sharedByTrim,
      shared_at: ts,
      share_date: today,
    };
    devShared.push(sharedRow);
    invalidateEnVocabSharedTodayCache();
    return {
      ok: true,
      item: mapSharedRow(sharedRow, updatedWord),
      word: updatedWord,
    };
  }

  const wordRow = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();
  if (!wordRow) return { ok: false, error: "not_found" };

  const existingRow = await db
    .prepare(
      `SELECT id, word_id, shared_by, shared_at, share_date
       FROM en_vocab_shared
       WHERE share_date = ?1 AND word_id = ?2`
    )
    .bind(today, wordId)
    .first<Record<string, unknown>>();

  if (existingRow) {
    return { ok: false, error: "already_shared_today" };
  }

  const current = mapRow(wordRow);
  let updatedWord = current;
  if (!isEnVocabWordCheckedToday(current)) {
    const review = await recordEnVocabReview(db, wordId, "weak");
    if (!review.ok) return { ok: false, error: review.error };
    updatedWord = review.word;
  }

  const insert = await db
    .prepare(
      `INSERT INTO en_vocab_shared (word_id, shared_by, shared_at, share_date)
       VALUES (?1, ?2, ?3, ?4)`
    )
    .bind(wordId, sharedByTrim, ts, today)
    .run();
  const insertedId = Number(insert.meta?.last_row_id);
  const sharedRow = {
    id: insertedId,
    word_id: wordId,
    shared_by: sharedByTrim,
    shared_at: ts,
    share_date: today,
  };

  invalidateEnVocabSharedTodayCache();
  return {
    ok: true,
    item: mapSharedRow(sharedRow, updatedWord),
    word: updatedWord,
  };
}

export async function listEnVocabSharedToday(
  db: D1Database,
  now = new Date()
): Promise<{ items: EnVocabSharedItem[]; refs: Record<string, EnVocabRef> }> {
  const today = beijingDateString(now);
  const nowMs = Date.now();
  if (
    sharedTodayListCache &&
    sharedTodayListCache.date === today &&
    nowMs - sharedTodayListCache.at < EN_VOCAB_SHARED_LIST_CACHE_MS
  ) {
    return sharedTodayListCache.value;
  }
  if (sharedTodayListInflight) {
    return sharedTodayListInflight;
  }

  const gen = sharedTodayListCacheGen;
  sharedTodayListInflight = (async () => {
    try {
      const value = await queryEnVocabSharedToday(db, now);
      if (gen === sharedTodayListCacheGen) {
        sharedTodayListCache = {
          at: Date.now(),
          date: beijingDateString(now),
          value,
        };
      }
      return value;
    } finally {
      sharedTodayListInflight = null;
    }
  })();

  return sharedTodayListInflight;
}

async function queryEnVocabSharedToday(
  db: D1Database,
  now = new Date()
): Promise<{ items: EnVocabSharedItem[]; refs: Record<string, EnVocabRef> }> {
  await ensureVocabWordSchema(db);
  await ensureEnVocabSharedSchema(db);

  const today = beijingDateString(now);

  if (devStoreEnabled) {
    const items = devShared
      .filter((s) => s.share_date === today)
      .map((s) => {
        const word = devWords.find((w) => w.id === s.word_id);
        if (!word) return null;
        const hasNotes = Boolean((word.class_notes || "").trim());
        const liteWord: EnVocabWord = {
          ...word,
          class_notes: null,
          class_notes_present: hasNotes,
        };
        return mapSharedRow(s, liteWord);
      })
      .filter((item): item is EnVocabSharedItem => item != null)
      .sort((a, b) => a.shared_at.localeCompare(b.shared_at));
    const refs = refsRecord(Array.from(devRefs.values()));
    return { items, refs };
  }

  const result = await db
    .prepare(
      `SELECT s.id, s.word_id, s.shared_by, s.shared_at, s.share_date,
              w.id AS w_id, w.word, w.reading, w.meaning, w.pos, w.kind, w.ref_key,
              w.cnt_very, w.cnt_normal, w.cnt_weak, w.today_check_count, w.today_check_date,
              w.last_review_level, w.last_review_at, w.created_at, w.updated_at,
              (CASE WHEN w.class_notes IS NOT NULL THEN 1 ELSE 0 END) AS has_class_notes
       FROM en_vocab_shared s
       INNER JOIN en_vocab_word w ON w.id = s.word_id
       WHERE s.share_date = ?1
       ORDER BY s.shared_at ASC, s.id ASC`
    )
    .bind(today)
    .all<Record<string, unknown>>();

  const items = (result.results ?? []).map((row) => {
    const word = mapSharedListWordRow({
      id: row.w_id,
      word: row.word,
      reading: row.reading,
      meaning: row.meaning,
      pos: row.pos,
      kind: row.kind,
      ref_key: row.ref_key,
      cnt_very: row.cnt_very,
      cnt_normal: row.cnt_normal,
      cnt_weak: row.cnt_weak,
      today_check_count: row.today_check_count,
      today_check_date: row.today_check_date,
      last_review_level: row.last_review_level,
      last_review_at: row.last_review_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      has_class_notes: row.has_class_notes,
    });
    return mapSharedRow(row, word);
  });

  const refKeys = [
    ...new Set(items.map((item) => item.word.ref_key).filter(Boolean)),
  ] as string[];
  const refs: Record<string, EnVocabRef> = {};
  if (refKeys.length) {
    const refList = await listEnVocabRefsByKeys(db, refKeys);
    for (const ref of refList) {
      refs[ref.ref_key] = ref;
    }
  }

  return { items, refs };
}
