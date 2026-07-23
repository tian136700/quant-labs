import "server-only";

import {
  buildEnVocabUsageAiPrompt,
  EN_VOCAB_USAGE_UPLOAD_SPEC,
  enVocabUsageHasExamLabel,
  normalizeEnVocabUsageSource,
  normalizeEnVocabUsageText,
  shieldEnVocabUsageUploadText,
  stripEnVocabUsageExamLabels,
  validateEnVocabUsageAiOutput,
} from "@/lib/en-vocab-usage-ai";
import { ensureEnVocabWordSchema } from "@/lib/en-vocab-db";

export type EnVocabMissingUsageRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  prompt: string;
};

export type EnVocabFillUsageApplied = {
  id: number;
  word: string;
  usage: string;
  usage_source: string | null;
};

export type EnVocabFillUsageResult = {
  updated: number;
  applied: EnVocabFillUsageApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: EnVocabMissingUsageRow[];
  total_missing?: number;
  upload_spec?: typeof EN_VOCAB_USAGE_UPLOAD_SPEC;
};

export type ListEnVocabMissingUsageOptions = {
  limit?: number;
  kind?: "word" | "grammar";
};

export async function countEnVocabWordsMissingUsage(
  db: D1Database,
  options: Pick<ListEnVocabMissingUsageOptions, "kind"> = {}
): Promise<number> {
  const kind = options.kind;
  const result =
    kind === "word" || kind === "grammar"
      ? await db
          .prepare(
            `SELECT COUNT(*) AS n FROM en_vocab_word
             WHERE (usage IS NULL OR TRIM(usage) = '')
               AND kind = ?1`
          )
          .bind(kind)
          .first<{ n: number }>()
      : await db
          .prepare(
            `SELECT COUNT(*) AS n FROM en_vocab_word
             WHERE usage IS NULL OR TRIM(usage) = ''`
          )
          .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listEnVocabWordsMissingUsage(
  db: D1Database,
  options: ListEnVocabMissingUsageOptions = {}
): Promise<EnVocabMissingUsageRow[]> {
  await ensureEnVocabWordSchema(db);
  const kind = options.kind;
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  let sql = `SELECT id, word, kind, reading, meaning, pos FROM en_vocab_word
       WHERE usage IS NULL OR TRIM(usage) = ''`;
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
    pos: string | null;
  }>();

  return (result.results ?? []).map((row) => {
    const word = String(row.word);
    const rowKind = String(row.kind);
    const reading =
      row.reading != null ? String(row.reading).trim() || null : null;
    const meaning =
      row.meaning != null ? String(row.meaning).trim() || null : null;
    const pos = row.pos != null ? String(row.pos).trim() || null : null;
    return {
      id: Number(row.id),
      word,
      kind: rowKind,
      reading,
      meaning,
      pos,
      prompt: buildEnVocabUsageAiPrompt({
        word,
        kind: rowKind,
        reading,
        meaning,
        pos,
      }),
    };
  });
}

export async function scanEnVocabWordsMissingUsage(
  db: D1Database,
  options: ListEnVocabMissingUsageOptions = {}
): Promise<EnVocabFillUsageResult> {
  const [missing, total_missing] = await Promise.all([
    listEnVocabWordsMissingUsage(db, options),
    countEnVocabWordsMissingUsage(db, options),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
    upload_spec: EN_VOCAB_USAGE_UPLOAD_SPEC,
  };
}

async function updateUsageIfEmpty(
  db: D1Database,
  wordId: number,
  usage: string,
  source: string | null,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE en_vocab_word
       SET usage = ?1,
           usage_source = ?2,
           updated_at = datetime('now')
       WHERE id = ?3
         AND (usage IS NULL OR TRIM(usage) = '')`
    )
    .bind(usage.trim(), source, wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export type EnVocabUsageUpdateItem = {
  word_id: number;
  usage: string;
  source?: string | null;
};

export async function applyEnVocabUsageUpdates(
  db: D1Database,
  updates: EnVocabUsageUpdateItem[],
  options: {
    dryRun?: boolean;
    validateFormat?: boolean;
    defaultSource?: string | null;
  } = {}
): Promise<EnVocabFillUsageResult> {
  await ensureEnVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const defaultSource = normalizeEnVocabUsageSource(options.defaultSource);
  const applied: EnVocabFillUsageApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    let usage = String(item.usage ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !usage) continue;

    const source = normalizeEnVocabUsageSource(item.source) ?? defaultSource;

    const row = await db
      .prepare(
        `SELECT id, word, kind, reading, meaning, pos FROM en_vocab_word WHERE id = ?1`
      )
      .bind(wordId)
      .first<{
        id: number;
        word: string;
        kind: string;
        reading: string | null;
        meaning: string | null;
        pos: string | null;
      }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }

    if (validateFormat) {
      // 上传屏蔽：IELTS/TOEFL/雅思/托福等标签直接剥掉后再校验
      const validated = validateEnVocabUsageAiOutput(usage, {
        word: String(row.word),
        kind: String(row.kind),
        reading: row.reading,
        meaning: row.meaning,
        pos: row.pos,
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
    } else {
      usage =
        normalizeEnVocabUsageText(shieldEnVocabUsageUploadText(usage)) ||
        shieldEnVocabUsageUploadText(usage);
    }

    const changed = await updateUsageIfEmpty(
      db,
      wordId,
      usage,
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
    upload_spec: EN_VOCAB_USAGE_UPLOAD_SPEC,
  };
}

const EN_VOCAB_USAGE_EXAM_LABEL_SQL = `(
  usage LIKE '%雅思%' OR usage LIKE '%托福%' OR usage LIKE '%四六级%'
  OR usage LIKE '%考研%' OR usage LIKE '%专四%' OR usage LIKE '%专八%'
  OR usage LIKE '%IELTS%' OR usage LIKE '%TOEFL%'
  OR usage LIKE '%ielts%' OR usage LIKE '%toefl%'
  OR usage LIKE '%GRE%' OR usage LIKE '%GMAT%' OR usage LIKE '%SAT%'
  OR usage LIKE '%CET%'
)`;

/** 扫库：剥掉用法正文里的考试标签并写回（可覆盖已有 usage） */
export async function stripEnVocabUsageExamLabelsInDb(
  db: D1Database,
  options: { dryRun?: boolean; limit?: number } = {}
): Promise<EnVocabFillUsageResult> {
  await ensureEnVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  let sql = `SELECT id, word, usage, usage_source FROM en_vocab_word
       WHERE usage IS NOT NULL AND TRIM(usage) != ''
         AND ${EN_VOCAB_USAGE_EXAM_LABEL_SQL}
       ORDER BY id`;
  const binds: number[] = [];
  if (limit != null) {
    sql += ` LIMIT ?1`;
    binds.push(limit);
  }

  const stmt = db.prepare(sql);
  const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all<{
    id: number;
    word: string;
    usage: string;
    usage_source: string | null;
  }>();

  const applied: EnVocabFillUsageApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const row of result.results ?? []) {
    const wordId = Number(row.id);
    const word = String(row.word);
    const prev = String(row.usage ?? "");
    if (!enVocabUsageHasExamLabel(prev)) {
      skipped.push({ id: wordId, word, reason: "no_exam_label" });
      continue;
    }
    const next = stripEnVocabUsageExamLabels(prev).trim();
    if (!next) {
      skipped.push({ id: wordId, word, reason: "empty_after_strip" });
      continue;
    }
    if (next === prev.trim()) {
      skipped.push({ id: wordId, word, reason: "unchanged" });
      continue;
    }

    const source =
      row.usage_source != null
        ? String(row.usage_source).trim() || null
        : null;

    if (!dryRun) {
      const run = await db
        .prepare(
          `UPDATE en_vocab_word
           SET usage = ?1,
               updated_at = datetime('now')
           WHERE id = ?2`
        )
        .bind(next, wordId)
        .run();
      if (Number(run.meta?.changes ?? 0) <= 0) {
        skipped.push({ id: wordId, word, reason: "update_failed" });
        continue;
      }
    }

    updated += 1;
    applied.push({
      id: wordId,
      word,
      usage: next,
      usage_source: source,
    });
  }

  return {
    updated,
    applied,
    skipped,
    dry_run: dryRun,
    upload_spec: EN_VOCAB_USAGE_UPLOAD_SPEC,
  };
}
