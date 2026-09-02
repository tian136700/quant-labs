import "server-only";

import {
  ensureEnVocabWordSchema,
  peekEnVocabDailyDisplayOrderIds,
} from "@/lib/en-vocab-db";
import { sortEnVocabFillRowsByDailyOrder } from "@/lib/en-vocab-fill-daily-priority";
import { enVocabUsageMissingWhereSql } from "@/lib/en-vocab-fill-usage";
import { enVocabExampleSentencesNeedFill } from "@/lib/en-vocab-example-sentences-ai";
import { enVocabLemmaLooksLikeGrammar } from "@/lib/en-vocab-kind-detect";
import { enVocabUsageHasCompleteFrequency } from "@/lib/en-vocab-usage-ai";

const EN_FILL_ROW_SELECT = `id, word, kind, reading, meaning, pos, category, usage, example_sentences`;

export type EnVocabFillNextCandidate = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  category: string | null;
  usage: string | null;
  example_sentences: string | null;
  daily_seq: number | null;
  reclassify_to_grammar?: boolean;
};

type EnVocabFillRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  category: string | null;
  usage: string | null;
  example_sentences: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t || null;
}

function enRowNeedsAnyFill(row: EnVocabFillRow): boolean {
  const kind = String(row.kind || "word");
  const word = String(row.word || "");
  if (kind === "word" && enVocabLemmaLooksLikeGrammar(word)) return true;
  if (kind !== "grammar") {
    if (!trimOrNull(row.reading)) return true;
    if (!trimOrNull(row.meaning) || !trimOrNull(row.pos)) return true;
  }
  const usage = trimOrNull(row.usage);
  if (!usage || !enVocabUsageHasCompleteFrequency(usage)) return true;
  if (enVocabExampleSentencesNeedFill(usage, row.example_sentences)) return true;
  return false;
}

function buildEnVocabBroadMissingWhereSql(): string {
  const usageGap = enVocabUsageMissingWhereSql(null);
  return `(
    (kind != 'grammar' AND (reading IS NULL OR TRIM(reading) = ''))
    OR (kind != 'grammar' AND (
      meaning IS NULL OR TRIM(meaning) = ''
      OR pos IS NULL OR TRIM(pos) = ''
    ))
    OR ${usageGap}
    OR (
      usage IS NOT NULL AND TRIM(usage) != ''
      AND (example_sentences IS NULL OR TRIM(example_sentences) = '')
    )
  )`;
}

async function queryEnVocabFillRows(
  db: D1Database,
  sql: string,
  bind?: number
): Promise<EnVocabFillRow[]> {
  const stmt = db.prepare(sql);
  const result = await (bind != null ? stmt.bind(bind) : stmt).all<EnVocabFillRow>();
  return result.results ?? [];
}

function finalizeEnCandidate(
  row: EnVocabFillRow & { daily_seq: number | null }
): EnVocabFillNextCandidate {
  const word = String(row.word || "");
  let kind = String(row.kind || "word");
  let reclassify_to_grammar = false;
  if (kind !== "grammar" && enVocabLemmaLooksLikeGrammar(word)) {
    reclassify_to_grammar = true;
    kind = "grammar";
  }
  return {
    id: Number(row.id),
    word,
    kind,
    reading: trimOrNull(row.reading),
    meaning: trimOrNull(row.meaning),
    pos: trimOrNull(row.pos),
    category: trimOrNull(row.category),
    usage: trimOrNull(row.usage),
    example_sentences: trimOrNull(row.example_sentences),
    daily_seq: row.daily_seq,
    ...(reclassify_to_grammar ? { reclassify_to_grammar: true } : {}),
  };
}

/**
 * 定时补全探活：单次 SQL（无 COUNT），任一字段缺则进队；按日序取 1 条。
 */
export async function pickNextEnVocabFillCandidate(
  db: D1Database
): Promise<EnVocabFillNextCandidate | null> {
  await ensureEnVocabWordSchema(db);
  const orderIds = await peekEnVocabDailyDisplayOrderIds(db);
  const scanCap = 32;

  const broadSql = `SELECT ${EN_FILL_ROW_SELECT}
    FROM en_vocab_word
    WHERE ${buildEnVocabBroadMissingWhereSql()}
    ORDER BY id
    LIMIT ?1`;

  let rows = (await queryEnVocabFillRows(db, broadSql, scanCap)).filter(
    enRowNeedsAnyFill
  );

  if (rows.length === 0) {
    const exSql = `SELECT ${EN_FILL_ROW_SELECT}
      FROM en_vocab_word
      WHERE usage IS NOT NULL AND TRIM(usage) != ''
        AND example_sentences IS NOT NULL AND TRIM(example_sentences) != ''
      ORDER BY id
      LIMIT ?1`;
    rows = (await queryEnVocabFillRows(db, exSql, scanCap)).filter((row) =>
      enVocabExampleSentencesNeedFill(
        trimOrNull(row.usage),
        row.example_sentences
      )
    );
  }

  if (rows.length === 0) {
    const kindSql = `SELECT ${EN_FILL_ROW_SELECT}
      FROM en_vocab_word
      WHERE kind = 'word'
      ORDER BY id
      LIMIT ?1`;
    rows = (await queryEnVocabFillRows(db, kindSql, scanCap)).filter((row) =>
      enVocabLemmaLooksLikeGrammar(String(row.word || ""))
    );
  }

  if (rows.length === 0) return null;

  const sorted = sortEnVocabFillRowsByDailyOrder(rows, orderIds, 1);
  const top = sorted[0];
  if (!top) return null;
  return finalizeEnCandidate(top);
}
