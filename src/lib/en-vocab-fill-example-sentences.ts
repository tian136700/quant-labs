import "server-only";

import {
  buildEnVocabExampleSentencesAiPrompt,
  EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  expectedEnVocabExampleCountFromUsage,
  validateEnVocabExampleSentencesAiOutput,
} from "@/lib/en-vocab-example-sentences-ai";
import {
  normalizeEnVocabExampleSentencesFormat,
  normalizeEnVocabExampleSentencesSource,
} from "@/lib/en-vocab-example-sentences";
import { ensureEnVocabWordSchema } from "@/lib/en-vocab-db";

/** 缺例句且已有用法（例句阶段门禁） */
const MISSING_EXAMPLES_WITH_USAGE_SQL = `(example_sentences IS NULL OR TRIM(example_sentences) = '')
  AND usage IS NOT NULL AND TRIM(usage) != ''`;

export type EnVocabMissingExampleSentenceRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  usage: string | null;
  /** 与 usage 编号条数一致，供客户端校验 */
  expected_count: number;
  prompt: string;
};

export type EnVocabFillExampleSentenceApplied = {
  id: number;
  word: string;
  example_sentences: string;
  example_sentences_source: string | null;
};

export type EnVocabFillExampleSentencesResult = {
  updated: number;
  applied: EnVocabFillExampleSentenceApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: EnVocabMissingExampleSentenceRow[];
  total_missing?: number;
  upload_spec?: typeof EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC;
  cleared?: number;
};

export type ListEnVocabMissingExampleSentencesOptions = {
  limit?: number;
  kind?: "word" | "grammar";
};

export async function countEnVocabWordsMissingExampleSentences(
  db: D1Database,
  options: Pick<ListEnVocabMissingExampleSentencesOptions, "kind"> = {}
): Promise<number> {
  const kind = options.kind;
  const result =
    kind === "word" || kind === "grammar"
      ? await db
          .prepare(
            `SELECT COUNT(*) AS n FROM en_vocab_word
             WHERE ${MISSING_EXAMPLES_WITH_USAGE_SQL}
               AND kind = ?1`
          )
          .bind(kind)
          .first<{ n: number }>()
      : await db
          .prepare(
            `SELECT COUNT(*) AS n FROM en_vocab_word
             WHERE ${MISSING_EXAMPLES_WITH_USAGE_SQL}`
          )
          .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listEnVocabWordsMissingExampleSentences(
  db: D1Database,
  options: ListEnVocabMissingExampleSentencesOptions = {}
): Promise<EnVocabMissingExampleSentenceRow[]> {
  await ensureEnVocabWordSchema(db);
  const kind = options.kind;
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  // 多取一些再按 usage 可解析过滤，避免坏格式 usage 占满 LIMIT
  const fetchLimit = limit != null ? Math.min(limit * 5, Math.max(limit, 50)) : null;

  let sql = `SELECT id, word, kind, reading, meaning, pos, usage FROM en_vocab_word
       WHERE ${MISSING_EXAMPLES_WITH_USAGE_SQL}`;
  const binds: Array<string | number> = [];
  if (kind === "word" || kind === "grammar") {
    sql += ` AND kind = ?${binds.length + 1}`;
    binds.push(kind);
  }
  sql += ` ORDER BY id`;
  if (fetchLimit != null) {
    sql += ` LIMIT ?${binds.length + 1}`;
    binds.push(fetchLimit);
  }

  const stmt = db.prepare(sql);
  const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all<{
    id: number;
    word: string;
    kind: string;
    reading: string | null;
    meaning: string | null;
    pos: string | null;
    usage: string | null;
  }>();

  const rows: EnVocabMissingExampleSentenceRow[] = [];
  for (const row of result.results ?? []) {
    const usage =
      row.usage != null ? String(row.usage).trim() || null : null;
    const expectedCount = expectedEnVocabExampleCountFromUsage(usage);
    if (expectedCount == null || !usage) continue;

    const word = String(row.word);
    const rowKind = String(row.kind);
    const reading =
      row.reading != null ? String(row.reading).trim() || null : null;
    const meaning =
      row.meaning != null ? String(row.meaning).trim() || null : null;
    const pos = row.pos != null ? String(row.pos).trim() || null : null;
    rows.push({
      id: Number(row.id),
      word,
      kind: rowKind,
      reading,
      meaning,
      pos,
      usage,
      expected_count: expectedCount,
      prompt: buildEnVocabExampleSentencesAiPrompt({
        word,
        kind: rowKind,
        reading,
        meaning,
        pos,
        usage,
      }),
    });
    if (limit != null && rows.length >= limit) break;
  }
  return rows;
}

export async function scanEnVocabWordsMissingExampleSentences(
  db: D1Database,
  options: ListEnVocabMissingExampleSentencesOptions = {}
): Promise<EnVocabFillExampleSentencesResult> {
  const [missing, total_missing] = await Promise.all([
    listEnVocabWordsMissingExampleSentences(db, options),
    countEnVocabWordsMissingExampleSentences(db, options),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
    upload_spec: EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  };
}

async function updateExampleSentencesIfEmpty(
  db: D1Database,
  wordId: number,
  exampleSentences: string,
  source: string | null,
  dryRun: boolean,
  force = false
): Promise<boolean> {
  if (dryRun) return true;
  const result = force
    ? await db
        .prepare(
          `UPDATE en_vocab_word
           SET example_sentences = ?1,
               example_sentences_source = ?2,
               updated_at = datetime('now')
           WHERE id = ?3`
        )
        .bind(exampleSentences.trim(), source, wordId)
        .run()
    : await db
        .prepare(
          `UPDATE en_vocab_word
           SET example_sentences = ?1,
               example_sentences_source = ?2,
               updated_at = datetime('now')
           WHERE id = ?3
             AND (example_sentences IS NULL OR TRIM(example_sentences) = '')`
        )
        .bind(exampleSentences.trim(), source, wordId)
        .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export type EnVocabExampleSentenceUpdateItem = {
  word_id: number;
  example_sentences: string;
  source?: string | null;
};

export async function applyEnVocabExampleSentenceUpdates(
  db: D1Database,
  updates: EnVocabExampleSentenceUpdateItem[],
  options: {
    dryRun?: boolean;
    validateFormat?: boolean;
    defaultSource?: string | null;
    /** 线上付费整词刷新：覆盖已有例句 */
    force?: boolean;
  } = {}
): Promise<EnVocabFillExampleSentencesResult> {
  await ensureEnVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const force = Boolean(options.force);
  const defaultSource = normalizeEnVocabExampleSentencesSource(
    options.defaultSource
  );
  const applied: EnVocabFillExampleSentenceApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    let exampleSentences = String(item.example_sentences ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !exampleSentences) continue;

    const source =
      normalizeEnVocabExampleSentencesSource(item.source) ?? defaultSource;

    const row = await db
      .prepare(
        `SELECT id, word, kind, reading, meaning, pos, usage FROM en_vocab_word WHERE id = ?1`
      )
      .bind(wordId)
      .first<{
        id: number;
        word: string;
        kind: string;
        reading: string | null;
        meaning: string | null;
        pos: string | null;
        usage: string | null;
      }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }

    // force 整词刷新时：允许用本次 updates 里先写回的 usage；此处仍读库。
    // 线上 batch 会先 apply usage(force) 再 apply examples(force)。
    const usage =
      row.usage != null ? String(row.usage).trim() || null : null;
    if (!usage) {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "usage_required",
      });
      continue;
    }

    if (validateFormat) {
      const validated = validateEnVocabExampleSentencesAiOutput(
        exampleSentences,
        {
          word: String(row.word),
          kind: String(row.kind),
          reading: row.reading,
          meaning: row.meaning,
          pos: row.pos,
          usage,
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
    } else {
      exampleSentences =
        normalizeEnVocabExampleSentencesFormat(exampleSentences) ||
        exampleSentences;
    }

    const changed = await updateExampleSentencesIfEmpty(
      db,
      wordId,
      exampleSentences,
      source,
      dryRun,
      force
    );
    if (changed) {
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        example_sentences: exampleSentences,
        example_sentences_source: source,
      });
    } else {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "already_filled",
      });
    }
  }

  return {
    updated,
    applied,
    skipped,
    dry_run: dryRun,
    upload_spec: EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  };
}

/** 清空全库例句（便于按 usage 重造）；保留 usage 不动 */
export async function clearAllEnVocabExampleSentences(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<EnVocabFillExampleSentencesResult> {
  await ensureEnVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM en_vocab_word
       WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''`
    )
    .first<{ n: number }>();
  const cleared = Number(countRow?.n ?? 0);

  if (!dryRun && cleared > 0) {
    await db
      .prepare(
        `UPDATE en_vocab_word
         SET example_sentences = NULL,
             example_sentences_source = NULL,
             updated_at = datetime('now')
         WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''`
      )
      .run();
  }

  return {
    updated: dryRun ? 0 : cleared,
    applied: [],
    skipped: [],
    dry_run: dryRun,
    cleared,
    upload_spec: EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  };
}

/**
 * 清空已存但不合格的例句（单词/短语冒充例句等），让定时任务重造。
 * 限量扫描，避免 Worker 1102。
 */
export async function clearInvalidEnVocabExampleSentences(
  db: D1Database,
  options: { dryRun?: boolean; limit?: number } = {}
): Promise<EnVocabFillExampleSentencesResult> {
  await ensureEnVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  // limit = 本批最多清空条数；扫描窗口略放大以便找到脏数据
  const clearCap =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.min(Math.floor(options.limit), 200)
      : 50;
  const scanCap = Math.min(Math.max(clearCap * 10, 200), 500);

  const result = await db
    .prepare(
      `SELECT id, word, kind, reading, meaning, pos, usage, example_sentences
       FROM en_vocab_word
       WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''
       ORDER BY id
       LIMIT ?1`
    )
    .bind(scanCap)
    .all<{
      id: number;
      word: string;
      kind: string;
      reading: string | null;
      meaning: string | null;
      pos: string | null;
      usage: string | null;
      example_sentences: string | null;
    }>();

  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  const applied: EnVocabFillExampleSentenceApplied[] = [];
  let cleared = 0;

  for (const row of result.results ?? []) {
    if (cleared >= clearCap) break;

    const usage =
      row.usage != null ? String(row.usage).trim() || null : null;
    const raw = String(row.example_sentences ?? "").trim();
    const validated = validateEnVocabExampleSentencesAiOutput(raw, {
      word: String(row.word),
      kind: String(row.kind),
      reading: row.reading,
      meaning: row.meaning,
      pos: row.pos,
      usage,
    });
    if (validated.ok) continue;

    if (!dryRun) {
      await db
        .prepare(
          `UPDATE en_vocab_word
           SET example_sentences = NULL,
               example_sentences_source = NULL,
               updated_at = datetime('now')
           WHERE id = ?1
             AND example_sentences IS NOT NULL
             AND TRIM(example_sentences) != ''`
        )
        .bind(Number(row.id))
        .run();
    }
    cleared += 1;
    applied.push({
      id: Number(row.id),
      word: String(row.word),
      example_sentences: "",
      example_sentences_source: null,
    });
    skipped.push({
      id: Number(row.id),
      word: String(row.word),
      reason: `cleared:${validated.reason}`,
    });
  }

  return {
    updated: dryRun ? 0 : cleared,
    applied,
    skipped,
    dry_run: dryRun,
    cleared,
    upload_spec: EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  };
}
