import type {
  JpVocabLevel,
  JpVocabUploadInput,
  JpVocabWord,
} from "@/lib/types";

const SEED_WORDS: JpVocabUploadInput[] = [];

let devStoreEnabled = false;
const devWords: JpVocabWord[] = [];
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

function mapRow(row: Record<string, unknown>): JpVocabWord {
  return {
    id: Number(row.id),
    word: String(row.word),
    reading: row.reading != null ? String(row.reading) : null,
    meaning: row.meaning != null ? String(row.meaning) : null,
    cnt_very: Number(row.cnt_very) || 0,
    cnt_normal: Number(row.cnt_normal) || 0,
    cnt_weak: Number(row.cnt_weak) || 0,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** 复习优先级：不熟悉次数降序 → 一般次数降序 → 单词名 */
function sortWords(words: JpVocabWord[]): JpVocabWord[] {
  return [...words].sort((a, b) => {
    if (b.cnt_weak !== a.cnt_weak) return b.cnt_weak - a.cnt_weak;
    if (b.cnt_normal !== a.cnt_normal) return b.cnt_normal - a.cnt_normal;
    return a.word.localeCompare(b.word, "ja");
  });
}

export function sortJpVocabWords(words: JpVocabWord[]): JpVocabWord[] {
  return sortWords(words);
}

async function seedIfEmpty(db: D1Database): Promise<void> {
  if (devStoreEnabled) {
    if (devSeeded || devWords.length > 0) return;
    const ts = nowIso();
    for (const item of SEED_WORDS) {
      devWords.push({
        id: devNextId++,
        word: item.word,
        reading: item.reading?.trim() || null,
        meaning: item.meaning?.trim() || null,
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
  const stmts = SEED_WORDS.map((item) =>
    db
      .prepare(
        `INSERT INTO jp_vocab_word (word, reading, meaning, cnt_very, cnt_normal, cnt_weak, created_at, updated_at)
         VALUES (?1, ?2, ?3, 0, 0, 0, ?4, ?4)`
      )
      .bind(
        item.word,
        item.reading?.trim() || null,
        item.meaning?.trim() || null,
        ts
      )
  );
  await db.batch(stmts);
}

export async function listJpVocabWords(db: D1Database): Promise<JpVocabWord[]> {
  await seedIfEmpty(db);

  if (devStoreEnabled) {
    return sortWords(devWords);
  }

  const result = await db
    .prepare(
      `SELECT id, word, reading, meaning, cnt_very, cnt_normal, cnt_weak, created_at, updated_at
       FROM jp_vocab_word
       ORDER BY cnt_weak DESC, cnt_normal DESC, word COLLATE NOCASE ASC`
    )
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
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
    .prepare(
      `SELECT id, word, reading, meaning, cnt_very, cnt_normal, cnt_weak, created_at, updated_at
       FROM jp_vocab_word WHERE id = ?1`
    )
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
    return { ok: true, words: sortWords(devWords) };
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
  replace = false
): Promise<UploadJpVocabWordsResult> {
  const cleaned = words
    .map((w) => ({
      word: normalizeWord(w.word),
      reading: (w.reading || "").trim() || null,
      meaning: (w.meaning || "").trim() || null,
    }))
    .filter((w) => w.word);

  if (!cleaned.length) {
    return { ok: false, error: "words_empty" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

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
          `INSERT INTO jp_vocab_word (word, reading, meaning, cnt_very, cnt_normal, cnt_weak, created_at, updated_at)
           VALUES (?1, ?2, ?3, 0, 0, 0, ?4, ?4)`
        )
        .bind(item.word, item.reading, item.meaning, ts)
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
