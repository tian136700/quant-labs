import { ensureEnVocabWordSchema } from "@/lib/en-vocab-db/helpers";
import { peekEnVocabDailyDisplayOrderIds } from "@/lib/en-vocab-db";
import {
  enVocabLemmaLooksLikeGrammar,
  type EnVocabKindSuggest,
} from "@/lib/en-vocab-kind-detect";
import { sortEnVocabFillRowsByDailyOrder } from "@/lib/en-vocab-fill-daily-priority";

export type EnVocabMissingKindRow = {
  id: number;
  word: string;
  kind: string;
  suggest_kind: EnVocabKindSuggest;
  reason: string;
  daily_seq?: number | null;
};

export type EnVocabFillKindApplyItem = {
  word_id: number;
  kind: "grammar";
  source?: string | null;
};

export type EnVocabFillKindApplied = {
  id: number;
  word: string;
  kind: "grammar";
  previous_kind: string;
};

export type EnVocabFillKindResult = {
  updated: number;
  applied: EnVocabFillKindApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
};

function classifyReason(word: string): string {
  const w = word.trim();
  if (/\b(?:both|either|neither|not\s+only)\b/i.test(w) && /[A-C]/.test(w)) {
    return "ab_slot_pattern";
  }
  if (
    /\b(?:present|past|future)\s+(?:simple|perfect|continuous|progressive)/i.test(
      w
    ) ||
    /\b(?:passive\s+voice|conditional|reported\s+speech|relative\s+clause)\b/i.test(
      w
    )
  ) {
    return "tense_or_clause_name";
  }
  if (/(?:…|\.{3}|～|~)/.test(w)) return "ellipsis_slot";
  if (/(?:-{3,}|_{3,}|—{2,}|－{2,})/.test(w)) return "dash_blank_slot";
  if (
    /\b(?:somebody|someone|something|somewhere|sb\.?|sth\.?)\b/i.test(w)
  ) {
    return "indefinite_slot";
  }
  if (/(?:^|[\s(/])[A-C](?:[\s)/]|$)/.test(w)) return "letter_slot";
  return "grammar_like";
}

/**
 * 扫「kind=word 但词条像语法/句型」的误标项。
 */
export async function scanEnVocabMisclassifiedKind(
  db: D1Database,
  options: { limit?: number } = {}
): Promise<{
  missing: EnVocabMissingKindRow[];
  total_missing: number;
}> {
  await ensureEnVocabWordSchema(db);
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.min(Math.floor(options.limit), 100)
      : 20;

  const scanCap = Math.max(limit * 20, 200);
  const { results } = await db
    .prepare(
      `SELECT id, word, kind FROM en_vocab_word
       WHERE kind != 'grammar'
       ORDER BY id ASC
       LIMIT ?1`
    )
    .bind(scanCap)
    .all<{ id: number; word: string; kind: string }>();

  const candidates: EnVocabMissingKindRow[] = [];
  for (const row of results || []) {
    const word = String(row.word || "").trim();
    if (!word || !enVocabLemmaLooksLikeGrammar(word)) continue;
    candidates.push({
      id: Number(row.id),
      word,
      kind: String(row.kind || "word"),
      suggest_kind: "grammar",
      reason: classifyReason(word),
    });
  }

  const orderIds = await peekEnVocabDailyDisplayOrderIds(db);
  const missing = sortEnVocabFillRowsByDailyOrder(
    candidates,
    orderIds,
    limit
  );
  return { missing, total_missing: candidates.length };
}

/**
 * 把误标单词改为 grammar；清音标（语法不展示 IPA）。
 */
export async function applyEnVocabKindUpdates(
  db: D1Database,
  updates: EnVocabFillKindApplyItem[],
  options: { dryRun?: boolean; defaultSource?: string | null } = {}
): Promise<EnVocabFillKindResult> {
  await ensureEnVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const applied: EnVocabFillKindApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    if (!Number.isInteger(wordId) || wordId <= 0) continue;
    if (item.kind !== "grammar") {
      skipped.push({
        id: wordId,
        word: String(wordId),
        reason: "kind_not_grammar",
      });
      continue;
    }

    const row = await db
      .prepare(`SELECT id, word, kind FROM en_vocab_word WHERE id = ?1`)
      .bind(wordId)
      .first<{ id: number; word: string; kind: string }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }

    const word = String(row.word || "").trim();
    const prevKind = String(row.kind || "word");
    if (prevKind === "grammar") {
      skipped.push({ id: wordId, word, reason: "already_grammar" });
      continue;
    }
    if (!enVocabLemmaLooksLikeGrammar(word)) {
      skipped.push({ id: wordId, word, reason: "not_grammar_like" });
      continue;
    }

    if (!dryRun) {
      await db
        .prepare(
          `UPDATE en_vocab_word
           SET kind = 'grammar',
               reading = NULL,
               reading_source = NULL,
               updated_at = datetime('now')
           WHERE id = ?1 AND kind != 'grammar'`
        )
        .bind(wordId)
        .run();
    }

    updated += 1;
    applied.push({
      id: wordId,
      word,
      kind: "grammar",
      previous_kind: prevKind,
    });
  }

  return { updated, applied, skipped, dry_run: dryRun };
}
