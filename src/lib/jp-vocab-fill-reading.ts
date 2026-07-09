import "server-only";

const JISHO_URL = "https://jisho.org/api/v1/search/words?keyword=";
const HTTP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 含汉字或特殊写法，需人工指定（平假名/片假名词条由规则自动推断） */
export const JP_VOCAB_MANUAL_READINGS: Record<string, string> = {
  一つ: "ひとつ",
  二つ: "ふたつ",
  始まる: "はじまる",
  怒る: "おこる",
  守る: "まもる",
  悪い: "わるい",
  無理だ: "むりだ",
  座る: "すわる",
  薬局: "やっきょく",
  暑い: "あつい",
  見る: "みる",
  お金: "おかね",
  事: "こと",
  大家: "おおや",
  "他/ほか": "ほか",
  最近: "さいきん",
  働く: "はたらく",
  昼ごはん: "ひるごはん",
  手: "て",
  鍵屋: "かぎや",
  綺麗だ: "きれいだ",
  寝る: "ねる",
  水道: "すいどう",
  約束: "やくそく",
  一部: "いちぶ",
  悲しい: "かなしい",
  閉める: "しめる",
  食事する: "しょくじする",
  見せる: "みせる",
  生活: "せいかつ",
  好き: "すき",
  好きだ: "すきだ",
};

const KANA_OR_MARK = /^[\u3040-\u309F\u30A0-\u30FFー～〜/\s]+$/;
const HAS_KANJI = /[\u4E00-\u9FFF]/;
const PARENS_NOTE = /^(.+?)[（(][^）)]+[）)]$/;
const DA_ADJ_SUFFIX = /^(.+)だ$/;
const SURU_VERB_SUFFIX = /^(.+)する$/;
const SKIP_PHRASE = /(します|ください|てください|お願い)/;
const MAX_AUTO_READING_CHARS = 9;

export type JpVocabMissingReadingRow = {
  id: number;
  word: string;
  kind: string;
};

export type JpVocabFillReadingApplied = {
  id: number;
  word: string;
  reading: string;
};

export type JpVocabFillReadingResult = {
  updated: number;
  applied: JpVocabFillReadingApplied[];
  skipped: Array<{ id: number; word: string }>;
  skipped_long: Array<{ id: number; word: string }>;
  jisho_errors: number;
  dry_run: boolean;
};

function analyzeWord(word: string): {
  lookup: string;
  suffix: string;
  skipReason: string | null;
} {
  const w = word.trim();
  if (!w) return { lookup: w, suffix: "", skipReason: "empty" };
  if (w.length > MAX_AUTO_READING_CHARS || SKIP_PHRASE.test(w)) {
    return { lookup: w, suffix: "", skipReason: "long_phrase" };
  }

  let lookup = w;
  const parens = PARENS_NOTE.exec(w);
  if (parens) lookup = parens[1].trim();

  let suffix = "";
  const daMatch = DA_ADJ_SUFFIX.exec(lookup);
  if (daMatch) {
    lookup = daMatch[1].trim();
    suffix = "だ";
  }

  return { lookup, suffix, skipReason: null };
}

function attachReadingSuffix(reading: string, suffix: string): string {
  if (!suffix) return reading;
  if (reading.endsWith(suffix)) return reading;
  return reading + suffix;
}

async function lookupJisho(
  word: string,
  cache: Map<string, string | null>,
  delayMs: number
): Promise<{ reading: string | null; hadError: boolean }> {
  if (cache.has(word)) {
    return { reading: cache.get(word) ?? null, hadError: false };
  }

  const url = JISHO_URL + encodeURIComponent(word.trim());
  let reading: string | null = null;
  let hadError = false;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": HTTP_USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = (await res.json()) as {
      data?: Array<{
        japanese?: Array<{ word?: string; reading?: string }>;
      }>;
    };

    for (const item of payload.data ?? []) {
      for (const jp of item.japanese ?? []) {
        const surface = String(jp.word ?? "").trim();
        const kana = String(jp.reading ?? "").trim();
        if (surface === word && kana) {
          reading = kana;
          break;
        }
        if (!surface && kana === word) {
          reading = kana;
          break;
        }
      }
      if (reading) break;
    }

    if (!reading) {
      for (const item of payload.data ?? []) {
        for (const jp of item.japanese ?? []) {
          const surface = String(jp.word ?? "").trim();
          const kana = String(jp.reading ?? "").trim();
          if (surface === word) {
            reading = kana || surface;
            break;
          }
          if (kana && kana === word) {
            reading = kana;
            break;
          }
        }
        if (reading) break;
      }
    }
  } catch {
    hadError = true;
    reading = null;
  }

  cache.set(word, reading);
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { reading, hadError };
}

export async function inferJpVocabReading(
  word: string,
  options: {
    useJisho?: boolean;
    jishoCache?: Map<string, string | null>;
    jishoDelayMs?: number;
  } = {}
): Promise<{
  reading: string | null;
  skipReason: string | null;
  jishoError: boolean;
}> {
  const useJisho = options.useJisho ?? true;
  const jishoCache = options.jishoCache ?? new Map<string, string | null>();
  const jishoDelayMs = options.jishoDelayMs ?? 350;

  const { lookup, suffix, skipReason } = analyzeWord(word);
  if (skipReason) return { reading: null, skipReason, jishoError: false };

  let lookupWord = lookup;
  let suruSuffix = "";
  const suruMatch = SURU_VERB_SUFFIX.exec(lookup);
  if (suruMatch && HAS_KANJI.test(suruMatch[1])) {
    lookupWord = suruMatch[1].trim();
    suruSuffix = "する";
  }

  if (word in JP_VOCAB_MANUAL_READINGS) {
    return { reading: JP_VOCAB_MANUAL_READINGS[word], skipReason: null, jishoError: false };
  }
  if (lookup in JP_VOCAB_MANUAL_READINGS) {
    return {
      reading: attachReadingSuffix(JP_VOCAB_MANUAL_READINGS[lookup], suffix) + suruSuffix,
      skipReason: null,
      jishoError: false,
    };
  }

  if (KANA_OR_MARK.test(lookupWord)) {
    return {
      reading: attachReadingSuffix(lookupWord, suffix) + suruSuffix,
      skipReason: null,
      jishoError: false,
    };
  }

  let reading: string | null = null;
  let jishoError = false;
  if (HAS_KANJI.test(lookupWord)) {
    if (useJisho) {
      const result = await lookupJisho(lookupWord, jishoCache, jishoDelayMs);
      reading = result.reading;
      jishoError = result.hadError;
    }
  } else {
    reading = lookup;
  }

  if (!reading) return { reading: null, skipReason: null, jishoError };
  return {
    reading: attachReadingSuffix(reading, suffix) + suruSuffix,
    skipReason: null,
    jishoError,
  };
}

export async function listJpVocabWordsMissingReading(
  db: D1Database
): Promise<JpVocabMissingReadingRow[]> {
  const result = await db
    .prepare(
      `SELECT id, word, kind FROM jp_vocab_word
       WHERE kind != 'grammar'
         AND (reading IS NULL OR TRIM(reading) = '')
       ORDER BY id`
    )
    .all<{ id: number; word: string; kind: string }>();

  return (result.results ?? []).map((row) => ({
    id: Number(row.id),
    word: String(row.word),
    kind: String(row.kind),
  }));
}

async function updateReadingIfEmpty(
  db: D1Database,
  wordId: number,
  reading: string,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET reading = ?1, updated_at = datetime('now')
       WHERE id = ?2
         AND kind != 'grammar'
         AND (reading IS NULL OR TRIM(reading) = '')`
    )
    .bind(reading.trim(), wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function autoFillJpVocabReadings(
  db: D1Database,
  options: {
    useJisho?: boolean;
    jishoDelayMs?: number;
    dryRun?: boolean;
  } = {}
): Promise<JpVocabFillReadingResult> {
  const dryRun = Boolean(options.dryRun);
  const rows = await listJpVocabWordsMissingReading(db);
  const jishoCache = new Map<string, string | null>();

  const applied: JpVocabFillReadingApplied[] = [];
  const skipped: Array<{ id: number; word: string }> = [];
  const skipped_long: Array<{ id: number; word: string }> = [];
  let jisho_errors = 0;
  let updated = 0;

  for (const row of rows) {
    const { reading, skipReason, jishoError } = await inferJpVocabReading(row.word, {
      useJisho: options.useJisho,
      jishoCache,
      jishoDelayMs: options.jishoDelayMs,
    });
    if (jishoError) jisho_errors += 1;
    if (skipReason === "long_phrase") {
      skipped_long.push({ id: row.id, word: row.word });
      continue;
    }
    if (!reading) {
      skipped.push({ id: row.id, word: row.word });
      continue;
    }

    const changed = await updateReadingIfEmpty(db, row.id, reading, dryRun);
    if (changed) {
      updated += 1;
      applied.push({ id: row.id, word: row.word, reading });
    }
  }

  return {
    updated,
    applied,
    skipped,
    skipped_long,
    jisho_errors,
    dry_run: dryRun,
  };
}

export async function applyJpVocabReadingUpdates(
  db: D1Database,
  updates: Array<{ word_id: number; reading: string }>,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillReadingResult> {
  const dryRun = Boolean(options.dryRun);
  const applied: JpVocabFillReadingApplied[] = [];
  const skipped: Array<{ id: number; word: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    const reading = String(item.reading ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !reading) continue;

    const row = await db
      .prepare(`SELECT id, word FROM jp_vocab_word WHERE id = ?1`)
      .bind(wordId)
      .first<{ id: number; word: string }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId) });
      continue;
    }

    const changed = await updateReadingIfEmpty(db, wordId, reading, dryRun);
    if (changed) {
      updated += 1;
      applied.push({ id: wordId, word: String(row.word), reading });
    } else {
      skipped.push({ id: wordId, word: String(row.word) });
    }
  }

  return {
    updated,
    applied,
    skipped,
    skipped_long: [],
    jisho_errors: 0,
    dry_run: dryRun,
  };
}
