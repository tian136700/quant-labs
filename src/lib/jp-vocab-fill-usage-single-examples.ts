import "server-only";

import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import { parseJpVocabExampleSentenceItems } from "@/lib/jp-vocab-example-sentences";
import {
  countJpVocabUsagePoints,
  isJpVocabConjugationGrammar,
  isJpVocabContrastGrammar,
} from "@/lib/jp-vocab-usage-ai";

export type ListJpVocabMissingSingleUsageExamplesOptions = {
  limit?: number;
  wordId?: number;
};

/** 单用法语法：用法/接序已有，只把例句补到恰好 3 条（按接续类型） */
export type JpVocabMissingSingleUsageExamplesRow = {
  id: number;
  word: string;
  kind: "grammar";
  reading: string | null;
  meaning: string | null;
  usage: string;
  connection: string | null;
  course_label: string | null;
  example_sentences: string | null;
  example_count: number;
  prompt: string;
};

/** 已有用法+接序时，只补单用法例句到 3 条的 prompt */
export function buildJpVocabSingleUsageExamplesTopUpPrompt(input: {
  word: string;
  reading?: string | null;
  meaning?: string | null;
  usage: string;
  connection?: string | null;
  example_sentences?: string | null;
  course_label?: string | null;
}): string {
  const word = String(input.word || "").trim();
  const reading = String(input.reading ?? "").trim();
  const meaning = String(input.meaning ?? "").trim();
  const usage = String(input.usage || "").trim();
  const connection = String(input.connection ?? "").trim();
  const existing = String(input.example_sentences ?? "").trim();
  const course = String(input.course_label ?? "").trim();
  const lines = [
    `语法词条：${word}`,
    reading ? `读音：${reading}` : "",
    meaning ? `释义：${meaning}` : "",
    course ? `课次：${course}（例句难度对齐该课附近，禁止超纲）` : "",
    "",
    "任务：该语法只有 1 种用法。请输出恰好 3 条例句（可改写已有句），覆盖【接序】里不同词类/形态；接续不足 3 种则换场景。",
    "禁止改写用法与接序；禁止输出用法编号、禁止【接序】段；禁止句末语法说明括号。",
    "每条：日语行（句中每个汉字须 漢字(かな)）+ 下一行「译文：」自然中文。不要行首序号。",
    "禁止把词条占位「～／〜」写进例句；禁止译文叠「訳文：」。",
    "",
    "【已有用法】（保持不变）",
    usage,
    "",
    "【已有接序】（造句须对齐这些形态；勿改写）",
    connection || "（无；则造 3 种不同场景的自然句）",
    "",
    "【已有例句】（可保留改写；最终必须恰好 3 条）",
    existing || "（无）",
    "",
    "只输出 3 组例句（日语 + 译文：），不要其它内容。",
  ];
  return lines.filter((line) => line !== "").join("\n");
}

/**
 * 临时回填：仅「普通句型 + 恰好 1 种用法 + 例句不足 3」。
 * 多用法 / 变形课 / 对比课不进队。
 */
export async function listJpVocabGrammarMissingSingleUsageExamples(
  db: D1Database,
  options: ListJpVocabMissingSingleUsageExamplesOptions = {}
): Promise<JpVocabMissingSingleUsageExamplesRow[]> {
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

  let sql = `SELECT id, word, kind, reading, meaning, usage, example_sentences, connection, course_label
       FROM jp_vocab_word
       WHERE kind = 'grammar'
         AND usage IS NOT NULL AND TRIM(usage) != ''`;
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
    course_label: string | null;
  }>();

  const mapped = (result.results ?? [])
    .map((row) => {
      const word = String(row.word);
      if (isJpVocabConjugationGrammar(word)) return null;
      if (isJpVocabContrastGrammar(word)) return null;
      const usage =
        row.usage != null ? String(row.usage).trim() || null : null;
      if (!usage) return null;
      const usageN = countJpVocabUsagePoints(usage);
      if (usageN !== 1) return null;
      const examples =
        row.example_sentences != null
          ? String(row.example_sentences).trim() || null
          : null;
      const exN = examples
        ? parseJpVocabExampleSentenceItems(examples).length
        : 0;
      if (exN >= 3) return null;
      const reading =
        row.reading != null ? String(row.reading).trim() || null : null;
      const meaning =
        row.meaning != null ? String(row.meaning).trim() || null : null;
      const connection =
        row.connection != null ? String(row.connection).trim() || null : null;
      const course_label =
        row.course_label != null
          ? String(row.course_label).trim() || null
          : null;
      return {
        id: Number(row.id),
        word,
        kind: "grammar" as const,
        reading,
        meaning,
        usage,
        connection,
        course_label,
        example_sentences: examples,
        example_count: exN,
        prompt: buildJpVocabSingleUsageExamplesTopUpPrompt({
          word,
          reading,
          meaning,
          usage,
          connection,
          example_sentences: examples,
          course_label,
        }),
      };
    })
    .filter((row): row is JpVocabMissingSingleUsageExamplesRow => row != null);

  if (limit == null) return mapped;
  return mapped.slice(0, limit);
}

export async function countJpVocabGrammarMissingSingleUsageExamples(
  db: D1Database
): Promise<number> {
  const rows = await listJpVocabGrammarMissingSingleUsageExamples(db, {});
  return rows.length;
}

export async function scanJpVocabGrammarMissingSingleUsageExamples(
  db: D1Database,
  options: ListJpVocabMissingSingleUsageExamplesOptions = {}
): Promise<{
  missing: JpVocabMissingSingleUsageExamplesRow[];
  total_missing: number;
}> {
  const [missing, total_missing] = await Promise.all([
    listJpVocabGrammarMissingSingleUsageExamples(db, options),
    countJpVocabGrammarMissingSingleUsageExamples(db),
  ]);
  return { missing, total_missing };
}
