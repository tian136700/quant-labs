/**
 * 日语语法「用法 + 例句」展示配对：第 N 条用法对应第 N 条例句。
 * 单词：仅 1 条用法且多条例句时，全部例句挂在用法 1 下（嵌套 1. 2.）。
 * 存库字段仍分 usage / example_sentences；仅页面合并展示。
 */

import {
  formatJpVocabExampleGlossLine,
  parseJpVocabExampleSentenceItems,
  stripJpVocabExampleGlossLabel,
  type JpVocabExampleSentenceItem,
} from "@/lib/jp-vocab-example-sentences";
import {
  jpVocabUsagePairLabel,
  parseJpVocabUsagePoints,
} from "@/lib/jp-vocab-usage-ai";

export type JpVocabUsageExamplePair = {
  index: number;
  usageLabel: string;
  usageText: string | null;
  example: JpVocabExampleSentenceItem | null;
  /** 单词单用法多例句：挂在该用法下的全部例句 */
  nestedExamples?: JpVocabExampleSentenceItem[];
};

export type JpVocabUsageExamplesPairedModel = {
  pairs: JpVocabUsageExamplePair[];
  fallbackUsage: string | null;
  pairCount: number;
  hasContent: boolean;
  /** 单词：单用法下嵌套多条例句 */
  nestExamplesUnderSingleUsage: boolean;
};

export function buildJpVocabUsageExamplePairs(
  usage: string | null | undefined,
  exampleSentences: string | null | undefined
): JpVocabUsageExamplesPairedModel {
  const points = parseJpVocabUsagePoints(String(usage ?? "")) ?? [];
  const examples = parseJpVocabExampleSentenceItems(
    String(exampleSentences ?? "")
  );

  if (!points.length) {
    const fallbackUsage = String(usage ?? "").trim() || null;
    const pairs: JpVocabUsageExamplePair[] = examples.map((example, i) => ({
      index: i + 1,
      usageLabel: jpVocabUsagePairLabel(i + 1),
      usageText: null,
      example,
    }));
    return {
      pairs,
      fallbackUsage,
      pairCount: Math.max(pairs.length, fallbackUsage ? 1 : 0),
      hasContent: Boolean(fallbackUsage || pairs.length),
      nestExamplesUnderSingleUsage: false,
    };
  }

  if (points.length === 1 && examples.length > 1) {
    return {
      pairs: [
        {
          index: 1,
          usageLabel: jpVocabUsagePairLabel(1),
          usageText: points[0]?.text ?? null,
          example: null,
          nestedExamples: examples,
        },
      ],
      fallbackUsage: null,
      pairCount: 1,
      hasContent: true,
      nestExamplesUnderSingleUsage: true,
    };
  }

  const count = Math.max(points.length, examples.length);
  const pairs: JpVocabUsageExamplePair[] = [];
  for (let i = 0; i < count; i++) {
    pairs.push({
      index: i + 1,
      usageLabel: jpVocabUsagePairLabel(i + 1),
      usageText: points[i]?.text ?? null,
      example: examples[i] ?? null,
    });
  }

  return {
    pairs,
    fallbackUsage: null,
    pairCount: pairs.length,
    hasContent: pairs.length > 0,
    nestExamplesUnderSingleUsage: false,
  };
}

export function formatJpVocabUsageExamplesCopyText(
  model: JpVocabUsageExamplesPairedModel,
  wordLabel?: string | null
): string {
  if (!model.hasContent) return "";

  const blocks: string[] = [];
  const word = String(wordLabel ?? "").trim();
  if (word) blocks.push(word);

  const fallback = String(model.fallbackUsage ?? "").trim();
  if (fallback) blocks.push(fallback);

  for (const pair of model.pairs) {
    const lines: string[] = [];
    if (pair.usageText) {
      lines.push(`${pair.usageLabel}：${pair.usageText}`);
    }
    const nested = pair.nestedExamples;
    if (nested && nested.length) {
      nested.forEach((ex, i) => {
        lines.push(`${i + 1}. ${ex.text}`);
        const glossRaw = ex.glossLines[0]
          ? stripJpVocabExampleGlossLabel(ex.glossLines[0])
          : "";
        const glossLine = glossRaw ? formatJpVocabExampleGlossLine(glossRaw) : "";
        if (glossLine) lines.push(glossLine);
      });
    } else if (pair.example?.text) {
      lines.push(pair.example.text);
      const glossRaw = pair.example.glossLines[0]
        ? stripJpVocabExampleGlossLabel(pair.example.glossLines[0])
        : "";
      const glossLine = glossRaw ? formatJpVocabExampleGlossLine(glossRaw) : "";
      if (glossLine) lines.push(glossLine);
    } else if (pair.usageText) {
      lines.push("（暂无对应用例）");
    }
    if (lines.length) blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n").trim();
}
