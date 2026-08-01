import "server-only";

import {
  buildJpVocabConnectionOnlyAiPrompt,
  hasJpVocabConnection,
  normalizeJpVocabConnectionSource,
  validateJpVocabConnectionAiOutput,
} from "@/lib/jp-vocab-connection-ai";
import {
  lookupJpVocabExampleSentences,
  JP_VOCAB_EXAMPLE_SENTENCES_CATALOG,
} from "@/lib/jp-vocab-example-sentences-catalog";
import {
  buildJpVocabExampleSentencesAiPrompt,
  JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  normalizeJpVocabExampleSentencesForOnlineApply,
  validateJpVocabExampleSentencesAiOutput,
} from "@/lib/jp-vocab-example-sentences-ai";
import {
  JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_CATALOG,
  jpVocabExampleSentencesNeedGlossFill,
  normalizeJpVocabExampleSentencesFormat,
  normalizeJpVocabExampleSentencesSource,
  parseJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";
import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import { normalizeJpVocabNaAdjRowsInDb } from "@/lib/jp-vocab-na-adj-db";
import {
  listJpVocabWordsIncompleteExampleFurigana,
  type JpVocabIncompleteFuriganaRow,
} from "@/lib/jp-vocab-example-furigana-scan";
import {
  validateJpVocabRelatedCompoundsAiOutput,
} from "@/lib/jp-vocab-related-compounds";

export type JpVocabMissingExampleSentenceRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  usage: string | null;
  connection: string | null;
  need_examples: boolean;
  need_connection: boolean;
  /** 内置 N5 词表已有例句时非空；本地模型可跳过这些 */
  suggested: string | null;
  /** 可直接喂给本地/远程模型的完整 prompt（含条数与格式规则） */
  prompt: string;
};

export type JpVocabIncompleteExampleGlossRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  example_sentences: string;
  missing_gloss_count: number;
};

export type JpVocabFillExampleSentenceApplied = {
  id: number;
  word: string;
  example_sentences: string;
  example_sentences_source: string | null;
  connection?: string | null;
  connection_source?: string | null;
  related_compounds?: string | null;
  related_compounds_source?: string | null;
};

export type JpVocabFillExampleSentencesResult = {
  updated: number;
  applied: JpVocabFillExampleSentenceApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: JpVocabMissingExampleSentenceRow[];
  /** 全库仍缺例句总数（不受 limit 截断） */
  total_missing?: number;
  incomplete_gloss?: JpVocabIncompleteExampleGlossRow[];
  /** 已有例句但汉字漏标假名 */
  incomplete_furigana?: JpVocabIncompleteFuriganaRow[];
  catalog_size: number;
  /** 上传格式契约（list_missing / apply 均返回，便于本地客户端） */
  upload_spec?: typeof JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC;
};

async function updateExampleSentencesIfEmpty(
  db: D1Database,
  wordId: number,
  exampleSentences: string,
  source: string | null,
  connection: string | null,
  connectionSource: string | null,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET example_sentences = ?1,
           example_sentences_source = ?2,
           connection = COALESCE(?3, connection),
           connection_source = COALESCE(?4, connection_source),
           updated_at = datetime('now')
       WHERE id = ?5
         AND (example_sentences IS NULL OR TRIM(example_sentences) = '')`
    )
    .bind(
      exampleSentences.trim(),
      source,
      connection?.trim() || null,
      connection?.trim() ? connectionSource : null,
      wordId
    )
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

async function updateExampleSentencesOverwrite(
  db: D1Database,
  wordId: number,
  exampleSentences: string,
  source: string | null,
  connection: string | null,
  connectionSource: string | null,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET example_sentences = ?1,
           example_sentences_source = ?2,
           connection = COALESCE(?3, connection),
           connection_source = COALESCE(?4, connection_source),
           updated_at = datetime('now')
       WHERE id = ?5`
    )
    .bind(
      exampleSentences.trim(),
      source,
      connection?.trim() || null,
      connection?.trim() ? connectionSource : null,
      wordId
    )
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

async function updateRelatedCompoundsIfEmpty(
  db: D1Database,
  wordId: number,
  relatedCompounds: string,
  source: string | null,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET related_compounds = ?1,
           related_compounds_source = ?2,
           updated_at = datetime('now')
       WHERE id = ?3
         AND (related_compounds IS NULL OR TRIM(related_compounds) = '')`
    )
    .bind(relatedCompounds.trim(), source, wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

async function updateRelatedCompoundsOverwrite(
  db: D1Database,
  wordId: number,
  relatedCompounds: string,
  source: string | null,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET related_compounds = ?1,
           related_compounds_source = ?2,
           updated_at = datetime('now')
       WHERE id = ?3`
    )
    .bind(relatedCompounds.trim() || null, source, wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

async function updateConnectionOnly(
  db: D1Database,
  wordId: number,
  connection: string,
  connectionSource: string | null,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET connection = ?1,
           connection_source = ?2,
           updated_at = datetime('now')
       WHERE id = ?3`
    )
    .bind(connection.trim(), connectionSource, wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export type ListJpVocabMissingExampleSentencesOptions = {
  /** 最多返回几条（默认不截断；定时任务建议 10～30） */
  limit?: number;
  /** 只拉单词或语法 */
  kind?: "word" | "grammar";
};

export async function countJpVocabWordsMissingExampleSentences(
  db: D1Database,
  options: Pick<ListJpVocabMissingExampleSentencesOptions, "kind"> = {}
): Promise<number> {
  const kind = options.kind;
  // 语法须已有 usage；单词须已有 meaning。单词只看缺例句（接序仅语法条，勿因 connection 空把单词 perpetual 进队）。
  const result =
    kind === "word"
      ? await db
          .prepare(
            `SELECT COUNT(*) AS n FROM jp_vocab_word
             WHERE kind = 'word'
               AND meaning IS NOT NULL AND TRIM(meaning) != ''
               AND (example_sentences IS NULL OR TRIM(example_sentences) = '')`
          )
          .first<{ n: number }>()
      : kind === "grammar"
        ? await db
            .prepare(
              `SELECT COUNT(*) AS n FROM jp_vocab_word
             WHERE (example_sentences IS NULL OR TRIM(example_sentences) = '')
               AND kind = 'grammar'
               AND usage IS NOT NULL AND TRIM(usage) != ''`
            )
            .first<{ n: number }>()
        : await db
            .prepare(
              `SELECT COUNT(*) AS n FROM jp_vocab_word
             WHERE (
                 (
                   kind = 'grammar'
                   AND usage IS NOT NULL AND TRIM(usage) != ''
                   AND (example_sentences IS NULL OR TRIM(example_sentences) = '')
                 )
                 OR (
                   kind = 'word'
                   AND meaning IS NOT NULL AND TRIM(meaning) != ''
                   AND (example_sentences IS NULL OR TRIM(example_sentences) = '')
                 )
               )`
            )
            .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listJpVocabWordsMissingExampleSentences(
  db: D1Database,
  options: ListJpVocabMissingExampleSentencesOptions = {}
): Promise<JpVocabMissingExampleSentenceRow[]> {
  await ensureJpVocabWordSchema(db);
  // 补全前置：な形容词「〜だ」先剥成词干，避免模型按「へただ」造句再被校验打回
  await normalizeJpVocabNaAdjRowsInDb(db);
  const kind = options.kind;
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  let sql = `SELECT id, word, kind, reading, meaning, usage, pos, example_sentences, connection
       FROM jp_vocab_word
       WHERE (
           (
             kind = 'grammar'
             AND usage IS NOT NULL AND TRIM(usage) != ''
             AND (example_sentences IS NULL OR TRIM(example_sentences) = '')
           )
           OR (
             kind = 'word'
             AND meaning IS NOT NULL AND TRIM(meaning) != ''
             AND (example_sentences IS NULL OR TRIM(example_sentences) = '')
           )
         )`;
  const binds: Array<string | number> = [];
  if (kind === "word" || kind === "grammar") {
    sql += ` AND kind = ?${binds.length + 1}`;
    binds.push(kind);
  }
  sql += ` ORDER BY id`;
  if (limit != null) {
    sql += ` LIMIT ?${binds.length + 1}`;
    binds.push(limit);
  }

  const stmt = db.prepare(sql);
  const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all<{
    id: number;
    word: string;
    kind: string;
    reading: string | null;
    meaning: string | null;
    usage: string | null;
    pos: string | null;
    example_sentences: string | null;
    connection: string | null;
  }>();

  return (result.results ?? []).map((row) => {
    const word = String(row.word);
    const rowKind = String(row.kind);
    const reading =
      row.reading != null ? String(row.reading).trim() || null : null;
    const meaning =
      row.meaning != null ? String(row.meaning).trim() || null : null;
    const usage =
      row.usage != null ? String(row.usage).trim() || null : null;
    const pos = row.pos != null ? String(row.pos).trim() || null : null;
    const examples =
      row.example_sentences != null
        ? String(row.example_sentences).trim() || null
        : null;
    const connection =
      row.connection != null ? String(row.connection).trim() || null : null;
    const need_examples = !examples;
    const need_connection = !hasJpVocabConnection(connection);
    const onlyConnection =
      rowKind === "word" && need_connection && !need_examples;
    return {
      id: Number(row.id),
      word,
      kind: rowKind,
      reading,
      meaning,
      usage,
      connection,
      need_examples,
      need_connection,
      suggested: need_examples ? lookupJpVocabExampleSentences(word) : null,
      prompt: onlyConnection
        ? buildJpVocabConnectionOnlyAiPrompt({
            word,
            kind: rowKind,
            reading,
            meaning,
            pos,
          })
        : buildJpVocabExampleSentencesAiPrompt({
            word,
            kind: rowKind,
            reading,
            meaning,
            usage,
          }),
    };
  });
}

export async function listJpVocabWordsIncompleteExampleGloss(
  db: D1Database
): Promise<JpVocabIncompleteExampleGlossRow[]> {
  const result = await db
    .prepare(
      `SELECT id, word, kind, reading, meaning, example_sentences FROM jp_vocab_word
       WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''
       ORDER BY id`
    )
    .all<{
      id: number;
      word: string;
      kind: string;
      reading: string | null;
      meaning: string | null;
      example_sentences: string;
    }>();

  const out: JpVocabIncompleteExampleGlossRow[] = [];
  for (const row of result.results ?? []) {
    const example = String(row.example_sentences ?? "");
    if (!jpVocabExampleSentencesNeedGlossFill(example)) continue;
    const missing = parseJpVocabExampleSentenceItems(example).filter(
      (item) => item.glossLines.length === 0
    ).length;
    out.push({
      id: Number(row.id),
      word: String(row.word),
      kind: String(row.kind),
      reading: row.reading != null ? String(row.reading).trim() || null : null,
      meaning: row.meaning != null ? String(row.meaning).trim() || null : null,
      example_sentences: example,
      missing_gloss_count: missing,
    });
  }
  return out;
}

export async function scanJpVocabWordsMissingExampleSentences(
  db: D1Database,
  options: ListJpVocabMissingExampleSentencesOptions = {}
): Promise<JpVocabFillExampleSentencesResult> {
  const [missing, total_missing] = await Promise.all([
    listJpVocabWordsMissingExampleSentences(db, options),
    countJpVocabWordsMissingExampleSentences(db, { kind: options.kind }),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
    catalog_size: Object.keys(JP_VOCAB_EXAMPLE_SENTENCES_CATALOG).length,
    upload_spec: JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  };
}

export async function scanJpVocabWordsIncompleteExampleGloss(
  db: D1Database
): Promise<JpVocabFillExampleSentencesResult> {
  const incomplete_gloss = await listJpVocabWordsIncompleteExampleGloss(db);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    incomplete_gloss,
    catalog_size: Object.keys(JP_VOCAB_EXAMPLE_SENTENCES_CATALOG).length,
  };
}

/** 扫描已有例句但日语行仍有未标假名汉字 */
export async function scanJpVocabWordsIncompleteExampleFurigana(
  db: D1Database
): Promise<JpVocabFillExampleSentencesResult> {
  const incomplete_furigana = await listJpVocabWordsIncompleteExampleFurigana(db);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    incomplete_furigana,
    catalog_size: Object.keys(JP_VOCAB_EXAMPLE_SENTENCES_CATALOG).length,
  };
}

/** 仅为已有译义补「译文：」前缀，不翻译 */
export async function normalizeJpVocabExampleSentencesFormatInDb(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillExampleSentencesResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const result = await db
    .prepare(
      `SELECT id, word, example_sentences, example_sentences_source FROM jp_vocab_word
       WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''
       ORDER BY id`
    )
    .all<{
      id: number;
      word: string;
      example_sentences: string;
      example_sentences_source: string | null;
    }>();

  const updates: JpVocabExampleSentenceUpdateItem[] = [];
  for (const row of result.results ?? []) {
    const next = normalizeJpVocabExampleSentencesFormat(row.example_sentences);
    if (!next) continue;
    updates.push({
      word_id: Number(row.id),
      example_sentences: next,
      source:
        row.example_sentences_source != null
          ? String(row.example_sentences_source).trim() || null
          : null,
    });
  }
  return applyJpVocabExampleSentenceUpdates(db, updates, {
    dryRun,
    allowOverwrite: true,
  });
}

export type JpVocabExampleSentenceUpdateItem = {
  word_id: number;
  /** 可空：仅补接序 / 相关构词时可不传例句 */
  example_sentences?: string | null;
  /** 接序；与例句同次写回 */
  connection?: string | null;
  /** 相关构词（仅单词）；与例句同次写回 */
  related_compounds?: string | null;
  /** 例句来源，如「DeepSeek」「Qwen本地」「手动」 */
  source?: string | null;
};

export async function applyJpVocabExampleSentenceUpdates(
  db: D1Database,
  updates: JpVocabExampleSentenceUpdateItem[],
  options: {
    dryRun?: boolean;
    allowOverwrite?: boolean;
    /** 本地模型/Agent 上传时须 true；内置词表补全传 false */
    validateFormat?: boolean;
    /** 单条未带 source 时的默认来源 */
    defaultSource?: string | null;
  } = {}
): Promise<JpVocabFillExampleSentencesResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const allowOverwrite = Boolean(options.allowOverwrite);
  const validateFormat = Boolean(options.validateFormat);
  const defaultSource = normalizeJpVocabExampleSentencesSource(
    options.defaultSource
  );
  const applied: JpVocabFillExampleSentenceApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    let exampleSentences = String(item.example_sentences ?? "").trim();
    let connectionRaw = String(item.connection ?? "").trim() || null;
    let relatedRaw = String(item.related_compounds ?? "").trim() || null;
    if (!Number.isInteger(wordId) || wordId <= 0) continue;
    const connectionOnly = Boolean(connectionRaw) && !exampleSentences && !relatedRaw;
    const relatedOnly =
      Boolean(relatedRaw) && !exampleSentences && !connectionRaw;
    if (!exampleSentences && !connectionRaw && !relatedRaw) continue;

    const source =
      normalizeJpVocabExampleSentencesSource(item.source) ?? defaultSource;
    const connectionSource = normalizeJpVocabConnectionSource(source);

    const row = await db
      .prepare(
        `SELECT id, word, kind, reading, meaning, usage, example_sentences, related_compounds FROM jp_vocab_word WHERE id = ?1`
      )
      .bind(wordId)
      .first<{
        id: number;
        word: string;
        kind: string;
        reading: string | null;
        meaning: string | null;
        usage: string | null;
        example_sentences: string | null;
        related_compounds: string | null;
      }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }

    let relatedCompounds: string | null = relatedRaw;
    if (relatedRaw) {
      const rcOk = validateJpVocabRelatedCompoundsAiOutput(relatedRaw, {
        word: String(row.word),
        reading: row.reading,
        kind: String(row.kind),
      });
      if (!rcOk.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `invalid_format:${rcOk.reason}`,
        });
        continue;
      }
      relatedCompounds = rcOk.text || null;
    }

    if (relatedOnly) {
      if (!relatedCompounds) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "related_compounds_empty",
        });
        continue;
      }
      const changed = allowOverwrite
        ? await updateRelatedCompoundsOverwrite(
            db,
            wordId,
            relatedCompounds,
            source,
            dryRun
          )
        : await updateRelatedCompoundsIfEmpty(
            db,
            wordId,
            relatedCompounds,
            source,
            dryRun
          );
      if (changed) {
        updated += 1;
        applied.push({
          id: wordId,
          word: String(row.word),
          example_sentences: String(row.example_sentences ?? ""),
          example_sentences_source: source,
          related_compounds: relatedCompounds,
          related_compounds_source: source,
        });
      } else {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: allowOverwrite ? "unchanged" : "already_filled",
        });
      }
      continue;
    }

    let connection: string | null = connectionRaw;
    if (validateFormat && connectionRaw) {
      const connOk = validateJpVocabConnectionAiOutput(connectionRaw, {
        word: String(row.word),
        kind: String(row.kind),
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
      if (!connection) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "invalid_format:connection_required",
        });
        continue;
      }
      const changed = await updateConnectionOnly(
        db,
        wordId,
        connection,
        connectionSource,
        dryRun
      );
      if (changed) {
        updated += 1;
        applied.push({
          id: wordId,
          word: String(row.word),
          example_sentences: String(row.example_sentences ?? ""),
          example_sentences_source: source,
          connection,
          connection_source: connectionSource,
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
      const validated = validateJpVocabExampleSentencesAiOutput(
        exampleSentences,
        {
          word: String(row.word),
          kind: String(row.kind),
          reading: row.reading,
          meaning: row.meaning,
          usage: row.usage,
        }
      );
      if (!validated.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `invalid_format:${validated.reason}`,
        });
        continue;
      }
      exampleSentences = validated.text;
      // 接序随例句同次写回；暂不硬拒缺接序（旧 Mac/STT 客户端可能尚未拆【接序】）
      // 有传 connection 则上面已校验；无则 COALESCE 保留库里旧值
    } else {
      const normalized = normalizeJpVocabExampleSentencesForOnlineApply(
        exampleSentences,
        {
          word: String(row.word),
          kind: String(row.kind),
          reading: row.reading,
          meaning: row.meaning,
          usage: row.usage,
        }
      );
      if (!normalized.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `examples_online_normalize:${normalized.reason}`,
        });
        continue;
      }
      exampleSentences = normalized.text;
    }

    const changed = allowOverwrite
      ? await updateExampleSentencesOverwrite(
          db,
          wordId,
          exampleSentences,
          source,
          connection,
          connectionSource,
          dryRun
        )
      : await updateExampleSentencesIfEmpty(
          db,
          wordId,
          exampleSentences,
          source,
          connection,
          connectionSource,
          dryRun
        );
    if (changed) {
      updated += 1;
      if (relatedCompounds) {
        if (allowOverwrite) {
          await updateRelatedCompoundsOverwrite(
            db,
            wordId,
            relatedCompounds,
            source,
            dryRun
          );
        } else {
          await updateRelatedCompoundsIfEmpty(
            db,
            wordId,
            relatedCompounds,
            source,
            dryRun
          );
        }
      }
      applied.push({
        id: wordId,
        word: String(row.word),
        example_sentences: exampleSentences,
        example_sentences_source: source,
        connection,
        connection_source: connection ? connectionSource : null,
        related_compounds: relatedCompounds,
        related_compounds_source: relatedCompounds ? source : null,
      });
    } else {
      // 例句已有：仍可顺带写空的相关构词
      if (relatedCompounds) {
        const rcChanged = allowOverwrite
          ? await updateRelatedCompoundsOverwrite(
              db,
              wordId,
              relatedCompounds,
              source,
              dryRun
            )
          : await updateRelatedCompoundsIfEmpty(
              db,
              wordId,
              relatedCompounds,
              source,
              dryRun
            );
        if (rcChanged) {
          updated += 1;
          applied.push({
            id: wordId,
            word: String(row.word),
            example_sentences: String(row.example_sentences ?? exampleSentences),
            example_sentences_source: source,
            related_compounds: relatedCompounds,
            related_compounds_source: source,
          });
          continue;
        }
      }
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: allowOverwrite ? "unchanged" : "already_filled",
      });
    }
  }

  return {
    updated,
    applied,
    skipped,
    dry_run: dryRun,
    catalog_size: Object.keys(JP_VOCAB_EXAMPLE_SENTENCES_CATALOG).length,
    upload_spec: JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  };
}

/** 用内置词表补全尚未填写例句的词条（仅填空，不覆盖已有内容） */
export async function fillJpVocabExampleSentencesFromCatalog(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillExampleSentencesResult> {
  const missing = await listJpVocabWordsMissingExampleSentences(db);
  const updates = missing
    .filter((row) => row.suggested)
    .map((row) => ({
      word_id: row.id,
      example_sentences: row.suggested as string,
      source: JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_CATALOG,
    }));
  return applyJpVocabExampleSentenceUpdates(db, updates, options);
}
