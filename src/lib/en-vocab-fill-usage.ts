import "server-only";

import {
  buildEnVocabUsageAiPrompt,
  buildEnVocabUsageFrequencyBackfillPrompt,
  EN_VOCAB_USAGE_UPLOAD_SPEC,
  enVocabUsageHasCompleteFrequency,
  enVocabUsageHasExamLabel,
  enVocabUsagePointHasCompleteFrequency,
  normalizeEnVocabUsageSource,
  parseEnVocabUsagePoints,
  serializeEnVocabUsagePoints,
  shieldEnVocabUsageUploadText,
  stripEnVocabUsageExamLabels,
  validateEnVocabUsageAiOutput,
} from "@/lib/en-vocab-usage-ai";
import {
  ensureEnVocabWordSchema,
  peekEnVocabDailyDisplayOrderIds,
} from "@/lib/en-vocab-db";
import { sortEnVocabFillRowsByDailyOrder } from "@/lib/en-vocab-fill-daily-priority";

export type EnVocabMissingUsageRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  category: string | null;
  /** 已有用法正文（仅「缺口语/考试双频次」回填时带上） */
  usage?: string | null;
  /** true=已有用法但缺 [口语n|考试m]，只需补双分 */
  needs_frequency_only?: boolean;
  /** 当日序号（1-based）；不在日序里则为 null */
  daily_seq?: number | null;
  prompt: string;
};

/** SQL：看不到双频次，或仍残留旧单分 `[1]`～`[10]`（需回填口语分） */
const EN_VOCAB_USAGE_NO_DUAL_FREQ_MARKER_SQL = `(
  usage NOT LIKE '%[口语%'
  OR usage NOT LIKE '%|考试%'
  OR usage LIKE '%[1]%'
  OR usage LIKE '%[2]%'
  OR usage LIKE '%[3]%'
  OR usage LIKE '%[4]%'
  OR usage LIKE '%[5]%'
  OR usage LIKE '%[6]%'
  OR usage LIKE '%[7]%'
  OR usage LIKE '%[8]%'
  OR usage LIKE '%[9]%'
  OR usage LIKE '%[10]%'
)`;

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

/** 空用法，或有用法但正文看不到完整双频次标记 */
function enVocabUsageMissingWhereSql(kindBindIndex: number | null): string {
  const kindClause =
    kindBindIndex != null ? ` AND kind = ?${kindBindIndex}` : "";
  return `(
    usage IS NULL OR TRIM(usage) = ''
    OR (
      usage IS NOT NULL AND TRIM(usage) != ''
      AND ${EN_VOCAB_USAGE_NO_DUAL_FREQ_MARKER_SQL}
    )
  )${kindClause}`;
}

export async function countEnVocabWordsMissingUsage(
  db: D1Database,
  options: Pick<ListEnVocabMissingUsageOptions, "kind"> = {}
): Promise<number> {
  const kind = options.kind;
  const useKind = kind === "word" || kind === "grammar";
  const result = useKind
    ? await db
        .prepare(
          `SELECT COUNT(*) AS n FROM en_vocab_word
           WHERE ${enVocabUsageMissingWhereSql(1)}`
        )
        .bind(kind)
        .first<{ n: number }>()
    : await db
        .prepare(
          `SELECT COUNT(*) AS n FROM en_vocab_word
           WHERE ${enVocabUsageMissingWhereSql(null)}`
        )
        .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

function mapMissingUsageRow(row: {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  category: string | null;
  usage?: string | null;
}): EnVocabMissingUsageRow {
  const word = String(row.word);
  const rowKind = String(row.kind);
  const reading =
    row.reading != null ? String(row.reading).trim() || null : null;
  const meaning =
    row.meaning != null ? String(row.meaning).trim() || null : null;
  const pos = row.pos != null ? String(row.pos).trim() || null : null;
  const category =
    row.category != null ? String(row.category).trim() || null : null;
  const existingUsage =
    row.usage != null ? String(row.usage).trim() || null : null;
  const needsFrequencyOnly = Boolean(
    existingUsage && !enVocabUsageHasCompleteFrequency(existingUsage)
  );

  const prompt = needsFrequencyOnly
    ? buildEnVocabUsageFrequencyBackfillPrompt({
        word,
        kind: rowKind,
        usage: existingUsage!,
        reading,
        meaning,
        pos,
        category,
      })
    : buildEnVocabUsageAiPrompt({
        word,
        kind: rowKind,
        reading,
        meaning,
        pos,
        category,
      });

  return {
    id: Number(row.id),
    word,
    kind: rowKind,
    reading,
    meaning,
    pos,
    category,
    usage: needsFrequencyOnly ? existingUsage : null,
    needs_frequency_only: needsFrequencyOnly || undefined,
    prompt,
  };
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

  const binds: Array<string | number> = [];
  const useKind = kind === "word" || kind === "grammar";
  if (useKind) binds.push(kind);

  const sql = `SELECT id, word, kind, reading, meaning, pos, category, usage FROM en_vocab_word
       WHERE ${enVocabUsageMissingWhereSql(useKind ? 1 : null)}`;

  const [orderIds, result] = await Promise.all([
    peekEnVocabDailyDisplayOrderIds(db),
    (binds.length > 0 ? db.prepare(sql).bind(...binds) : db.prepare(sql)).all<{
      id: number;
      word: string;
      kind: string;
      reading: string | null;
      meaning: string | null;
      pos: string | null;
      category: string | null;
      usage: string | null;
    }>(),
  ]);

  const filtered = (result.results ?? [])
    .map(mapMissingUsageRow)
    .filter((row) => {
      // SQL 粗筛后：若已有用法但其实已齐全（误伤），丢掉
      if (row.needs_frequency_only && row.usage) {
        return !enVocabUsageHasCompleteFrequency(row.usage);
      }
      return true;
    });

  return sortEnVocabFillRowsByDailyOrder(filtered, orderIds, limit);
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
  dryRun: boolean,
  force = false
): Promise<boolean> {
  if (dryRun) return true;

  if (!force) {
    const existing = await db
      .prepare(`SELECT usage FROM en_vocab_word WHERE id = ?1`)
      .bind(wordId)
      .first<{ usage: string | null }>();
    const cur = existing?.usage != null ? String(existing.usage).trim() : "";
    // 已有完整频次用法 → 不覆盖（除非 force）
    if (cur && enVocabUsageHasCompleteFrequency(cur)) {
      return false;
    }
  }

  const result = await db
    .prepare(
      `UPDATE en_vocab_word
       SET usage = ?1,
           usage_source = ?2,
           updated_at = datetime('now')
       WHERE id = ?3`
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
    /** 线上付费整词刷新：覆盖已有用法 */
    force?: boolean;
  } = {}
): Promise<EnVocabFillUsageResult> {
  await ensureEnVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const force = Boolean(options.force);
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
      // 线上 force：条数可放宽，但口语/考试双频次仍必填（卡片要展示）
      usage = shieldEnVocabUsageUploadText(usage).trim() || usage;
      const points = parseEnVocabUsagePoints(usage);
      if (!points || points.length < 1) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "invalid_format:invalid_numbering",
        });
        continue;
      }
      if (
        points.some(
          (p) =>
            !enVocabUsagePointHasCompleteFrequency(
              p.oralFrequency,
              p.examFrequency
            )
        )
      ) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "invalid_format:missing_frequency",
        });
        continue;
      }
      usage = serializeEnVocabUsagePoints(points);
    }

    const changed = await updateUsageIfEmpty(
      db,
      wordId,
      usage,
      source,
      dryRun,
      force
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
