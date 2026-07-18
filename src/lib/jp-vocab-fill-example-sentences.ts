import "server-only";

import {
  lookupJpVocabExampleSentences,
  JP_VOCAB_EXAMPLE_SENTENCES_CATALOG,
} from "@/lib/jp-vocab-example-sentences-catalog";
import {
  buildJpVocabExampleSentencesAiPrompt,
  JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  validateJpVocabExampleSentencesAiOutput,
} from "@/lib/jp-vocab-example-sentences-ai";
import {
  jpVocabExampleSentencesNeedGlossFill,
  normalizeJpVocabExampleSentencesFormat,
  parseJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";

export type JpVocabMissingExampleSentenceRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
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
  catalog_size: number;
  /** 上传格式契约（list_missing / apply 均返回，便于本地客户端） */
  upload_spec?: typeof JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC;
};

async function updateExampleSentencesIfEmpty(
  db: D1Database,
  wordId: number,
  exampleSentences: string,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET example_sentences = ?1, updated_at = datetime('now')
       WHERE id = ?2
         AND (example_sentences IS NULL OR TRIM(example_sentences) = '')`
    )
    .bind(exampleSentences.trim(), wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

async function updateExampleSentencesOverwrite(
  db: D1Database,
  wordId: number,
  exampleSentences: string,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET example_sentences = ?1, updated_at = datetime('now')
       WHERE id = ?2`
    )
    .bind(exampleSentences.trim(), wordId)
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
  const result =
    kind === "word" || kind === "grammar"
      ? await db
          .prepare(
            `SELECT COUNT(*) AS n FROM jp_vocab_word
             WHERE (example_sentences IS NULL OR TRIM(example_sentences) = '')
               AND kind = ?1`
          )
          .bind(kind)
          .first<{ n: number }>()
      : await db
          .prepare(
            `SELECT COUNT(*) AS n FROM jp_vocab_word
             WHERE example_sentences IS NULL OR TRIM(example_sentences) = ''`
          )
          .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listJpVocabWordsMissingExampleSentences(
  db: D1Database,
  options: ListJpVocabMissingExampleSentencesOptions = {}
): Promise<JpVocabMissingExampleSentenceRow[]> {
  const kind = options.kind;
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  let sql = `SELECT id, word, kind, reading, meaning FROM jp_vocab_word
       WHERE example_sentences IS NULL OR TRIM(example_sentences) = ''`;
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
  }>();

  return (result.results ?? []).map((row) => {
    const word = String(row.word);
    const rowKind = String(row.kind);
    const reading =
      row.reading != null ? String(row.reading).trim() || null : null;
    const meaning =
      row.meaning != null ? String(row.meaning).trim() || null : null;
    return {
      id: Number(row.id),
      word,
      kind: rowKind,
      reading,
      meaning,
      suggested: lookupJpVocabExampleSentences(word),
      prompt: buildJpVocabExampleSentencesAiPrompt({
        word,
        kind: rowKind,
        reading,
        meaning,
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

/** 仅为已有译义补「译文：」前缀，不翻译 */
export async function normalizeJpVocabExampleSentencesFormatInDb(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillExampleSentencesResult> {
  const dryRun = Boolean(options.dryRun);
  const result = await db
    .prepare(
      `SELECT id, word, example_sentences FROM jp_vocab_word
       WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''
       ORDER BY id`
    )
    .all<{ id: number; word: string; example_sentences: string }>();

  const updates: Array<{ word_id: number; example_sentences: string }> = [];
  for (const row of result.results ?? []) {
    const next = normalizeJpVocabExampleSentencesFormat(row.example_sentences);
    if (!next) continue;
    updates.push({ word_id: Number(row.id), example_sentences: next });
  }
  return applyJpVocabExampleSentenceUpdates(db, updates, {
    dryRun,
    allowOverwrite: true,
  });
}

export async function applyJpVocabExampleSentenceUpdates(
  db: D1Database,
  updates: Array<{ word_id: number; example_sentences: string }>,
  options: {
    dryRun?: boolean;
    allowOverwrite?: boolean;
    /** 本地模型/Agent 上传时须 true；内置词表补全传 false */
    validateFormat?: boolean;
  } = {}
): Promise<JpVocabFillExampleSentencesResult> {
  const dryRun = Boolean(options.dryRun);
  const allowOverwrite = Boolean(options.allowOverwrite);
  const validateFormat = Boolean(options.validateFormat);
  const applied: JpVocabFillExampleSentenceApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    let exampleSentences = String(item.example_sentences ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !exampleSentences) continue;

    const row = await db
      .prepare(
        `SELECT id, word, kind, reading, meaning FROM jp_vocab_word WHERE id = ?1`
      )
      .bind(wordId)
      .first<{
        id: number;
        word: string;
        kind: string;
        reading: string | null;
        meaning: string | null;
      }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }

    if (validateFormat) {
      const validated = validateJpVocabExampleSentencesAiOutput(exampleSentences, {
        word: String(row.word),
        kind: String(row.kind),
        reading: row.reading,
        meaning: row.meaning,
      });
      if (!validated.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `invalid_format:${validated.reason}`,
        });
        continue;
      }
      exampleSentences = validated.text;
    }

    const changed = allowOverwrite
      ? await updateExampleSentencesOverwrite(db, wordId, exampleSentences, dryRun)
      : await updateExampleSentencesIfEmpty(db, wordId, exampleSentences, dryRun);
    if (changed) {
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        example_sentences: exampleSentences,
      });
    } else {
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
    }));
  return applyJpVocabExampleSentenceUpdates(db, updates, options);
}
