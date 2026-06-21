import "server-only";

import type {
  JpVocabKind,
  JpVocabLevel,
  JpVocabMediaType,
  JpVocabRef,
  JpVocabRefUploadInput,
  JpVocabUploadInput,
  JpVocabWord,
} from "@/lib/types";
import {
  jpVocabRefLocalMarker,
  normalizeJpVocabRefKey,
} from "@/lib/jp-vocab-ref-shared";
import { sortJpVocabWords } from "@/lib/jp-vocab-shared";

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
  return {
    id: Number(row.id),
    word: String(row.word),
    reading: row.reading != null ? String(row.reading) : null,
    meaning: row.meaning != null ? String(row.meaning) : null,
    kind: row.kind === "grammar" ? "grammar" : "word",
    ref_key: row.ref_key != null ? String(row.ref_key) : null,
    cnt_very: Number(row.cnt_very) || 0,
    cnt_normal: Number(row.cnt_normal) || 0,
    cnt_weak: Number(row.cnt_weak) || 0,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const WORD_SELECT = `SELECT id, word, reading, meaning, kind, ref_key,
  cnt_very, cnt_normal, cnt_weak, created_at, updated_at FROM jp_vocab_word`;

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
        kind: normalizeKind(item.kind),
        ref_key: item.ref_key
          ? normalizeJpVocabRefKey(item.ref_key) || null
          : null,
        cnt_very: 0,
        cnt_normal: 0,
        cnt_weak: 0,
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
        `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, ?6, ?6)`
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

function levelColumn(level: JpVocabLevel): string {
  switch (level) {
    case "very":
      return "cnt_very";
    case "normal":
      return "cnt_normal";
    case "weak":
      return "cnt_weak";
  }
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
  const col = levelColumn(level);
  const ts = nowIso();

  if (devStoreEnabled) {
    const idx = devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    const current = devWords[idx];
    const updated: JpVocabWord = {
      ...current,
      cnt_very: level === "very" ? current.cnt_very + 1 : current.cnt_very,
      cnt_normal:
        level === "normal" ? current.cnt_normal + 1 : current.cnt_normal,
      cnt_weak: level === "weak" ? current.cnt_weak + 1 : current.cnt_weak,
      updated_at: ts,
    };
    devWords[idx] = updated;
    return { ok: true, word: updated };
  }

  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET ${col} = ${col} + 1, updated_at = ?1
       WHERE id = ?2`
    )
    .bind(ts, wordId)
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

export type ResetJpVocabReviewsResult =
  | { ok: true; words: JpVocabWord[] }
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
        updated_at: ts,
      };
    }
    return { ok: true, words: sortJpVocabWords(devWords) };
  }

  await db
    .prepare(
      `UPDATE jp_vocab_word
       SET cnt_very = 0, cnt_normal = 0, cnt_weak = 0, updated_at = ?1`
    )
    .bind(ts)
    .run();

  const words = await listJpVocabWords(db);
  return { ok: true, words };
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
        kind: item.kind,
        ref_key: item.ref_key,
        cnt_very: 0,
        cnt_normal: 0,
        cnt_weak: 0,
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
          `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, ?6, ?6)`
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
