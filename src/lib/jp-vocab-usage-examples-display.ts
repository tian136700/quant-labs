/**
 * 日语语法「用法 + 例句」展示配对：第 N 条用法对应第 N 条例句。
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
};

export type JpVocabUsageExamplesPairedModel = {
  pairs: JpVocabUsageExamplePair[];
  fallbackUsage: string | null;
  pairCount: number;
  hasContent: boolean;
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
    if (pair.example?.text) {
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
