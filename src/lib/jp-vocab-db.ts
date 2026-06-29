import "server-only";

import type {
  CloudflareEnv,
  JpVocabKind,
  JpVocabLevel,
  JpVocabMediaType,
  JpVocabRef,
  JpVocabRefUploadInput,
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
  beijingDateString,
  effectiveTodayCheckCount,
} from "@/lib/jp-vocab-daily-check";
import {
  appendJpVocabDailyDisplayOrderId,
  computeJpVocabDailyDisplayOrder,
  markJpVocabRoundChecked,
  mergeJpVocabDailyDisplayOrder,
  normalizeJpVocabRoundCheckedIds,
  type JpVocabDailyDisplayOrder,
} from "@/lib/jp-vocab-daily-order";
import {
  JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
  normalizeJpVocabDailyQuizStyle,
  type JpVocabDailyQuizStyle,
} from "@/lib/jp-vocab-daily-quiz-style";
import { applyJpVocabReview } from "@/lib/jp-vocab-review";
import { parseLessonContent } from "@/lib/jp-lesson-shared";
import { listJpLessons } from "@/lib/jp-lesson-db";
import { listJpLessonNotesByLessonId, replaceLessonNotesForItem } from "@/lib/jp-lesson-note-db";
import type { JpLessonRecord } from "@/lib/types";

const SEED_WORDS: JpVocabUploadInput[] = [
  {
    word: "～ばかり",
    meaning: "（刚刚，只是……）",
    kind: "grammar",
    ref_key: "demo-lesson3-grammar",
  },
  {
    word: "～ようになる",
    meaning: "（变得能够……）",
    kind: "grammar",
    ref_key: "demo-lesson3-grammar",
  },
  {
    word: "～に来る",
    meaning: "（来……做……）",
    kind: "grammar",
    ref_key: "demo-lesson3-grammar",
  },
];

const SEED_REFS: JpVocabRefUploadInput[] = [
  {
    ref_key: "demo-lesson3-grammar",
    title: "3つの大切な文法",
    media_type: "image",
  },
];

let devStoreEnabled = false;
const devWords: JpVocabWord[] = [];
const devRefs = new Map<string, JpVocabRef>();
let devNextId = 1;
let devSeeded = false;
let devDailyQuizStyle: JpVocabDailyQuizStyle = {
  ...JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
};
let devDailyDisplayOrder: JpVocabDailyDisplayOrder = {
  date: "",
  ids: [],
  round_checked_ids: [],
};

const JP_VOCAB_DAILY_QUIZ_STYLE_KEY = "daily_quiz_style";
const JP_VOCAB_DAILY_DISPLAY_ORDER_KEY = "daily_display_order";

export function enableJpVocabDevStore() {
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

function normalizeKind(raw?: JpVocabKind | null): JpVocabKind {
  return raw === "grammar" ? "grammar" : "word";
}

function normalizeMediaType(raw?: JpVocabMediaType | null): JpVocabMediaType {
  return raw === "pdf" ? "pdf" : "image";
}

function mapRefRow(row: Record<string, unknown>): JpVocabRef {
  return {
    ref_key: String(row.ref_key),
    title: row.title != null ? String(row.title) : null,
    media_type: row.media_type === "pdf" ? "pdf" : "image",
    r2_key: String(row.r2_key),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRow(row: Record<string, unknown>): JpVocabWord {
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
  if (devStoreEnabled) return;
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
}

const WORD_SELECT = `SELECT id, word, reading, meaning, pos, kind, ref_key,
  cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes,
  last_review_level, last_review_at, created_at, updated_at FROM jp_vocab_word`;

function refsRecord(refs: JpVocabRef[]): Record<string, JpVocabRef> {
  return Object.fromEntries(refs.map((r) => [r.ref_key, r]));
}

async function upsertRefMetadataDev(
  item: JpVocabRefUploadInput,
  ts: string
): Promise<JpVocabRef | null> {
  const refKey = normalizeJpVocabRefKey(item.ref_key);
  if (!refKey) return null;

  const mediaType = normalizeMediaType(item.media_type);
  const existing = devRefs.get(refKey);
  const ref: JpVocabRef = {
    ref_key: refKey,
    title: (item.title || "").trim() || existing?.title || null,
    media_type: mediaType,
    r2_key: existing?.r2_key || jpVocabRefLocalMarker(refKey),
    created_at: existing?.created_at || ts,
    updated_at: ts,
  };
  devRefs.set(refKey, ref);
  return ref;
}

async function upsertRefMetadataDb(
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

  if (devStoreEnabled) {
    const existing = devRefs.get(key);
    const ref: JpVocabRef = {
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

  if (devStoreEnabled) {
    return devRefs.get(key) ?? null;
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
  if (devStoreEnabled) {
    return [...devRefs.values()].sort((a, b) =>
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
    devSeeded = true;
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

export async function listJpVocabWords(db: D1Database): Promise<JpVocabWord[]> {
  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (devStoreEnabled) {
    return sortJpVocabWords(devWords);
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

export type RecordJpVocabReviewResult =
  | { ok: true; word: JpVocabWord }
  | { ok: false; error: string };

export async function recordJpVocabReview(
  db: D1Database,
  wordId: number,
  level: JpVocabLevel
): Promise<RecordJpVocabReviewResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  if (!["very", "normal", "weak"].includes(level)) {
    return { ok: false, error: "level_invalid" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (devStoreEnabled) {
    const idx = devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    const { word: updated } = applyJpVocabReview(devWords[idx], level);
    devWords[idx] = updated;
    devDailyDisplayOrder = markJpVocabRoundChecked(devDailyDisplayOrder, wordId);
    return { ok: true, word: updated };
  }

  const row = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };

  const current = mapRow(row);
  const { word: updated } = applyJpVocabReview(current, level);

  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
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

  await markJpVocabWordRoundChecked(db, wordId);

  return { ok: true, word: updated };
}

export type ResetJpVocabReviewsResult =
  | { ok: true; words: JpVocabWord[]; display_order: JpVocabDailyDisplayOrder }
  | { ok: false; error: string };

export async function resetAllJpVocabReviews(
  db: D1Database
): Promise<ResetJpVocabReviewsResult> {
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
    const words = sortJpVocabWords(devWords);
    devDailyDisplayOrder = await refreshJpVocabDailyDisplayOrder(db, words);
    return { ok: true, words, display_order: devDailyDisplayOrder };
  }

  await db
    .prepare(
      `UPDATE jp_vocab_word
       SET cnt_very = 0, cnt_normal = 0, cnt_weak = 0,
           today_check_count = 0, today_check_date = NULL,
           last_review_level = NULL, last_review_at = NULL,
           updated_at = ?1`
    )
    .bind(ts)
    .run();

  const words = await listJpVocabWords(db);
  const display_order = await refreshJpVocabDailyDisplayOrder(db, words);
  return { ok: true, words, display_order };
}

export async function resetTodayJpVocabRound(
  db: D1Database
): Promise<ResetJpVocabReviewsResult> {
  await seedIfEmpty(db);
  const words = await listJpVocabWords(db);
  const display_order = await refreshJpVocabDailyDisplayOrder(db, words);
  return { ok: true, words, display_order };
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
  const cleaned = words
    .map((w) => ({
      word: normalizeWord(w.word),
      reading: (w.reading || "").trim() || null,
      meaning: (w.meaning || "").trim() || null,
      kind: normalizeKind(w.kind),
      ref_key: w.ref_key ? normalizeJpVocabRefKey(w.ref_key) || null : null,
    }))
    .filter((w) => w.word);

  if (!cleaned.length) {
    return { ok: false, error: "words_empty" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  if (refs.length) {
    await upsertJpVocabRefMetadata(db, refs);
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
    await db.prepare("DELETE FROM jp_vocab_word").run();
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
          `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
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
  const word = normalizeWord(input.word);
  if (!word) return { ok: false, error: "word_required" };

  const item = {
    word,
    reading: (input.reading || "").trim() || null,
    meaning: (input.meaning || "").trim() || null,
    kind: normalizeKind(input.kind),
    ref_key: input.ref_key
      ? normalizeJpVocabRefKey(input.ref_key) || null
      : null,
  };

  await seedIfEmpty(db);
  const ts = nowIso();

  if (devStoreEnabled) {
    if (devWords.some((w) => w.word === item.word)) {
      return { ok: false, error: "word_duplicate" };
    }
    const created: JpVocabWord = {
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
    };
    devWords.push(created);
    devDailyDisplayOrder = appendJpVocabDailyDisplayOrderId(
      devDailyDisplayOrder,
      created.id
    );
    return { ok: true, word: created };
  }

  const existing = await db
    .prepare("SELECT id FROM jp_vocab_word WHERE word = ?1 LIMIT 1")
    .bind(item.word)
    .first<{ id: number }>();

  if (existing) return { ok: false, error: "word_duplicate" };

  const insertResult = await db
    .prepare(
      `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
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
export async function upsertJpVocabFromLesson(
  db: D1Database,
  items: { word: string; kind: JpVocabKind; ref_key: string | null }[],
  refs: JpVocabRefUploadInput[] = []
): Promise<void> {
  if (!items.length) return;
  if (refs.length) await upsertJpVocabRefMetadata(db, refs);

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
      .prepare("SELECT id FROM jp_vocab_word WHERE word = ?1 LIMIT 1")
      .bind(word)
      .first<{ id: number }>();

    if (existing) continue;

    await db
      .prepare(
        `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
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

/** 新课已完成时：把 jp_lesson_note 同步到 jp_vocab_word.class_notes */
export async function syncLessonNotesToVocab(
  db: D1Database,
  lesson: JpLessonRecord
): Promise<void> {
  const items = parseLessonContent(lesson.content);
  if (!items.length) return;

  const notes = await listJpLessonNotesByLessonId(db, lesson.id);
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
          `UPDATE jp_vocab_word SET class_notes = ?1, updated_at = ?2
           WHERE word = ?3 AND ref_key = ?4`
        )
        .bind(combined, ts, item, refKey)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE jp_vocab_word SET class_notes = ?1, updated_at = ?2
           WHERE word = ?3 AND ref_key IS NULL AND kind = ?4`
        )
        .bind(combined, ts, item, kind)
        .run();
    }
  }
}

/** 新课教案 ref 变更时，同步更新已写入单词复习的 ref_key */
export async function updateJpVocabWordsRefKey(
  db: D1Database,
  words: string[],
  kind: JpVocabKind,
  oldRefKey: string,
  newRefKey: string
): Promise<void> {
  const cleaned = words.map(normalizeWord).filter(Boolean);
  const fromKey = normalizeJpVocabRefKey(oldRefKey);
  const toKey = normalizeJpVocabRefKey(newRefKey);
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
        `UPDATE jp_vocab_word SET ref_key = ?1, updated_at = ?2
         WHERE word = ?3 AND ref_key = ?4 AND kind = ?5`
      )
      .bind(toKey, ts, word, fromKey, normalizedKind)
      .run();
  }
}

/** 新课改回未完成时：移除本课同步的词条（按 ref_key 匹配） */
export async function removeJpVocabLessonWords(
  db: D1Database,
  words: string[],
  refKey: string | null,
  kind: JpVocabKind
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
        .prepare("DELETE FROM jp_vocab_word WHERE word = ?1 AND ref_key = ?2")
        .bind(word, refKey)
        .run();
    } else {
      await db
        .prepare(
          "DELETE FROM jp_vocab_word WHERE word = ?1 AND ref_key IS NULL AND kind = ?2"
        )
        .bind(word, normalizedKind)
        .run();
    }
  }
}

function lessonMatchesVocabWord(lesson: JpLessonRecord, word: JpVocabWord): boolean {
  if (!lesson.completed) return false;
  const items = parseLessonContent(lesson.content);
  if (!items.includes(word.word)) return false;
  if (word.ref_key) return lesson.ref_key === word.ref_key;
  return lesson.ref_key == null && lesson.kind === word.kind;
}

export type UpdateJpVocabClassNotesResult =
  | { ok: true; word: JpVocabWord }
  | { ok: false; error: string };

/** 更新单词复习页课堂笔记，并同步回关联的新课笔记 */
export async function updateJpVocabClassNotes(
  db: D1Database,
  wordId: number,
  classNotes: string | null,
  operatorUsername: string
): Promise<UpdateJpVocabClassNotesResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const normalized = (classNotes || "").trim() || null;
  const ts = nowIso();

  let word: JpVocabWord | undefined;

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
        `UPDATE jp_vocab_word SET class_notes = ?1, updated_at = ?2 WHERE id = ?3`
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

  const lessons = await listJpLessons(db);
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

  return { ok: true, word };
}

export type UpdateJpVocabWordFieldsResult =
  | { ok: true; word: JpVocabWord }
  | { ok: false; error: string };

/** 更新单词表中的词条文本、释义或词性 */
export async function updateJpVocabWordFields(
  db: D1Database,
  wordId: number,
  fields: { word?: string; meaning?: string | null; pos?: string | null }
): Promise<UpdateJpVocabWordFieldsResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  let current: JpVocabWord | undefined;

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
        .prepare("SELECT id FROM jp_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1")
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
      `UPDATE jp_vocab_word SET word = ?1, meaning = ?2, pos = ?3, updated_at = ?4 WHERE id = ?5`
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

export type JpVocabWordEntryInput = {
  kind?: JpVocabKind;
  word?: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
  class_notes?: string | null;
};

/** 一次性更新词条可编辑字段，并同步备注到关联新课 */
export async function updateJpVocabWordEntry(
  db: D1Database,
  wordId: number,
  input: JpVocabWordEntryInput,
  operatorUsername: string
): Promise<UpdateJpVocabWordFieldsResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  let current: JpVocabWord | undefined;

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

  if (!nextWord) return { ok: false, error: "word_required" };

  if (nextWord !== current.word) {
    if (devStoreEnabled) {
      if (devWords.some((w) => w.id !== wordId && w.word === nextWord)) {
        return { ok: false, error: "word_duplicate" };
      }
    } else {
      const dup = await db
        .prepare("SELECT id FROM jp_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1")
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
      meaning: nextMeaning,
      pos: nextPos,
      class_notes: nextNotes,
      updated_at: ts,
    };
    current = devWords[idx];
  } else {
    const result = await db
      .prepare(
        `UPDATE jp_vocab_word
         SET kind = ?1, word = ?2, reading = ?3, meaning = ?4, pos = ?5, class_notes = ?6, updated_at = ?7
         WHERE id = ?8`
      )
      .bind(
        nextKind,
        nextWord,
        nextReading,
        nextMeaning,
        nextPos,
        nextNotes,
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
    const lessons = await listJpLessons(db);
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

async function readJpVocabDailyDisplayOrderRaw(
  db: D1Database
): Promise<JpVocabDailyDisplayOrder | null> {
  if (devStoreEnabled) {
    return devDailyDisplayOrder.ids.length ? devDailyDisplayOrder : null;
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

async function saveJpVocabDailyDisplayOrder(
  db: D1Database,
  order: JpVocabDailyDisplayOrder
): Promise<void> {
  if (devStoreEnabled) {
    devDailyDisplayOrder = order;
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
      await saveJpVocabDailyDisplayOrder(db, order);
    }
    return order;
  }

  const order = {
    date: today,
    ids: computeJpVocabDailyDisplayOrder(words),
    round_checked_ids: [] as number[],
  };
  await saveJpVocabDailyDisplayOrder(db, order);
  return order;
}

/** 强制按当前数据重算当日顺序（如今日重置 / 全部重置后） */
export async function refreshJpVocabDailyDisplayOrder(
  db: D1Database,
  words: JpVocabWord[]
): Promise<JpVocabDailyDisplayOrder> {
  const order = {
    date: beijingDateString(),
    ids: computeJpVocabDailyDisplayOrder(words),
    round_checked_ids: [] as number[],
  };
  await saveJpVocabDailyDisplayOrder(db, order);
  return order;
}

export async function markJpVocabWordRoundChecked(
  db: D1Database,
  wordId: number
): Promise<void> {
  if (devStoreEnabled) {
    devDailyDisplayOrder = markJpVocabRoundChecked(devDailyDisplayOrder, wordId);
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

export async function appendJpVocabWordToDailyDisplayOrder(
  db: D1Database,
  wordId: number
): Promise<void> {
  const stored = await readJpVocabDailyDisplayOrderRaw(db);
  const today = beijingDateString();
  const base =
    stored?.date === today
      ? stored
      : { date: today, ids: [] as number[] };
  const next = appendJpVocabDailyDisplayOrderId(base, wordId);
  if (next.ids.length !== base.ids.length) {
    await saveJpVocabDailyDisplayOrder(db, next);
  }
}

async function ensureJpVocabSettingSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_vocab_setting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
}

export async function getJpVocabDailyQuizStyle(
  db: D1Database
): Promise<JpVocabDailyQuizStyle> {
  if (devStoreEnabled) {
    return normalizeJpVocabDailyQuizStyle(devDailyQuizStyle);
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

  if (devStoreEnabled) {
    devDailyQuizStyle = normalized;
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
