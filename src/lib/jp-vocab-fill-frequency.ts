import "server-only";

import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import {
  buildJpVocabWordFrequencyOnlyAiPrompt,
  clampJpVocabFrequency,
} from "@/lib/jp-vocab-frequency";
import {
  jpVocabGrammarNeedsPerUsageFrequency,
} from "@/lib/jp-vocab-usage-ai";
import {
  buildJpVocabUsageFrequencyOnlyAiPrompt,
  jpVocabUsageHasCompletePerUsageFrequency,
  mergeJpVocabUsageFrequenciesFromAiText,
} from "@/lib/jp-vocab-usage-frequency";

export type JpVocabMissingFrequencyRow = {
  id: number;
  word: string;
  kind: "word" | "grammar";
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  usage: string | null;
  need_oral_frequency: boolean;
  need_exam_frequency: boolean;
  need_usage_frequency: boolean;
  prompt: string;
};

export type JpVocabFrequencyUpdateItem = {
  word_id: number;
  oral_frequency?: number | string | null;
  exam_frequency?: number | string | null;
  /** 语法：整段 usage（已含 [口语n|考试m]）或 AI 原文交给 merge */
  usage?: string | null;
  /** true=usage 已是合并后正文，直接写库；false/缺省=当作 AI 原文 merge */
  usage_merged?: boolean;
  source?: string | null;
};

export type JpVocabFillFrequencyApplied = {
  id: number;
  word: string;
  kind: string;
  oral_frequency?: number | null;
  exam_frequency?: number | null;
  usage?: string | null;
};

export type JpVocabFillFrequencyResult = {
  updated: number;
  applied: JpVocabFillFrequencyApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: JpVocabMissingFrequencyRow[];
  total_missing?: number;
};

export type ListJpVocabMissingFrequencyOptions = {
  limit?: number;
  /** word | grammar | any（默认 any） */
  kind?: "word" | "grammar" | "any";
  wordId?: number;
};

function resolveLimit(raw: number | undefined): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(Math.floor(raw), 20);
}

export async function listJpVocabMissingFrequency(
  db: D1Database,
  options: ListJpVocabMissingFrequencyOptions = {}
): Promise<JpVocabMissingFrequencyRow[]> {
  await ensureJpVocabWordSchema(db);
  const limit = resolveLimit(options.limit);
  const kindFilter =
    options.kind === "word" || options.kind === "grammar"
      ? options.kind
      : "any";
  const wordId =
    typeof options.wordId === "number" &&
    Number.isInteger(options.wordId) &&
    options.wordId > 0
      ? options.wordId
      : null;

  const out: JpVocabMissingFrequencyRow[] = [];

  if (kindFilter === "word" || kindFilter === "any") {
    let sql = `SELECT id, word, kind, reading, meaning, pos, usage,
                      oral_frequency, exam_frequency
               FROM jp_vocab_word
               WHERE kind != 'grammar'
                 AND (
                   oral_frequency IS NULL
                   OR exam_frequency IS NULL
                 )`;
    const binds: number[] = [];
    if (wordId != null) {
      sql += ` AND id = ?${binds.length + 1}`;
      binds.push(wordId);
    }
    sql += ` ORDER BY id`;
    const stmt = db.prepare(sql);
    const result = await (
      binds.length > 0 ? stmt.bind(...binds) : stmt
    ).all<{
      id: number;
      word: string;
      kind: string;
      reading: string | null;
      meaning: string | null;
      pos: string | null;
      usage: string | null;
      oral_frequency: number | null;
      exam_frequency: number | null;
    }>();

    for (const row of result.results ?? []) {
      const needOral = clampJpVocabFrequency(row.oral_frequency) == null;
      const needExam = clampJpVocabFrequency(row.exam_frequency) == null;
      if (!needOral && !needExam) continue;
      out.push({
        id: row.id,
        word: String(row.word),
        kind: "word",
        reading: row.reading,
        meaning: row.meaning,
        pos: row.pos,
        usage: row.usage,
        need_oral_frequency: needOral,
        need_exam_frequency: needExam,
        need_usage_frequency: false,
        prompt: buildJpVocabWordFrequencyOnlyAiPrompt({
          word: String(row.word),
          reading: row.reading,
          meaning: row.meaning,
          pos: row.pos,
        }),
      });
    }
  }

  if (kindFilter === "grammar" || kindFilter === "any") {
    let sql = `SELECT id, word, kind, reading, meaning, pos, usage
               FROM jp_vocab_word
               WHERE kind = 'grammar'
                 AND usage IS NOT NULL
                 AND TRIM(usage) != ''`;
    const binds: number[] = [];
    if (wordId != null) {
      sql += ` AND id = ?${binds.length + 1}`;
      binds.push(wordId);
    }
    sql += ` ORDER BY id`;
    const stmt = db.prepare(sql);
    const result = await (
      binds.length > 0 ? stmt.bind(...binds) : stmt
    ).all<{
      id: number;
      word: string;
      kind: string;
      reading: string | null;
      meaning: string | null;
      pos: string | null;
      usage: string | null;
    }>();

    for (const row of result.results ?? []) {
      const word = String(row.word);
      if (!jpVocabGrammarNeedsPerUsageFrequency(word, row.reading)) continue;
      const usage = String(row.usage ?? "").trim();
      if (!usage) continue;
      if (jpVocabUsageHasCompletePerUsageFrequency(usage)) continue;
      out.push({
        id: row.id,
        word,
        kind: "grammar",
        reading: row.reading,
        meaning: row.meaning,
        pos: row.pos,
        usage,
        need_oral_frequency: false,
        need_exam_frequency: false,
        need_usage_frequency: true,
        prompt: buildJpVocabUsageFrequencyOnlyAiPrompt({
          word,
          reading: row.reading,
          meaning: row.meaning,
          usage,
        }),
      });
    }
  }

  out.sort((a, b) => a.id - b.id);
  if (limit == null) return out;
  return out.slice(0, limit);
}

export async function scanJpVocabMissingFrequency(
  db: D1Database,
  options: ListJpVocabMissingFrequencyOptions = {}
): Promise<{
  missing: JpVocabMissingFrequencyRow[];
  total_missing: number;
}> {
  const all = await listJpVocabMissingFrequency(db, {
    ...options,
    limit: undefined,
  });
  const limit = resolveLimit(options.limit) ?? 1;
  return {
    missing: all.slice(0, limit),
    total_missing: all.length,
  };
}

export async function applyJpVocabFrequencyUpdates(
  db: D1Database,
  updates: JpVocabFrequencyUpdateItem[],
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillFrequencyResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const applied: JpVocabFillFrequencyApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    if (!Number.isInteger(wordId) || wordId <= 0) continue;

    const row = await db
      .prepare(
        `SELECT id, word, kind, reading, usage, oral_frequency, exam_frequency
         FROM jp_vocab_word WHERE id = ?1`
      )
      .bind(wordId)
      .first<{
        id: number;
        word: string;
        kind: string;
        reading: string | null;
        usage: string | null;
        oral_frequency: number | null;
        exam_frequency: number | null;
      }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }

    const isGrammar = String(row.kind) === "grammar";

    if (isGrammar) {
      const usageRaw = String(item.usage ?? "").trim();
      if (!usageRaw) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "usage_required",
        });
        continue;
      }
      if (!jpVocabGrammarNeedsPerUsageFrequency(String(row.word), row.reading)) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "grammar_no_per_usage_freq",
        });
        continue;
      }
      const existing = String(row.usage ?? "").trim();
      if (!existing) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "empty_usage",
        });
        continue;
      }

      let nextUsage = usageRaw;
      if (!item.usage_merged) {
        const merged = mergeJpVocabUsageFrequenciesFromAiText(existing, usageRaw);
        if (!merged.ok) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: `merge_failed:${merged.reason}`,
          });
          continue;
        }
        nextUsage = merged.usage;
      } else if (!jpVocabUsageHasCompletePerUsageFrequency(nextUsage)) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "incomplete_usage_frequency",
        });
        continue;
      }

      if (nextUsage === existing) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "unchanged",
        });
        continue;
      }

      if (!dryRun) {
        await db
          .prepare(
            `UPDATE jp_vocab_word
             SET usage = ?1, updated_at = datetime('now')
             WHERE id = ?2 AND kind = 'grammar'`
          )
          .bind(nextUsage, wordId)
          .run();
      }
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        kind: "grammar",
        usage: nextUsage,
      });
      continue;
    }

    const nextOral = clampJpVocabFrequency(item.oral_frequency);
    const nextExam = clampJpVocabFrequency(item.exam_frequency);
    if (nextOral == null && nextExam == null) {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "frequency_required",
      });
      continue;
    }

    const writeOral =
      nextOral != null && clampJpVocabFrequency(row.oral_frequency) == null
        ? nextOral
        : null;
    const writeExam =
      nextExam != null && clampJpVocabFrequency(row.exam_frequency) == null
        ? nextExam
        : null;
    if (writeOral == null && writeExam == null) {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "already_has_frequency",
      });
      continue;
    }

    if (!dryRun) {
      await db
        .prepare(
          `UPDATE jp_vocab_word
           SET oral_frequency = CASE
                 WHEN ?1 IS NOT NULL AND oral_frequency IS NULL THEN ?1
                 ELSE oral_frequency
               END,
               exam_frequency = CASE
                 WHEN ?2 IS NOT NULL AND exam_frequency IS NULL THEN ?2
                 ELSE exam_frequency
               END,
               updated_at = datetime('now')
           WHERE id = ?3 AND kind != 'grammar'`
        )
        .bind(writeOral, writeExam, wordId)
        .run();
    }
    updated += 1;
    applied.push({
      id: wordId,
      word: String(row.word),
      kind: String(row.kind),
      oral_frequency: writeOral ?? clampJpVocabFrequency(row.oral_frequency),
      exam_frequency: writeExam ?? clampJpVocabFrequency(row.exam_frequency),
    });
  }

  return { updated, applied, skipped, dry_run: dryRun };
}
