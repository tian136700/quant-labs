/**
 * 英语「用法 + 例句」展示配对：第 N 条用法对应第 N 条例句（定时 fill 已按此约定写库）。
 * 存库字段仍分 usage / example_sentences；仅页面合并展示。
 */

import {
  parseEnVocabExampleSentenceItems,
  type EnVocabExampleSentenceItem,
} from "@/lib/en-vocab-example-sentences";
import {
  formatEnVocabUsageForDisplay,
  stripEnVocabUsageExamLabels,
} from "@/lib/en-vocab-usage-ai";

const NUMBERED_LINE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
const IMAGE_LINE_RE = /^!\[[^\]]*\]\([^)]+\)\s*$/;

const CN_ORDINALS = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
] as const;

export function enVocabUsageDisplayOrdinal(n: number): string {
  if (n >= 1 && n <= CN_ORDINALS.length) return CN_ORDINALS[n - 1];
  return String(n);
}

/** 「用法一」 */
export function enVocabUsagePairLabel(n: number): string {
  return `用法${enVocabUsageDisplayOrdinal(n)}`;
}

export type EnVocabUsagePointForDisplay = {
  text: string;
};

export function listEnVocabUsagePointsForDisplay(
  raw: string | null | undefined
): {
  points: EnVocabUsagePointForDisplay[];
  imageLines: string[];
  leftoverLines: string[];
} {
  const stripped = stripEnVocabUsageExamLabels(String(raw ?? ""));
  if (!stripped.trim()) {
    return { points: [], imageLines: [], leftoverLines: [] };
  }

  const points: EnVocabUsagePointForDisplay[] = [];
  const imageLines: string[] = [];
  const leftoverLines: string[] = [];

  for (const line of stripped.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (IMAGE_LINE_RE.test(trimmed)) {
      imageLines.push(trimmed);
      continue;
    }
    const m = NUMBERED_LINE_RE.exec(trimmed);
    if (m) {
      const body = m[2].trim();
      if (body) points.push({ text: body });
      continue;
    }
    leftoverLines.push(trimmed);
  }

  return { points, imageLines, leftoverLines };
}

export type EnVocabUsageExamplePair = {
  index: number;
  usageLabel: string;
  usageText: string | null;
  example: EnVocabExampleSentenceItem | null;
};

export type EnVocabUsageExamplesPairedModel = {
  pairs: EnVocabUsageExamplePair[];
  /** 无法拆编号时的整段用法（已 format 展示文案；可含图 markdown） */
  fallbackUsage: string | null;
  /** 用法正文里的图片行（编号配对时挂在块末） */
  imageLines: string[];
  pairCount: number;
  hasContent: boolean;
};

/**
 * 按序号配对用法与例句。多出来的一侧 usageText / example 为 null。
 * 无编号用法但有正文时：fallbackUsage 展示整段，例句仍进 pairs。
 */
export function buildEnVocabUsageExamplePairs(
  usage: string | null | undefined,
  exampleSentences: string | null | undefined
): EnVocabUsageExamplesPairedModel {
  const examples = parseEnVocabExampleSentenceItems(exampleSentences);
  const { points, imageLines, leftoverLines } =
    listEnVocabUsagePointsForDisplay(usage);
  const rawTrim = String(usage ?? "").trim();

  if (points.length === 0) {
    const fallback =
      formatEnVocabUsageForDisplay(rawTrim) ||
      (leftoverLines.length || imageLines.length
        ? [...leftoverLines, ...imageLines].join("\n")
        : "");
    const fallbackUsage = fallback.trim() || null;
    const pairs: EnVocabUsageExamplePair[] = examples.map((example, i) => ({
      index: i + 1,
      usageLabel: enVocabUsagePairLabel(i + 1),
      usageText: null,
      example,
    }));
    return {
      pairs,
      fallbackUsage,
      imageLines: [],
      pairCount: Math.max(pairs.length, fallbackUsage ? 1 : 0),
      hasContent: Boolean(fallbackUsage || pairs.length),
    };
  }

  const count = Math.max(points.length, examples.length);
  const pairs: EnVocabUsageExamplePair[] = [];
  for (let i = 0; i < count; i++) {
    pairs.push({
      index: i + 1,
      usageLabel: enVocabUsagePairLabel(i + 1),
      usageText: points[i]?.text ?? null,
      example: examples[i] ?? null,
    });
  }

  // 编号之外的散行并入 fallback，避免丢内容
  const fallbackExtra = leftoverLines.join("\n").trim();

  return {
    pairs,
    fallbackUsage: fallbackExtra || null,
    imageLines,
    pairCount: pairs.length,
    hasContent: pairs.length > 0 || Boolean(fallbackExtra) || imageLines.length > 0,
  };
}
