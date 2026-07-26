import "server-only";

import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import { validateJpVocabExampleSentencesAiOutput } from "@/lib/jp-vocab-example-sentences-ai";
import { normalizeJpVocabExampleSentencesSource } from "@/lib/jp-vocab-example-sentences";
import {
  buildJpVocabMeaningAiPrompt,
  JP_VOCAB_MEANING_UPLOAD_SPEC,
  normalizeJpVocabMeaningText,
  validateJpVocabMeaningAiOutput,
} from "@/lib/jp-vocab-meaning-ai";
import { validateJpVocabPosAiOutput } from "@/lib/jp-vocab-pos-ai";

export type JpVocabMissingMeaningRow = {
  id: number;
  word: string;
  reading: string | null;
  kind: string;
  /** 缺词性时一并让 Cloud 出词性 */
  need_pos: boolean;
  /** 缺例句时一并让 Cloud 出常用用法例句 */
  need_examples: boolean;
  /** 可直接喂给本地/远程模型的完整 prompt */
  prompt: string;
};

export type JpVocabFillMeaningApplied = {
  id: number;
  word: string;
  meaning: string | null;
  pos: string | null;
  example_sentences: string | null;
  meaning_source: string | null;
};

export type JpVocabFillMeaningResult = {
  updated: number;
  applied: JpVocabFillMeaningApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: JpVocabMissingMeaningRow[];
  total_missing?: number;
  upload_spec?: typeof JP_VOCAB_MEANING_UPLOAD_SPEC;
  /** clear_all 时清空的单词条数 */
  cleared?: number;
};

export type ListJpVocabMissingMeaningOptions = {
  limit?: number;
};

function isBlankField(value: string | null | undefined): boolean {
  return !(value != null && String(value).trim());
}

export async function countJpVocabWordsMissingMeaning(
  db: D1Database
): Promise<number> {
  const result = await db
    .prepare(
      // 空释义写入应是 NULL；不用 TRIM，避免 list_missing 热路径全表函数扫
      `SELECT COUNT(*) AS n FROM jp_vocab_word
       WHERE kind != 'grammar'
         AND (meaning IS NULL OR meaning = '')`
    )
    .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listJpVocabWordsMissingMeaning(
  db: D1Database,
  options: ListJpVocabMissingMeaningOptions = {}
): Promise<JpVocabMissingMeaningRow[]> {
  await ensureJpVocabWordSchema(db);
  // 释义不剥「〜だ」：Cloud API 能直接出义；语法条已在 WHERE 排除
  const rawLimit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;
  // 硬顶：释义补全热路径禁止一次拉太多；稍放宽供毒丸跳过队首（仍远小于曾炸 1102 的 200）
  const limit = rawLimit == null ? null : Math.min(rawLimit, 20);

  let sql = `SELECT id, word, reading, kind, pos, example_sentences FROM jp_vocab_word
       WHERE kind != 'grammar'
         AND (meaning IS NULL OR meaning = '')
       ORDER BY id`;
  if (limit != null) {
    sql += ` LIMIT ?1`;
  }

  const result = await (
    limit != null ? db.prepare(sql).bind(limit) : db.prepare(sql)
  ).all<{
    id: number;
    word: string;
    reading: string | null;
    kind: string;
    pos: string | null;
    example_sentences: string | null;
  }>();

  return (result.results ?? []).map((row) => {
    const word = String(row.word);
    const reading = row.reading != null ? String(row.reading).trim() || null : null;
    const pos = row.pos != null ? String(row.pos).trim() || null : null;
    const need_pos = isBlankField(pos);
    const need_examples = isBlankField(row.example_sentences);
    return {
      id: Number(row.id),
      word,
      reading,
      kind: String(row.kind),
      need_pos,
      need_examples,
      prompt: buildJpVocabMeaningAiPrompt({
        word,
        reading,
        kind: String(row.kind),
        pos,
        need_meaning: true,
        need_pos,
        need_examples,
      }),
    };
  });
}

export async function scanJpVocabWordsMissingMeaning(
  db: D1Database,
  options: ListJpVocabMissingMeaningOptions = {}
): Promise<JpVocabFillMeaningResult> {
  const [missing, total_missing] = await Promise.all([
    listJpVocabWordsMissingMeaning(db, options),
    countJpVocabWordsMissingMeaning(db),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
    upload_spec: JP_VOCAB_MEANING_UPLOAD_SPEC,
  };
}

/**
 * 清空全部单词释义（grammar 不动）。含「手动」来源。
 * 用于纠错后按常用义重补。
 */
export async function clearAllJpVocabWordMeanings(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillMeaningResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM jp_vocab_word
       WHERE kind != 'grammar'
         AND (
           (meaning IS NOT NULL AND meaning != '')
           OR (meaning_source IS NOT NULL AND meaning_source != '')
         )`
    )
    .first<{ n: number }>();
  const cleared = Number(countRow?.n ?? 0);

  if (!dryRun && cleared > 0) {
    await db
      .prepare(
        `UPDATE jp_vocab_word
         SET meaning = NULL,
             meaning_source = NULL,
             updated_at = datetime('now')
         WHERE kind != 'grammar'
           AND (
             (meaning IS NOT NULL AND meaning != '')
             OR (meaning_source IS NOT NULL AND meaning_source != '')
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
    upload_spec: JP_VOCAB_MEANING_UPLOAD_SPEC,
  };
}

export type JpVocabMeaningUpdateItem = {
  word_id: number;
  meaning?: string | null;
  pos?: string | null;
  example_sentences?: string | null;
  source?: string | null;
};

export async function applyJpVocabMeaningUpdates(
  db: D1Database,
  updates: JpVocabMeaningUpdateItem[],
  options: {
    dryRun?: boolean;
    validateFormat?: boolean;
    defaultSource?: string | null;
    allowOverwrite?: boolean;
  } = {}
): Promise<JpVocabFillMeaningResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const allowOverwrite = Boolean(options.allowOverwrite);
  const defaultSource = normalizeJpVocabExampleSentencesSource(
    options.defaultSource
  );
  const applied: JpVocabFillMeaningApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    if (!Number.isInteger(wordId) || wordId <= 0) continue;

    let meaningRaw =
      item.meaning != null ? String(item.meaning).trim() : "";
    let posRaw = item.pos != null ? String(item.pos).trim() : "";
    let examplesRaw =
      item.example_sentences != null
        ? String(item.example_sentences).trim()
        : "";
    if (!meaningRaw && !posRaw && !examplesRaw) continue;

    const source =
      normalizeJpVocabExampleSentencesSource(item.source) ?? defaultSource;

    const row = await db
      .prepare(
        `SELECT id, word, kind, meaning, pos, example_sentences, reading
         FROM jp_vocab_word WHERE id = ?1`
      )
      .bind(wordId)
      .first<{
        id: number;
        word: string;
        kind: string;
        meaning: string | null;
        pos: string | null;
        example_sentences: string | null;
        reading: string | null;
      }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }
    if (row.kind === "grammar") {
      skipped.push({ id: wordId, word: String(row.word), reason: "grammar_skipped" });
      continue;
    }

    const meaningEmpty = isBlankField(row.meaning);
    const posEmpty = isBlankField(row.pos);
    const examplesEmpty = isBlankField(row.example_sentences);

    let nextMeaning: string | null = null;
    let nextPos: string | null = null;
    let nextExamples: string | null = null;

    if (meaningRaw && (allowOverwrite || meaningEmpty)) {
      if (validateFormat) {
        const validated = validateJpVocabMeaningAiOutput(meaningRaw);
        if (!validated.ok) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: `invalid_format:${validated.reason}`,
          });
          continue;
        }
        nextMeaning = validated.text;
      } else {
        nextMeaning = normalizeJpVocabMeaningText(meaningRaw) || meaningRaw;
      }
    } else if (meaningRaw && !meaningEmpty) {
      meaningRaw = "";
    }

    if (posRaw && (allowOverwrite || posEmpty)) {
      if (validateFormat) {
        const validated = validateJpVocabPosAiOutput(posRaw);
        if (!validated.ok) {
          // 词性坏了仍可写释义；记下原因继续
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: `pos_invalid:${validated.reason}`,
          });
          posRaw = "";
        } else {
          nextPos = validated.text;
        }
      } else {
        nextPos = posRaw;
      }
    } else if (posRaw && !posEmpty) {
      posRaw = "";
    }

    const meaningForExamples = nextMeaning ?? (row.meaning != null ? String(row.meaning) : null);
    if (examplesRaw && (allowOverwrite || examplesEmpty)) {
      if (validateFormat) {
        const validated = validateJpVocabExampleSentencesAiOutput(examplesRaw, {
          word: String(row.word),
          kind: String(row.kind),
          reading: row.reading,
          meaning: meaningForExamples,
        });
        if (!validated.ok) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: `examples_invalid:${validated.reason}`,
          });
          examplesRaw = "";
        } else {
          nextExamples = validated.text;
        }
      } else {
        nextExamples = examplesRaw;
      }
    } else if (examplesRaw && !examplesEmpty) {
      examplesRaw = "";
    }

    if (!nextMeaning && !nextPos && !nextExamples) {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: allowOverwrite ? "unchanged" : "already_filled",
      });
      continue;
    }

    if (!dryRun) {
      if (nextMeaning || nextPos) {
        const result = allowOverwrite
          ? await db
              .prepare(
                `UPDATE jp_vocab_word
                 SET meaning = COALESCE(?1, meaning),
                     meaning_source = CASE
                       WHEN ?1 IS NOT NULL THEN ?2
                       ELSE meaning_source
                     END,
                     pos = COALESCE(?3, pos),
                     updated_at = datetime('now')
                 WHERE id = ?4 AND kind != 'grammar'`
              )
              .bind(nextMeaning, source, nextPos, wordId)
              .run()
          : await db
              .prepare(
                `UPDATE jp_vocab_word
                 SET meaning = CASE
                       WHEN (meaning IS NULL OR meaning = '') AND ?1 IS NOT NULL THEN ?1
                       ELSE meaning
                     END,
                     meaning_source = CASE
                       WHEN (meaning IS NULL OR meaning = '') AND ?1 IS NOT NULL THEN ?2
                       ELSE meaning_source
                     END,
                     pos = CASE
                       WHEN (pos IS NULL OR TRIM(pos) = '') AND ?3 IS NOT NULL THEN ?3
                       ELSE pos
                     END,
                     updated_at = datetime('now')
                 WHERE id = ?4 AND kind != 'grammar'`
              )
              .bind(nextMeaning, source, nextPos, wordId)
              .run();
        if (!(Number(result.meta?.changes ?? 0) > 0) && !nextExamples) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: "already_filled",
          });
          continue;
        }
      }

      if (nextExamples) {
        const exResult = allowOverwrite
          ? await db
              .prepare(
                `UPDATE jp_vocab_word
                 SET example_sentences = ?1,
                     example_sentences_source = ?2,
                     updated_at = datetime('now')
                 WHERE id = ?3`
              )
              .bind(nextExamples, source, wordId)
              .run()
          : await db
              .prepare(
                `UPDATE jp_vocab_word
                 SET example_sentences = ?1,
                     example_sentences_source = ?2,
                     updated_at = datetime('now')
                 WHERE id = ?3
                   AND (example_sentences IS NULL OR TRIM(example_sentences) = '')`
              )
              .bind(nextExamples, source, wordId)
              .run();
        if (!(Number(exResult.meta?.changes ?? 0) > 0)) {
          nextExamples = null;
        }
      }
    }

    if (!nextMeaning && !nextPos && !nextExamples) {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "already_filled",
      });
      continue;
    }

    updated += 1;
    applied.push({
      id: wordId,
      word: String(row.word),
      meaning: nextMeaning,
      pos: nextPos,
      example_sentences: nextExamples,
      meaning_source: source,
    });
  }

  return {
    updated,
    applied,
    skipped,
    dry_run: dryRun,
    upload_spec: JP_VOCAB_MEANING_UPLOAD_SPEC,
  };
}
