import "server-only";

import type { EnVocabLevel, EnVocabWord } from "@/lib/types";
import {
  aggregateEnVocabUsageLevels,
  isEnVocabLevel,
  isEnVocabWordReviewLocked,
} from "@/lib/en-vocab-review";
import { listEnVocabUsagePointsForDisplay } from "@/lib/en-vocab-usage-examples-display";
import { enVocabDbState } from "./state";
import {
  WORD_SELECT_LIST,
  ensureVocabWordSchema,
  mapReviewWordRow,
  seedIfEmpty,
  stripEnVocabWordNotesForList,
} from "./helpers";
import {
  persistEnVocabReviewUpdate,
  type RecordEnVocabReviewOptions,
  type RecordEnVocabReviewResult,
} from "./words";

/** 老师抽查卡：按用法勾选 → 汇总总体后写入 cnt_* / last_review_* / last_usage_levels */
export async function recordEnVocabReviewWithUsageLevels(
  db: D1Database,
  wordId: number,
  usageLevels: EnVocabLevel[],
  options?: RecordEnVocabReviewOptions
): Promise<RecordEnVocabReviewResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  if (!Array.isArray(usageLevels) || !usageLevels.length) {
    return { ok: false, error: "usage_levels_invalid" };
  }
  if (!usageLevels.every(isEnVocabLevel)) {
    return { ok: false, error: "usage_levels_invalid" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  let current: EnVocabWord;
  if (enVocabDbState.devStoreEnabled) {
    const idx = enVocabDbState.devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    current = stripEnVocabWordNotesForList(enVocabDbState.devWords[idx]);
  } else {
    const row = await db
      .prepare(`${WORD_SELECT_LIST} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();
    if (!row) return { ok: false, error: "not_found" };
    current = mapReviewWordRow(row);
  }

  if (isEnVocabWordReviewLocked(current)) {
    return { ok: false, error: "review_locked" };
  }

  // LIST/mapReviewWordRow 故意把 usage 正文置 null（防 1102）。
  // 校验用法条数必须另读 usage 列，否则 expected 永远是 0 → 多用法词必拒 usage_levels_count_mismatch。
  let usageText: string | null = null;
  if (enVocabDbState.devStoreEnabled) {
    const full = enVocabDbState.devWords.find((w) => w.id === wordId);
    usageText = full?.usage ?? null;
  } else {
    const usageRow = await db
      .prepare(`SELECT usage FROM en_vocab_word WHERE id = ?1`)
      .bind(wordId)
      .first<{ usage: string | null }>();
    usageText =
      usageRow?.usage != null && String(usageRow.usage).trim()
        ? String(usageRow.usage)
        : null;
  }

  const expectedCount = listEnVocabUsagePointsForDisplay(usageText).points
    .length;
  if (expectedCount > 0 && usageLevels.length !== expectedCount) {
    return {
      ok: false,
      error: `usage_levels_count_mismatch:expected=${expectedCount}:got=${usageLevels.length}`,
    };
  }
  if (expectedCount === 0 && usageLevels.length !== 1) {
    return {
      ok: false,
      error: `usage_levels_count_mismatch:expected=0:got=${usageLevels.length}`,
    };
  }

  let overall: EnVocabLevel;
  try {
    overall = aggregateEnVocabUsageLevels(usageLevels);
  } catch {
    return { ok: false, error: "usage_levels_invalid" };
  }

  return persistEnVocabReviewUpdate(
    db,
    wordId,
    current,
    overall,
    usageLevels,
    options
  );
}
