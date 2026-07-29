import "server-only";

import {
  buildJpVocabConnectionOnlyAiPrompt,
  hasJpVocabConnection,
  JP_VOCAB_CONNECTION_UPLOAD_SPEC,
  normalizeJpVocabConnectionSource,
  validateJpVocabConnectionAiOutput,
} from "@/lib/jp-vocab-connection-ai";
import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import { validateJpVocabExampleSentencesAiOutput, normalizeJpVocabExampleSentencesForOnlineApply } from "@/lib/jp-vocab-example-sentences-ai";
import {
  buildJpVocabUsageAiPrompt,
  isJpVocabConjugationGrammar,
  isJpVocabGrammarUsageExamplesPairComplete,
  JP_VOCAB_USAGE_UPLOAD_SPEC,
  normalizeJpVocabUsageSource,
  normalizeJpVocabUsageText,
  validateJpVocabUsageAiOutput,
} from "@/lib/jp-vocab-usage-ai";

export type JpVocabMissingUsageRow = {
  id: number;
  word: string;
  kind: "grammar";
  reading: string | null;
  meaning: string | null;
  /** 已有用法时仍可成对重写（缺例句） */
  usage: string | null;
  /** 已有接序 */
  connection: string | null;
  need_usage: boolean;
  need_examples: boolean;
  need_connection: boolean;
  prompt: string;
};

export type JpVocabFillUsageApplied = {
  id: number;
  word: string;
  usage: string;
  usage_source: string | null;
  example_sentences?: string | null;
  example_sentences_source?: string | null;
  connection?: string | null;
  connection_source?: string | null;
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

/** 缺用法或缺例句（成对一次补）；活用变形课有例句即不算缺 */
export async function countJpVocabGrammarMissingUsage(
  db: D1Database
): Promise<number> {
  const rows = await listJpVocabGrammarMissingUsage(db, {});
  return rows.length;
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

  // 先宽查，再在内存过滤「活用变形已有例句+接序」；LIMIT 必须过滤后再裁，否则会被变形课占满
  let sql = `SELECT id, word, kind, reading, meaning, usage, example_sentences, connection
       FROM jp_vocab_word
       WHERE kind = 'grammar'
         AND (
           (usage IS NULL OR usage = '')
           OR (example_sentences IS NULL OR example_sentences = '')
           OR (connection IS NULL OR connection = '')
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
    usage: string | null;
    example_sentences: string | null;
    connection: string | null;
  }>();

  const mapped = (result.results ?? [])
    .map((row) => {
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
      const connection =
        row.connection != null ? String(row.connection).trim() || null : null;
      if (
        isJpVocabGrammarUsageExamplesPairComplete(
          word,
          usage,
          examples,
          connection
        )
      ) {
        return null;
      }
      const isConj = isJpVocabConjugationGrammar(word);
      const need_usage = isConj ? false : !usage;
      const need_examples = !examples;
      const need_connection = isConj
        ? false
        : !hasJpVocabConnection(connection);
      const onlyConnection =
        need_connection && !need_usage && !need_examples;
      return {
        id: Number(row.id),
        word,
        kind: "grammar" as const,
        reading,
        meaning,
        usage,
        connection,
        need_usage,
        need_examples,
        need_connection,
        prompt: onlyConnection
          ? buildJpVocabConnectionOnlyAiPrompt({
              word,
              kind: "grammar",
              reading,
              meaning,
            })
          : buildJpVocabUsageAiPrompt({
              word,
              kind: "grammar",
              reading,
              meaning,
            }),
      };
    })
    .filter((row): row is JpVocabMissingUsageRow => row != null);

  if (limit == null) return mapped;
  return mapped.slice(0, limit);
}

export type JpVocabMissingConnectionRow = {
  id: number;
  word: string;
  kind: "grammar";
  reading: string | null;
  meaning: string | null;
  usage: string | null;
  connection: string | null;
  prompt: string;
};

/** 句型语法：用法+例句已有、仅缺接序（不含变形课） */
export async function listJpVocabGrammarMissingConnection(
  db: D1Database,
  options: ListJpVocabMissingUsageOptions = {}
): Promise<JpVocabMissingConnectionRow[]> {
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

  let sql = `SELECT id, word, kind, reading, meaning, usage, example_sentences, connection
       FROM jp_vocab_word
       WHERE kind = 'grammar'
         AND (connection IS NULL OR connection = '')
         AND example_sentences IS NOT NULL AND example_sentences != ''
         AND usage IS NOT NULL AND usage != ''`;
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
    usage: string | null;
    example_sentences: string | null;
    connection: string | null;
  }>();

  const mapped = (result.results ?? [])
    .map((row) => {
      const word = String(row.word);
      if (isJpVocabConjugationGrammar(word)) return null;
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
      if (
        isJpVocabGrammarUsageExamplesPairComplete(
          word,
          usage,
          examples,
          row.connection
        )
      ) {
        return null;
      }
      const connection =
        row.connection != null ? String(row.connection).trim() || null : null;
      return {
        id: Number(row.id),
        word,
        kind: "grammar" as const,
        reading,
        meaning,
        usage,
        connection,
        prompt: buildJpVocabConnectionOnlyAiPrompt({
          word,
          kind: "grammar",
          reading,
          meaning,
        }),
      };
    })
    .filter((row): row is JpVocabMissingConnectionRow => row != null);

  if (limit == null) return mapped;
  return mapped.slice(0, limit);
}

export async function countJpVocabGrammarMissingConnection(
  db: D1Database
): Promise<number> {
  const rows = await listJpVocabGrammarMissingConnection(db, {});
  return rows.length;
}

export async function scanJpVocabGrammarMissingConnection(
  db: D1Database,
  options: ListJpVocabMissingUsageOptions = {}
): Promise<{
  missing: JpVocabMissingConnectionRow[];
  total_missing: number;
  upload_spec: typeof JP_VOCAB_CONNECTION_UPLOAD_SPEC;
}> {
  const [missing, total_missing] = await Promise.all([
    listJpVocabGrammarMissingConnection(db, options),
    countJpVocabGrammarMissingConnection(db),
  ]);
  return {
    missing,
    total_missing,
    upload_spec: JP_VOCAB_CONNECTION_UPLOAD_SPEC,
  };
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
             connection = NULL,
             connection_source = NULL,
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

async function updateUsageExamplesAndConnection(
  db: D1Database,
  wordId: number,
  usage: string,
  usageSource: string | null,
  exampleSentences: string | null,
  exampleSource: string | null,
  connection: string | null,
  connectionSource: string | null,
  dryRun: boolean,
  options: { connectionOnly?: boolean } = {}
): Promise<boolean> {
  if (dryRun) return true;
  if (options.connectionOnly) {
    const result = await db
      .prepare(
        `UPDATE jp_vocab_word
         SET connection = ?1,
             connection_source = ?2,
             updated_at = datetime('now')
         WHERE id = ?3 AND kind = 'grammar'`
      )
      .bind(
        connection?.trim() || null,
        connection?.trim() ? connectionSource : null,
        wordId
      )
      .run();
    return Number(result.meta?.changes ?? 0) > 0;
  }
  if (exampleSentences) {
    const result = await db
      .prepare(
        `UPDATE jp_vocab_word
         SET usage = ?1,
             usage_source = ?2,
             example_sentences = ?3,
             example_sentences_source = ?4,
             connection = COALESCE(?5, connection),
             connection_source = COALESCE(?6, connection_source),
             updated_at = datetime('now')
         WHERE id = ?7 AND kind = 'grammar'`
      )
      .bind(
        usage.trim() || null,
        usage.trim() ? usageSource : null,
        exampleSentences.trim(),
        exampleSource,
        connection?.trim() || null,
        connection?.trim() ? connectionSource : null,
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
           connection = COALESCE(?3, connection),
           connection_source = COALESCE(?4, connection_source),
           updated_at = datetime('now')
       WHERE id = ?5
         AND kind = 'grammar'
         AND (usage IS NULL OR usage = '')`
    )
    .bind(
      usage.trim(),
      usageSource,
      connection?.trim() || null,
      connection?.trim() ? connectionSource : null,
      wordId
    )
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export type JpVocabUsageUpdateItem = {
  word_id: number;
  usage: string;
  /** 成对写回：有则一次写 usage+例句 */
  example_sentences?: string | null;
  /** 接序；与用法/例句同次写回 */
  connection?: string | null;
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
    let connectionRaw = String(item.connection ?? "").trim() || null;
    if (!Number.isInteger(wordId) || wordId <= 0) continue;
    const connectionOnly =
      Boolean(connectionRaw) && !usage && !examples;
    if (!usage && !examples && !connectionRaw) continue;

    const source =
      normalizeJpVocabUsageSource(item.source) ?? defaultSource;
    const connectionSource = normalizeJpVocabConnectionSource(source);

    const row = await db
      .prepare(
        `SELECT id, word, kind, reading, meaning, usage, connection FROM jp_vocab_word WHERE id = ?1`
      )
      .bind(wordId)
      .first<{
        id: number;
        word: string;
        kind: string;
        reading: string | null;
        meaning: string | null;
        usage: string | null;
        connection: string | null;
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

    const isConj = isJpVocabConjugationGrammar(String(row.word));
    let connection: string | null = connectionRaw;

    if (validateFormat && connectionRaw) {
      const connOk = validateJpVocabConnectionAiOutput(connectionRaw, {
        word: String(row.word),
        kind: "grammar",
        reading: row.reading,
        meaning: row.meaning,
      });
      if (!connOk.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `invalid_format:connection_invalid:${connOk.reason}`,
        });
        continue;
      }
      connection = connOk.text;
    }

    if (connectionOnly) {
      const changed = await updateUsageExamplesAndConnection(
        db,
        wordId,
        "",
        null,
        null,
        null,
        connection,
        connectionSource,
        dryRun,
        { connectionOnly: true }
      );
      if (changed) {
        updated += 1;
        applied.push({
          id: wordId,
          word: String(row.word),
          usage: String(row.usage ?? ""),
          usage_source: source,
          connection,
          connection_source: connection ? connectionSource : null,
        });
      } else {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "unchanged",
        });
      }
      continue;
    }

    if (validateFormat) {
      // 付费/自动写回必须成对；人手「手动」可只改用法
      // 变形课：只要例句，用法清空
      const isManual = source === "手动";
      if (!isManual && !connection && !isConj) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "invalid_format:connection_required",
        });
        continue;
      }
      if (isConj) {
        if (!examples && !isManual) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: "invalid_format:examples_required",
          });
          continue;
        }
        if (examples) {
          const exOk = validateJpVocabExampleSentencesAiOutput(examples, {
            word: String(row.word),
            kind: "grammar",
            reading: row.reading,
            meaning: row.meaning,
            usage: null,
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
        }
        usage = "";
      } else if (!examples && !isManual) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "invalid_format:examples_required",
        });
        continue;
      } else if (examples) {
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
    } else if (!isConj) {
      usage = normalizeJpVocabUsageText(usage) || usage;
    } else {
      usage = "";
    }

    if (!validateFormat && examples) {
      const normalized = normalizeJpVocabExampleSentencesForOnlineApply(examples, {
        word: String(row.word),
        kind: "grammar",
        reading: row.reading,
        meaning: row.meaning,
        usage: usage || row.usage,
      });
      if (!normalized.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `examples_online_normalize:${normalized.reason}`,
        });
        examples = null;
      } else {
        examples = normalized.text;
      }
    }

    const changed = await updateUsageExamplesAndConnection(
      db,
      wordId,
      usage,
      source,
      examples,
      source,
      connection,
      connectionSource,
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
        connection,
        connection_source: connection ? connectionSource : null,
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
