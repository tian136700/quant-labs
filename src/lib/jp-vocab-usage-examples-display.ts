/**
 * 日语语法「用法 + 例句」展示配对：第 N 条用法对应第 N 条例句。
 * 单词：仅 1 条用法且多条例句时，全部例句挂在用法 1 下（嵌套 ①②）。
 * 多用法且例句数是用法数整数倍（如 2 用法 4 例句）：按块均分到各用法下，避免把「有时候」例句错挂到「た形」用法。
 * 否则：前 N 条 1:1，余下仍挂末条（兼容旧脏数据）。
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
  stripJpVocabUsageConnectionNoise,
} from "@/lib/jp-vocab-usage-ai";

export type JpVocabUsageExamplePair = {
  index: number;
  usageLabel: string;
  usageText: string | null;
  example: JpVocabExampleSentenceItem | null;
  /** 单词单用法多例句 / 多用法均分块：挂在该用法下的全部例句 */
  nestedExamples?: JpVocabExampleSentenceItem[];
};

export type JpVocabUsageExamplesPairedModel = {
  pairs: JpVocabUsageExamplePair[];
  fallbackUsage: string | null;
  pairCount: number;
  hasContent: boolean;
  /** 有编号用法：例句用二级圈号 ①②；无用法则例句用一级阿拉伯数字 */
  useCircledExampleIndex: boolean;
  /** 单词：单用法下嵌套多条例句 */
  nestExamplesUnderSingleUsage: boolean;
};

/** 二级序号：①～⑳，超出用 (21) */
export function jpVocabCircledExampleIndex(n: number): string {
  const i = Math.floor(Number(n));
  if (!Number.isFinite(i) || i < 1) return "①";
  if (i <= 20) return String.fromCharCode(0x245f + i); // ① = U+2460
  return `(${i})`;
}

export function buildJpVocabUsageExamplePairs(
  usage: string | null | undefined,
  exampleSentences: string | null | undefined
): JpVocabUsageExamplesPairedModel {
  // 有接序字段时用法里常仍夹「接在…／构成＋」；展示前剥掉，避免与接序块重复
  const usageClean = stripJpVocabUsageConnectionNoise(String(usage ?? ""));
  const points = parseJpVocabUsagePoints(usageClean) ?? [];
  const examples = parseJpVocabExampleSentenceItems(
    String(exampleSentences ?? "")
  );

  if (!points.length) {
    const fallbackUsage = usageClean.trim() || null;
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
      useCircledExampleIndex: false,
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
      useCircledExampleIndex: true,
      nestExamplesUnderSingleUsage: true,
    };
  }

  // 例句数是用法数的整数倍（且 >1 倍）：按块均分，如 2 用法×2 例句
  if (
    examples.length > points.length &&
    examples.length % points.length === 0
  ) {
    const chunk = examples.length / points.length;
    const pairs: JpVocabUsageExamplePair[] = points.map((p, i) => {
      const slice = examples.slice(i * chunk, (i + 1) * chunk);
      return {
        index: i + 1,
        usageLabel: jpVocabUsagePairLabel(i + 1),
        usageText: p.text ?? null,
        example: null,
        nestedExamples: slice.length ? slice : undefined,
      };
    });
    return {
      pairs,
      fallbackUsage: null,
      pairCount: pairs.length,
      hasContent: pairs.length > 0,
      useCircledExampleIndex: true,
      nestExamplesUnderSingleUsage: false,
    };
  }

  // 例句多于用法但无法均分：前 N-1 一对一；末条挂自己的 + 余下（兼容脏数据）
  if (examples.length > points.length) {
    const last = points.length - 1;
    const pairs: JpVocabUsageExamplePair[] = [];
    for (let i = 0; i < last; i++) {
      pairs.push({
        index: i + 1,
        usageLabel: jpVocabUsagePairLabel(i + 1),
        usageText: points[i]?.text ?? null,
        example: examples[i] ?? null,
      });
    }
    const nested = examples.slice(last);
    pairs.push({
      index: points.length,
      usageLabel: jpVocabUsagePairLabel(points.length),
      usageText: points[last]?.text ?? null,
      example: null,
      nestedExamples: nested.length ? nested : undefined,
    });
    return {
      pairs,
      fallbackUsage: null,
      pairCount: pairs.length,
      hasContent: pairs.length > 0,
      useCircledExampleIndex: true,
      nestExamplesUnderSingleUsage: false,
    };
  }

  const pairs: JpVocabUsageExamplePair[] = [];
  for (let i = 0; i < points.length; i++) {
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
    useCircledExampleIndex: true,
    nestExamplesUnderSingleUsage: false,
  };
}

export function formatJpVocabUsageExamplesCopyText(
  model: JpVocabUsageExamplesPairedModel,
  wordLabel?: string | null,
  connectionOpts?: {
    connectionByUsageIndex?: Record<number, string>;
    connectionLeftover?: string[];
    connectionHasUsageTagged?: boolean;
  }
): string {
  if (!model.hasContent) return "";

  const blocks: string[] = [];
  const word = String(wordLabel ?? "").trim();
  if (word) blocks.push(word);

  const fallback = String(model.fallbackUsage ?? "").trim();
  if (fallback) blocks.push(fallback);

  const byUsage = connectionOpts?.connectionByUsageIndex ?? {};
  const leftover = connectionOpts?.connectionLeftover ?? [];
  const tagged = Boolean(connectionOpts?.connectionHasUsageTagged);
  const usageIndexes = model.pairs
    .filter((p) => Boolean(p.usageText))
    .map((p) => p.index);
  const firstUsage = usageIndexes[0] ?? null;
  const lastUsage = usageIndexes[usageIndexes.length - 1] ?? null;

  const circled = model.useCircledExampleIndex;
  for (const pair of model.pairs) {
    const lines: string[] = [];
    if (pair.usageText) {
      lines.push(`${pair.usageLabel}：${pair.usageText}`);
      const taggedBody = byUsage[pair.index]?.trim() || "";
      const bits: string[] = [];
      if (tagged) {
        if (taggedBody) bits.push(taggedBody);
        if (pair.index === lastUsage && leftover.length) bits.push(...leftover);
      } else if (pair.index === firstUsage && leftover.length) {
        bits.push(...leftover);
      }
      if (bits.length) {
        lines.push(`接续：${bits.join("\n")}`);
      }
    }
    const nested = pair.nestedExamples;
    if (nested && nested.length) {
      nested.forEach((ex, i) => {
        const mark = circled
          ? jpVocabCircledExampleIndex(i + 1)
          : `${i + 1}.`;
        lines.push(`${mark} ${ex.text}`);
        const glossRaw = ex.glossLines[0]
          ? stripJpVocabExampleGlossLabel(ex.glossLines[0])
          : "";
        const glossLine = glossRaw ? formatJpVocabExampleGlossLine(glossRaw) : "";
        if (glossLine) lines.push(glossLine);
      });
    } else if (pair.example?.text) {
      if (circled && pair.usageText) {
        lines.push(`${jpVocabCircledExampleIndex(1)} ${pair.example.text}`);
      } else if (!pair.usageText) {
        lines.push(`${pair.index}. ${pair.example.text}`);
      } else {
        lines.push(pair.example.text);
      }
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
