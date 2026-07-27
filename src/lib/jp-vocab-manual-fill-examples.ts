import "server-only";

import {
  validateJpVocabExampleSentencesAiOutput,
} from "@/lib/jp-vocab-example-sentences-ai";
import { callJpVocabPaidLlm } from "@/lib/jp-vocab-paid-llm";
import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import {
  parseJpVocabUsagePoints,
  serializeJpVocabUsagePoints,
} from "@/lib/jp-vocab-usage-ai";
import type { CloudflareEnv } from "@/lib/types";

const NUMBERED_LINE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
const HAN_RE = /[\u4E00-\u9FFF]/;
const FENCE_RE = /^```(?:\w+)?\s*$/;
const USAGE_FURIGANA_PAREN_RE = /\([\u3040-\u309Fー]+\)/;

export type JpVocabManualFillExamplesResult = {
  ok: boolean;
  word_id: number;
  word: string;
  usage: string | null;
  example_sentences: string | null;
  usage_source: string | null;
  example_sentences_source: string | null;
  source: string | null;
  error?: string;
};

function stripFenceNoise(raw: string): string {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !FENCE_RE.test(line))
    .join("\n");
}

/** 编号行更像「中文用法」还是「日语例句」 */
function numberedLineLooksLikeUsage(body: string): boolean {
  const t = body.trim();
  if (!t || !HAN_RE.test(t)) return false;
  if (USAGE_FURIGANA_PAREN_RE.test(t)) return false;
  if (/^(译文|譯文)\s*[：:]/.test(t)) return false;
  // 日语例句常带句末「。」且假名多
  const kana = t.match(/[\u3040-\u30FFー]/g) || [];
  if (/[。！？…]$/.test(t) && kana.length >= 4) return false;
  return true;
}

/**
 * 解析管理员手动补全输出：
 * - 可有「1. 中文用法」；单用法下可跟 2+ 条例句
 * - 多用法时每种用法下通常 1 条例句
 * - 也可无用法，只有例句交替块
 */
export function parseJpVocabWordManualFillOutput(
  raw: string
): { usage: string | null; example_sentences: string } | null {
  const lines = stripFenceNoise(raw)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const usagePoints: { n: number; text: string }[] = [];
  const exampleChunks: string[] = [];
  let i = 0;
  let started = false;

  while (i < lines.length) {
    const line = lines[i];
    const numbered = NUMBERED_LINE_RE.exec(line);
    if (numbered && numberedLineLooksLikeUsage(numbered[2])) {
      started = true;
      usagePoints.push({
        n: usagePoints.length + 1,
        text: numbered[2].trim(),
      });
      i += 1;
      continue;
    }

    let jp = line;
    if (numbered) {
      jp = numbered[2].trim();
    }
    i += 1;
    if (i >= lines.length) return null;
    const gloss = lines[i];
    if (!/^(译文|譯文)\s*[：:]/.test(gloss)) return null;
    exampleChunks.push(jp, gloss);
    started = true;
    i += 1;
  }

  if (!started || exampleChunks.length < 2) return null;
  const example_sentences = exampleChunks.join("\n");
  const usage =
    usagePoints.length > 0
      ? serializeJpVocabUsagePoints(usagePoints)
      : null;
  if (usage && !parseJpVocabUsagePoints(usage)) return null;
  return { usage, example_sentences };
}

export function buildJpVocabWordManualFillPrompt(input: {
  word: string;
  reading?: string | null;
  meaning?: string | null;
}): string {
  const reading = String(input.reading ?? "").trim();
  const meaning = String(input.meaning ?? "").trim();
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `读音：${reading}` : null,
    meaning ? `释义：${meaning}` : null,
    "类型：单词",
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

请为上述日语单词写「用法 + 例句」，供 N5/N4 初学者复习。这是管理员手动重补（可覆盖旧例句）。

条数与结构（必须遵守）：
1. 先判断该词有几种常用用法。
2. 每种用法写一行：「N. 中文用法说明」（只要中文，不要整段日语；单词用法不要写 (N5) 等级括号）。
3. 若只有 1 种用法：只写「1. …」一行，下面跟 **2 条**例句（换场景），每条「日语」下一行「译文：」。
4. 若有 2 种及以上用法：每种用法下面跟 **1 条**例句（用法与例句按顺序对应）。
5. 中文译文必须自然通顺。禁止「星期三是学校」这类不通顺死译。
6. 句中每一个汉字后立刻半角括号假名；N5 口语短句；必须自然用到该词。
7. 一句尽量一个「は」；不要叠双は。
8. 只输出用法行与例句/译文，不要 markdown、不要解释、不要行首给例句再编 1. 2.（用法行才用编号）。

格式示例（仅 1 种用法 → 1 行用法 + 2 条例句）：
1. 表示一星期中的星期三
来週(らいしゅう)の水曜日(すいようび)は忙(いそが)しいです。
译文：下星期三很忙。
水曜日(すいようび)に映画(えいが)を見(み)ます。
译文：我星期三看电影。`;
}

async function overwriteWordUsageAndExamples(
  db: D1Database,
  wordId: number,
  usage: string | null,
  usageSource: string | null,
  exampleSentences: string,
  exampleSource: string | null
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET usage = ?1,
           usage_source = ?2,
           example_sentences = ?3,
           example_sentences_source = ?4,
           updated_at = datetime('now')
       WHERE id = ?5`
    )
    .bind(
      usage,
      usage ? usageSource : null,
      exampleSentences,
      exampleSource,
      wordId
    )
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

/**
 * 管理员手动：调线上大模型重补单词用法+例句（可覆盖）。
 * 语法请继续用 fill-usage；此处仅处理 kind=word。
 */
export async function runJpVocabManualFillExamplesForWord(
  env: CloudflareEnv,
  wordId: number
): Promise<JpVocabManualFillExamplesResult> {
  await ensureJpVocabWordSchema(env.DB);
  const id = Number(wordId);
  if (!Number.isInteger(id) || id <= 0) {
    return {
      ok: false,
      word_id: id,
      word: "",
      usage: null,
      example_sentences: null,
      usage_source: null,
      example_sentences_source: null,
      source: null,
      error: "invalid_word_id",
    };
  }

  const row = await env.DB.prepare(
    `SELECT id, word, kind, reading, meaning, usage, example_sentences
     FROM jp_vocab_word WHERE id = ?1`
  )
    .bind(id)
    .first<{
      id: number;
      word: string;
      kind: string;
      reading: string | null;
      meaning: string | null;
      usage: string | null;
      example_sentences: string | null;
    }>();

  if (!row) {
    return {
      ok: false,
      word_id: id,
      word: "",
      usage: null,
      example_sentences: null,
      usage_source: null,
      example_sentences_source: null,
      source: null,
      error: "not_found",
    };
  }

  const word = String(row.word);
  if (String(row.kind) === "grammar") {
    return {
      ok: false,
      word_id: id,
      word,
      usage: null,
      example_sentences: null,
      usage_source: null,
      example_sentences_source: null,
      source: null,
      error: "grammar_use_fill_usage",
    };
  }

  let llm;
  try {
    llm = await callJpVocabPaidLlm(
      buildJpVocabWordManualFillPrompt({
        word,
        reading: row.reading,
        meaning: row.meaning,
      }),
      { env, maxTokens: 2500, temperature: 0.35 }
    );
  } catch (err) {
    return {
      ok: false,
      word_id: id,
      word,
      usage: null,
      example_sentences: null,
      usage_source: null,
      example_sentences_source: null,
      source: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const parsed = parseJpVocabWordManualFillOutput(llm.text);
  if (!parsed) {
    return {
      ok: false,
      word_id: id,
      word,
      usage: null,
      example_sentences: null,
      usage_source: null,
      example_sentences_source: null,
      source: llm.source,
      error: "parse_failed",
    };
  }

  const validated = validateJpVocabExampleSentencesAiOutput(
    parsed.example_sentences,
    {
      word,
      kind: "word",
      reading: row.reading,
      meaning: row.meaning,
      usage: parsed.usage,
    }
  );
  if (!validated.ok) {
    return {
      ok: false,
      word_id: id,
      word,
      usage: parsed.usage,
      example_sentences: parsed.example_sentences,
      usage_source: null,
      example_sentences_source: null,
      source: llm.source,
      error: `invalid_format:${validated.reason}`,
    };
  }

  const usage = parsed.usage;
  const usageSource = usage ? llm.source : null;
  const exampleSource = llm.source;
  await overwriteWordUsageAndExamples(
    env.DB,
    id,
    usage,
    usageSource,
    validated.text,
    exampleSource
  );

  return {
    ok: true,
    word_id: id,
    word,
    usage,
    example_sentences: validated.text,
    usage_source: usageSource,
    example_sentences_source: exampleSource,
    source: llm.source,
  };
}
