import "server-only";

import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import { validateJpVocabExampleSentencesAiOutput } from "@/lib/jp-vocab-example-sentences-ai";
import {
  buildJpVocabUsageAiPrompt,
  JP_VOCAB_USAGE_UPLOAD_SPEC,
  normalizeJpVocabUsageSource,
  normalizeJpVocabUsageText,
  validateJpVocabUsageAiOutput,
} from "@/lib/jp-vocab-usage-ai";

export type JpVocabMissingUsageRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  /** 已有用法时仍可成对重写（缺例句） */
  usage: string | null;
  need_usage: boolean;
  need_examples: boolean;
  prompt: string;
};

export type JpVocabFillUsageApplied = {
  id: number;
  word: string;
  usage: string;
  usage_source: string | null;
  example_sentences?: string | null;
  example_sentences_source?: string | null;
};

export type JpVocabFillUsageResult = {
  updated: number;
  applied: JpVocabFillUsageApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: JpVocabMissingUsageRow[];
  total_missing?: number;
  upload_spec?: typeof JP_VOCAB_USAGE_UPLOAD_SPEC;
  /** clear_grammar_examples 清空条数 */
  cleared?: number;
};

export type ListJpVocabMissingUsageOptions = {
  limit?: number;
  /** 只扫这一条（--word-id 清完后定点重补，避免误补 list 里别的词） */
  wordId?: number;
};

/** 缺用法或缺例句（成对一次补） */
export async function countJpVocabGrammarMissingUsage(
  db: D1Database
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM jp_vocab_word
       WHERE kind = 'grammar'
         AND (
           (usage IS NULL OR usage = '')
           OR (example_sentences IS NULL OR example_sentences = '')
         )`
    )
    .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listJpVocabGrammarMissingUsage(
  db: D1Database,
  options: ListJpVocabMissingUsageOptions = {}
): Promise<JpVocabMissingUsageRow[]> {
  await ensureJpVocabWordSchema(db);
  const rawLimit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;
  const limit = rawLimit == null ? null : Math.min(rawLimit, 20);
  const wordId =
    typeof options.wordId === "number" &&
    Number.isInteger(options.wordId) &&
    options.wordId > 0
      ? options.wordId
      : null;

  let sql = `SELECT id, word, kind, reading, meaning, usage, example_sentences
       FROM jp_vocab_word
       WHERE kind = 'grammar'
         AND (
           (usage IS NULL OR usage = '')
           OR (example_sentences IS NULL OR example_sentences = '')
         )`;
  const binds: number[] = [];
  if (wordId != null) {
    sql += ` AND id = ?${binds.length + 1}`;
    binds.push(wordId);
  }
  sql += ` ORDER BY id`;
  if (limit != null) {
    sql += ` LIMIT ?${binds.length + 1}`;
    binds.push(limit);
  }

  const stmt = db.prepare(sql);
  const result = await (
    binds.length > 0 ? stmt.bind(...binds) : stmt
  ).all<{
    id: number;
    word: string;
    kind: string;
    reading: string | null;
    meaning: string | null;
    usage: string | null;
    example_sentences: string | null;
  }>();

  return (result.results ?? []).map((row) => {
    const word = String(row.word);
    const reading =
      row.reading != null ? String(row.reading).trim() || null : null;
    const meaning =
      row.meaning != null ? String(row.meaning).trim() || null : null;
    const usage =
      row.usage != null ? String(row.usage).trim() || null : null;
    const examples =
      row.example_sentences != null
        ? String(row.example_sentences).trim() || null
        : null;
    const need_usage = !usage;
    const need_examples = !examples;
    return {
      id: Number(row.id),
      word,
      kind: "grammar",
      reading,
      meaning,
      usage,
      need_usage,
      need_examples,
      prompt: buildJpVocabUsageAiPrompt({
        word,
        kind: "grammar",
        reading,
        meaning,
      }),
    };
  });
}

export async function scanJpVocabGrammarMissingUsage(
  db: D1Database,
  options: ListJpVocabMissingUsageOptions = {}
): Promise<JpVocabFillUsageResult> {
  const [missing, total_missing] = await Promise.all([
    listJpVocabGrammarMissingUsage(db, options),
    countJpVocabGrammarMissingUsage(db),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
    upload_spec: JP_VOCAB_USAGE_UPLOAD_SPEC,
  };
}

/**
 * 清空全部语法例句（及来源）。单词不动。
 * 用于按用法 1:1 重造前清场。
 */
export async function clearAllJpVocabGrammarExampleSentences(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillUsageResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM jp_vocab_word
       WHERE kind = 'grammar'
         AND (
           (example_sentences IS NOT NULL AND example_sentences != '')
           OR (example_sentences_source IS NOT NULL AND example_sentences_source != '')
         )`
    )
    .first<{ n: number }>();
  const cleared = Number(countRow?.n ?? 0);

  if (!dryRun && cleared > 0) {
    await db
      .prepare(
        `UPDATE jp_vocab_word
         SET example_sentences = NULL,
             example_sentences_source = NULL,
             updated_at = datetime('now')
         WHERE kind = 'grammar'
           AND (
             (example_sentences IS NOT NULL AND example_sentences != '')
             OR (example_sentences_source IS NOT NULL AND example_sentences_source != '')
           )`
      )
      .run();
  }

  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: dryRun,
    cleared,
    upload_spec: JP_VOCAB_USAGE_UPLOAD_SPEC,
  };
}

/** 清空单条语法的用法+例句，便于中文用法/条数规则修正后重补（一词一次） */
export async function clearJpVocabGrammarPairById(
  db: D1Database,
  wordId: number,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillUsageResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const id = Number(wordId);
  if (!Number.isInteger(id) || id <= 0) {
    return {
      updated: 0,
      applied: [],
      skipped: [{ id: 0, word: String(wordId), reason: "bad_id" }],
      dry_run: dryRun,
      cleared: 0,
      upload_spec: JP_VOCAB_USAGE_UPLOAD_SPEC,
    };
  }
  const row = await db
    .prepare(`SELECT id, word, kind FROM jp_vocab_word WHERE id = ?1`)
    .bind(id)
    .first<{ id: number; word: string; kind: string }>();
  if (!row || row.kind !== "grammar") {
    return {
      updated: 0,
      applied: [],
      skipped: [
        {
          id,
          word: row ? String(row.word) : String(id),
          reason: row ? "not_grammar" : "not_found",
        },
      ],
      dry_run: dryRun,
      cleared: 0,
      upload_spec: JP_VOCAB_USAGE_UPLOAD_SPEC,
    };
  }
  if (!dryRun) {
    await db
      .prepare(
        `UPDATE jp_vocab_word
         SET usage = NULL,
             usage_source = NULL,
             example_sentences = NULL,
             example_sentences_source = NULL,
             updated_at = datetime('now')
         WHERE id = ?1 AND kind = 'grammar'`
      )
      .bind(id)
      .run();
  }
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: dryRun,
    cleared: 1,
    upload_spec: JP_VOCAB_USAGE_UPLOAD_SPEC,
  };
}

async function updateUsageAndExamples(
  db: D1Database,
  wordId: number,
  usage: string,
  usageSource: string | null,
  exampleSentences: string | null,
  exampleSource: string | null,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  if (exampleSentences) {
    const result = await db
      .prepare(
        `UPDATE jp_vocab_word
         SET usage = ?1,
             usage_source = ?2,
             example_sentences = ?3,
             example_sentences_source = ?4,
             updated_at = datetime('now')
         WHERE id = ?5 AND kind = 'grammar'`
      )
      .bind(
        usage.trim(),
        usageSource,
        exampleSentences.trim(),
        exampleSource,
        wordId
      )
      .run();
    return Number(result.meta?.changes ?? 0) > 0;
  }
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET usage = ?1,
           usage_source = ?2,
           updated_at = datetime('now')
       WHERE id = ?3
         AND kind = 'grammar'
         AND (usage IS NULL OR usage = '')`
    )
    .bind(usage.trim(), usageSource, wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export type JpVocabUsageUpdateItem = {
  word_id: number;
  usage: string;
  /** 成对写回：有则一次写 usage+例句 */
  example_sentences?: string | null;
  source?: string | null;
};

export async function applyJpVocabUsageUpdates(
  db: D1Database,
  updates: JpVocabUsageUpdateItem[],
  options: {
    dryRun?: boolean;
    validateFormat?: boolean;
    defaultSource?: string | null;
    force?: boolean;
  } = {}
): Promise<JpVocabFillUsageResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const defaultSource = normalizeJpVocabUsageSource(options.defaultSource);
  const applied: JpVocabFillUsageApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    let usage = String(item.usage ?? "").trim();
    let examples = String(item.example_sentences ?? "").trim() || null;
    if (!Number.isInteger(wordId) || wordId <= 0 || !usage) continue;

    const source =
      normalizeJpVocabUsageSource(item.source) ?? defaultSource;

    const row = await db
      .prepare(
        `SELECT id, word, kind, reading, meaning, usage FROM jp_vocab_word WHERE id = ?1`
      )
      .bind(wordId)
      .first<{
        id: number;
        word: string;
        kind: string;
        reading: string | null;
        meaning: string | null;
        usage: string | null;
      }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }
    if (row.kind !== "grammar") {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "not_grammar",
      });
      continue;
    }

    if (validateFormat) {
      // 付费/自动写回必须成对；人手「手动」可只改用法
      const isManual = source === "手动";
      if (!examples && !isManual) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "invalid_format:examples_required",
        });
        continue;
      }
      if (examples) {
        const usageOk = validateJpVocabUsageAiOutput(usage, {
          word: String(row.word),
          kind: "grammar",
          requireJlptLevel: !isManual,
        });
        if (!usageOk.ok) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: `invalid_format:${usageOk.reason}`,
          });
          continue;
        }
        usage = usageOk.text;
        const exOk = validateJpVocabExampleSentencesAiOutput(examples, {
          word: String(row.word),
          kind: "grammar",
          reading: row.reading,
          meaning: row.meaning,
          usage,
        });
        if (!exOk.ok) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: `invalid_format:${exOk.reason}`,
          });
          continue;
        }
        examples = exOk.text;
      } else {
        const validated = validateJpVocabUsageAiOutput(usage, {
          word: String(row.word),
          kind: "grammar",
          requireJlptLevel: !isManual,
        });
        if (!validated.ok) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: `invalid_format:${validated.reason}`,
          });
          continue;
        }
        usage = validated.text;
      }
    } else {
      usage = normalizeJpVocabUsageText(usage) || usage;
    }

    const changed = await updateUsageAndExamples(
      db,
      wordId,
      usage,
      source,
      examples,
      source,
      dryRun
    );
    if (changed) {
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        usage,
        usage_source: source,
        example_sentences: examples,
        example_sentences_source: examples ? source : null,
      });
    } else {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: examples ? "unchanged" : "already_filled",
      });
    }
  }

  return {
    updated,
    applied,
    skipped,
    dry_run: dryRun,
    upload_spec: JP_VOCAB_USAGE_UPLOAD_SPEC,
  };
}
