import "server-only";

import {
  buildEnVocabExampleSentencesAiPrompt,
  EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  enVocabExampleSentencesNeedFill,
  expectedEnVocabExampleCountFromUsage,
  validateEnVocabExampleSentencesAiOutput,
} from "@/lib/en-vocab-example-sentences-ai";
import {
  enVocabExampleLooksLikeStructuredDump,
  normalizeEnVocabExampleSentencesFormat,
  normalizeEnVocabExampleSentencesSource,
  shieldEnVocabExampleSentencesUploadText,
} from "@/lib/en-vocab-example-sentences";
import {
  ensureEnVocabWordSchema,
  peekEnVocabDailyDisplayOrderIds,
} from "@/lib/en-vocab-db";
import { sortEnVocabFillRowsByDailyOrder } from "@/lib/en-vocab-fill-daily-priority";

/**
 * 已有编号用法即可进扫描；是否缺例句在 JS 里按「条数 < 用法数」判断。
 * 禁止只认 example_sentences 整字段为空（否则 3 用法 2 例句永远不入队）。
 */
const HAS_USAGE_SQL = `usage IS NOT NULL AND TRIM(usage) != ''`;

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
  /** 当日序号（1-based）；不在日序里则为 null */
  daily_seq?: number | null;
  prompt: string;
};

type EnVocabExampleFillCandidate = Omit<
  EnVocabMissingExampleSentenceRow,
  "prompt" | "daily_seq"
>;

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

async function listEnVocabExampleFillCandidates(
  db: D1Database,
  options: Pick<ListEnVocabMissingExampleSentencesOptions, "kind"> = {}
): Promise<EnVocabExampleFillCandidate[]> {
  await ensureEnVocabWordSchema(db);
  const kind = options.kind;
  let sql = `SELECT id, word, kind, reading, meaning, pos, usage, example_sentences
       FROM en_vocab_word
       WHERE ${HAS_USAGE_SQL}`;
  const binds: Array<string | number> = [];
  if (kind === "word" || kind === "grammar") {
    sql += ` AND kind = ?${binds.length + 1}`;
    binds.push(kind);
  }

  const result = (
    binds.length > 0 ? db.prepare(sql).bind(...binds) : db.prepare(sql)
  ).all<{
    id: number;
    word: string;
    kind: string;
    reading: string | null;
    meaning: string | null;
    pos: string | null;
    usage: string | null;
    example_sentences: string | null;
  }>();
  const rows = (await result).results ?? [];

  const mapped: EnVocabExampleFillCandidate[] = [];
  for (const row of rows) {
    const usage =
      row.usage != null ? String(row.usage).trim() || null : null;
    const expectedCount = expectedEnVocabExampleCountFromUsage(usage);
    if (expectedCount == null || !usage) continue;
    if (!enVocabExampleSentencesNeedFill(usage, row.example_sentences)) {
      continue;
    }

    const word = String(row.word);
    const rowKind = String(row.kind);
    const reading =
      row.reading != null ? String(row.reading).trim() || null : null;
    const meaning =
      row.meaning != null ? String(row.meaning).trim() || null : null;
    const pos = row.pos != null ? String(row.pos).trim() || null : null;
    mapped.push({
      id: Number(row.id),
      word,
      kind: rowKind,
      reading,
      meaning,
      pos,
      usage,
      expected_count: expectedCount,
    });
  }
  return mapped;
}

function withExampleFillPrompts(
  rows: Array<EnVocabExampleFillCandidate & { daily_seq?: number | null }>
): EnVocabMissingExampleSentenceRow[] {
  return rows.map((row) => ({
    ...row,
    prompt: buildEnVocabExampleSentencesAiPrompt({
      word: row.word,
      kind: row.kind,
      reading: row.reading,
      meaning: row.meaning,
      pos: row.pos,
      usage: row.usage,
    }),
  }));
}

export async function countEnVocabWordsMissingExampleSentences(
  db: D1Database,
  options: Pick<ListEnVocabMissingExampleSentencesOptions, "kind"> = {}
): Promise<number> {
  const mapped = await listEnVocabExampleFillCandidates(db, options);
  return mapped.length;
}

export async function listEnVocabWordsMissingExampleSentences(
  db: D1Database,
  options: ListEnVocabMissingExampleSentencesOptions = {}
): Promise<EnVocabMissingExampleSentenceRow[]> {
  const kind = options.kind;
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  const [orderIds, mapped] = await Promise.all([
    peekEnVocabDailyDisplayOrderIds(db),
    listEnVocabExampleFillCandidates(db, { kind }),
  ]);

  return withExampleFillPrompts(
    sortEnVocabFillRowsByDailyOrder(mapped, orderIds, limit)
  );
}

export async function scanEnVocabWordsMissingExampleSentences(
  db: D1Database,
  options: ListEnVocabMissingExampleSentencesOptions = {}
): Promise<EnVocabFillExampleSentencesResult> {
  const kind = options.kind;
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  const [orderIds, mapped] = await Promise.all([
    peekEnVocabDailyDisplayOrderIds(db),
    listEnVocabExampleFillCandidates(db, { kind }),
  ]);
  const missing = withExampleFillPrompts(
    sortEnVocabFillRowsByDailyOrder(mapped, orderIds, limit)
  );
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing: mapped.length,
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

    // force 也必须挡结构化 dump（线上曾 str(list) 写入 Python 列表字面量）
    const shielded = shieldEnVocabExampleSentencesUploadText(exampleSentences);
    if (!shielded.ok) {
      skipped.push({
        id: wordId,
        word: String(wordId),
        reason: `invalid_format:${shielded.reason}`,
      });
      continue;
    }
    exampleSentences = shielded.text;

    const source =
      normalizeEnVocabExampleSentencesSource(item.source) ?? defaultSource;

    const row = await db
      .prepare(
        `SELECT id, word, kind, reading, meaning, pos, usage, example_sentences
         FROM en_vocab_word WHERE id = ?1`
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
        example_sentences: string | null;
      }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }

    // force（线上付费透传）：不拦 usage_required，正文原样写回
    const usage =
      row.usage != null ? String(row.usage).trim() || null : null;
    if (!force && !usage) {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "usage_required",
      });
      continue;
    }

    if (validateFormat) {
      if (!usage) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "usage_required",
        });
        continue;
      }
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
      // force：结构化 dump 已在上方 shield 还原；再做一次轻量行式规范化
      const normalized = normalizeEnVocabExampleSentencesFormat(exampleSentences);
      if (normalized) exampleSentences = normalized;
    }

    const existingExamples =
      row.example_sentences != null ? String(row.example_sentences) : null;
    const incomplete = enVocabExampleSentencesNeedFill(usage, existingExamples);
    const changed = await updateExampleSentencesIfEmpty(
      db,
      wordId,
      exampleSentences,
      source,
      dryRun,
      force || incomplete
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

    // 结构化 dump：能还原且校验过 → 写回规范正文；否则清空重造
    if (enVocabExampleLooksLikeStructuredDump(raw)) {
      const shielded = shieldEnVocabExampleSentencesUploadText(raw);
      if (shielded.ok && usage) {
        const healed = validateEnVocabExampleSentencesAiOutput(shielded.text, {
          word: String(row.word),
          kind: String(row.kind),
          reading: row.reading,
          meaning: row.meaning,
          pos: row.pos,
          usage,
        });
        if (healed.ok && healed.text !== raw) {
          if (!dryRun) {
            await db
              .prepare(
                `UPDATE en_vocab_word
                 SET example_sentences = ?1,
                     updated_at = datetime('now')
                 WHERE id = ?2`
              )
              .bind(healed.text, Number(row.id))
              .run();
          }
          cleared += 1;
          applied.push({
            id: Number(row.id),
            word: String(row.word),
            example_sentences: healed.text,
            example_sentences_source: null,
          });
          skipped.push({
            id: Number(row.id),
            word: String(row.word),
            reason: "healed:structured_dump",
          });
          continue;
        }
      }
      // 还原失败或仍不合格 → 清空
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
        reason: "cleared:structured_dump",
      });
      continue;
    }

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
