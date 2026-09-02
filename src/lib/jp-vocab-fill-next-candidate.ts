import "server-only";

import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import { JP_VOCAB_MEANING_MISSING_SQL } from "@/lib/jp-vocab-fill-meaning";
import {
  countJpVocabUsagePoints,
  isJpVocabConjugationGrammar,
  isJpVocabGrammarUsageExamplesPairComplete,
} from "@/lib/jp-vocab-usage-ai";
import {
  hasJpVocabConnection,
  parseJpVocabConnectionTableRows,
} from "@/lib/jp-vocab-connection-ai";
import { parseJpVocabExampleSentenceItems } from "@/lib/jp-vocab-example-sentences";
import {
  clampJpVocabFrequency,
  JP_VOCAB_FREQUENCY_MAX,
  JP_VOCAB_FREQUENCY_MIN,
} from "@/lib/jp-vocab-frequency";
import { hasJpVocabRelatedCompounds } from "@/lib/jp-vocab-related-compounds";

const JP_FILL_ROW_SELECT = `id, word, kind, reading, meaning, pos, usage, connection,
  example_sentences, related_compounds, related_compounds_source,
  oral_frequency, exam_frequency, course_label`;

export type JpVocabFillNextCandidate = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  usage: string | null;
  connection: string | null;
  example_sentences: string | null;
  related_compounds: string | null;
  oral_frequency: number | null;
  exam_frequency: number | null;
  course_label: string | null;
  need_usage?: boolean;
  need_examples?: boolean;
  need_connection?: boolean;
  need_oral_frequency?: boolean;
  need_exam_frequency?: boolean;
};

type JpVocabFillRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  usage: string | null;
  connection: string | null;
  example_sentences: string | null;
  related_compounds: string | null;
  related_compounds_source: string | null;
  oral_frequency: number | null;
  exam_frequency: number | null;
  course_label: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t || null;
}

function freqNeedsFill(value: number | null | undefined): boolean {
  const n = clampJpVocabFrequency(value);
  return n == null;
}

function wordHasKanji(word: string): boolean {
  return /[\u4E00-\u9FFF々]/.test(word);
}

function jpWordNeedsFill(row: JpVocabFillRow): boolean {
  if (String(row.kind) !== "word") return false;
  if (!trimOrNull(row.reading)) return true;
  if (
    row.meaning == null ||
    String(row.meaning).trim() === "" ||
    row.meaning === "【释义】" ||
    row.meaning === "【意思】" ||
    row.meaning === "释义"
  ) {
    return true;
  }
  if (!trimOrNull(row.pos)) return true;
  if (!trimOrNull(row.example_sentences)) return true;
  if (freqNeedsFill(row.oral_frequency)) return true;
  if (freqNeedsFill(row.exam_frequency)) return true;
  if (
    wordHasKanji(String(row.word || "")) &&
    !hasJpVocabRelatedCompounds(row.related_compounds) &&
    !trimOrNull(row.related_compounds_source)
  ) {
    return true;
  }
  return false;
}

function jpGrammarNeedsFill(row: JpVocabFillRow): boolean {
  if (String(row.kind) !== "grammar") return false;
  const word = String(row.word || "");
  const usage = trimOrNull(row.usage);
  const examples = trimOrNull(row.example_sentences);
  const connection = trimOrNull(row.connection);
  return !isJpVocabGrammarUsageExamplesPairComplete(
    word,
    usage,
    examples,
    connection
  );
}

function computeJpGrammarNeedFlags(row: JpVocabFillRow): {
  need_usage: boolean;
  need_examples: boolean;
  need_connection: boolean;
} {
  const word = String(row.word || "");
  const usage = trimOrNull(row.usage);
  const examples = trimOrNull(row.example_sentences);
  const connection = trimOrNull(row.connection);
  const isConj = isJpVocabConjugationGrammar(word);
  const usageN = countJpVocabUsagePoints(usage);
  const exN = examples ? parseJpVocabExampleSentenceItems(examples).length : 0;
  const need_usage = isConj ? false : !usage;
  const need_examples = isConj
    ? !examples
    : !examples || (usageN === 1 ? exN < 3 : usageN > 1 && exN < usageN);
  const need_connection = isConj
    ? !parseJpVocabConnectionTableRows(connection)
    : !hasJpVocabConnection(connection);
  return { need_usage, need_examples, need_connection };
}

function buildJpVocabBroadMissingWhereSql(): string {
  return `(
    (kind = 'word' AND (
      reading IS NULL OR TRIM(reading) = ''
      OR ${JP_VOCAB_MEANING_MISSING_SQL}
      OR pos IS NULL OR TRIM(pos) = ''
      OR example_sentences IS NULL OR TRIM(example_sentences) = ''
      OR oral_frequency IS NULL
      OR oral_frequency < ${JP_VOCAB_FREQUENCY_MIN}
      OR oral_frequency > ${JP_VOCAB_FREQUENCY_MAX}
      OR exam_frequency IS NULL
      OR exam_frequency < ${JP_VOCAB_FREQUENCY_MIN}
      OR exam_frequency > ${JP_VOCAB_FREQUENCY_MAX}
      OR (
        (related_compounds IS NULL OR TRIM(related_compounds) = '')
        AND (related_compounds_source IS NULL OR TRIM(related_compounds_source) = '')
      )
    ))
    OR (kind = 'grammar' AND (
      example_sentences IS NULL OR TRIM(example_sentences) = ''
      OR connection IS NULL OR TRIM(connection) = ''
      OR usage IS NULL OR TRIM(usage) = ''
    ))
  )`;
}

function finalizeJpCandidate(row: JpVocabFillRow): JpVocabFillNextCandidate {
  const kind = String(row.kind || "word");
  const base: JpVocabFillNextCandidate = {
    id: Number(row.id),
    word: String(row.word || ""),
    kind,
    reading: trimOrNull(row.reading),
    meaning: trimOrNull(row.meaning),
    pos: trimOrNull(row.pos),
    usage: trimOrNull(row.usage),
    connection: trimOrNull(row.connection),
    example_sentences: trimOrNull(row.example_sentences),
    related_compounds: trimOrNull(row.related_compounds),
    oral_frequency: clampJpVocabFrequency(row.oral_frequency),
    exam_frequency: clampJpVocabFrequency(row.exam_frequency),
    course_label: trimOrNull(row.course_label),
  };
  if (kind === "grammar") {
    const flags = computeJpGrammarNeedFlags(row);
    return { ...base, ...flags };
  }
  return {
    ...base,
    need_oral_frequency: freqNeedsFill(row.oral_frequency),
    need_exam_frequency: freqNeedsFill(row.exam_frequency),
  };
}

/**
 * 定时补全探活：单次 SQL（无 COUNT），任一字段缺则进队；按 id 取 1 条。
 */
export async function pickNextJpVocabFillCandidate(
  db: D1Database
): Promise<JpVocabFillNextCandidate | null> {
  await ensureJpVocabWordSchema(db);
  const scanCap = 32;

  const sql = `SELECT ${JP_FILL_ROW_SELECT}
    FROM jp_vocab_word
    WHERE ${buildJpVocabBroadMissingWhereSql()}
    ORDER BY id
    LIMIT ?1`;

  const result = await db.prepare(sql).bind(scanCap).all<JpVocabFillRow>();
  const rows = (result.results ?? []).filter(
    (row) => jpWordNeedsFill(row) || jpGrammarNeedsFill(row)
  );

  if (rows.length === 0) return null;

  rows.sort((a, b) => Number(a.id) - Number(b.id));
  return finalizeJpCandidate(rows[0]!);
}
