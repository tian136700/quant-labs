import {
  formatEnVocabExampleGlossLine,
  parseEnVocabExampleSentenceItems,
  stripEnVocabExampleGlossLabel,
  type EnVocabExampleSentenceItem,
} from "@/lib/en-vocab-example-sentences";
import {
  extractEnVocabUsageFrequency,
  formatEnVocabUsageForDisplay,
  formatEnVocabUsageFrequencyLabel,
  stripEnVocabUsageExamLabels,
} from "@/lib/en-vocab-usage-ai";

const NUMBERED_LINE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
const IMAGE_LINE_RE = /^!\[[^\]]*\]\([^)]+\)\s*$/;

/** 「1.用法」——展示一律阿拉伯数字，不用中文序号 */
export function enVocabUsagePairLabel(n: number): string {
  return `${n}.用法`;
}

export type EnVocabUsagePointForDisplay = {
  text: string;
  /** 出现频次 1～10；旧数据无标记时为 null */
  frequency: number | null;
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
      const { frequency, text: body } = extractEnVocabUsageFrequency(m[2].trim());
      if (body) points.push({ text: body, frequency });
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
  /** 出现频次 1～10 */
  frequency: number | null;
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
      frequency: null,
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
      frequency: points[i]?.frequency ?? null,
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

/**
 * 一键复制「用法与例句」弹窗全文（与页面配对展示一致；不含图片 markdown）。
 */
export function formatEnVocabUsageExamplesCopyText(
  model: EnVocabUsageExamplesPairedModel,
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
      const freqLabel = formatEnVocabUsageFrequencyLabel(pair.frequency);
      lines.push(
        freqLabel
          ? `${pair.usageLabel}：${pair.usageText}\n${freqLabel}`
          : `${pair.usageLabel}：${pair.usageText}`
      );
    }
    if (pair.example?.text) {
      lines.push(pair.example.text);
      const glossRaw = pair.example.gloss
        ? stripEnVocabExampleGlossLabel(pair.example.gloss)
        : "";
      const glossLine = glossRaw
        ? formatEnVocabExampleGlossLine(glossRaw)
        : "";
      if (glossLine) lines.push(glossLine);
    } else if (pair.usageText) {
      lines.push("（暂无对应用例）");
    }
    if (lines.length) blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n").trim();
}
