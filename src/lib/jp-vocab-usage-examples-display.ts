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
  isJpVocabContrastGrammar,
  jpVocabContrastPairLabel,
  jpVocabUsagePairLabel,
  parseJpVocabUsagePoints,
  splitJpVocabUsageDistinctionLead,
  stripJpVocabUsageConnectionNoise,
} from "@/lib/jp-vocab-usage-ai";
import { formatJpVocabUsageFrequencyDisplay } from "@/lib/jp-vocab-usage-frequency";

export type JpVocabUsageExamplePair = {
  index: number;
  usageLabel: string;
  usageText: string | null;
  /** 口语出现分 1～10（普通语法；对比/变形为 null） */
  oralFrequency?: number | null;
  /** 考试出现分 1～10 */
  examFrequency?: number | null;
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
  /** 读音对比课：卡片用表格展示区别 */
  isContrast?: boolean;
};

/** 二级序号：①～⑳，超出用 (21) */
export function jpVocabCircledExampleIndex(n: number): string {
  const i = Math.floor(Number(n));
  if (!Number.isFinite(i) || i < 1) return "①";
  if (i <= 20) return String.fromCharCode(0x245f + i); // ① = U+2460
  return `(${i})`;
}

function pairLabelFor(
  index: number,
  usageText: string | null | undefined,
  contrast: boolean
): string {
  if (contrast && usageText) {
    return jpVocabContrastPairLabel(index, usageText);
  }
  return jpVocabUsagePairLabel(index);
}

/** 标签已是 1.「なに」时，正文去掉开头「なに」：避免重复 */
function displayUsageBody(
  usageText: string | null | undefined,
  contrast: boolean
): string | null {
  const t = String(usageText ?? "").trim();
  if (!t) return null;
  if (!contrast) return t;
  return t.replace(/^「[^」]+」\s*[：:]\s*/u, "") || t;
}

export function buildJpVocabUsageExamplePairs(
  usage: string | null | undefined,
  exampleSentences: string | null | undefined,
  opts?: { word?: string | null; reading?: string | null }
): JpVocabUsageExamplesPairedModel {
  // 有接序字段时用法里常仍夹「接在…／构成＋」；展示前剥掉，避免与接序块重复
  const usageClean = stripJpVocabUsageConnectionNoise(String(usage ?? ""));
  const { lead, body: numberedBody } = splitJpVocabUsageDistinctionLead(
    usageClean
  );
  const points = parseJpVocabUsagePoints(numberedBody) ?? [];
  const examples = parseJpVocabExampleSentenceItems(
    String(exampleSentences ?? "")
  );
  const contrast =
    Boolean(lead?.trim()) ||
    isJpVocabContrastGrammar(String(opts?.word ?? ""), opts?.reading);
  const distinctionLead = lead?.trim()
    ? lead.trim().startsWith("【")
      ? lead.trim()
      : `【区别】\n${lead.trim()}`
    : null;

  if (!points.length) {
    const fallbackUsage =
      distinctionLead || usageClean.trim() || null;
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
      isContrast: contrast,
      nestExamplesUnderSingleUsage: false,
    };
  }

  const label = (i: number, text: string | null | undefined) =>
    pairLabelFor(i, text, contrast);
  const usageBody = (text: string | null | undefined) =>
    displayUsageBody(text, contrast);
  const freqFields = (pt: {
    oralFrequency?: number | null;
    examFrequency?: number | null;
  }) =>
    contrast
      ? { oralFrequency: null as number | null, examFrequency: null as number | null }
      : {
          oralFrequency: pt.oralFrequency ?? null,
          examFrequency: pt.examFrequency ?? null,
        };

  if (points.length === 1 && examples.length > 1) {
    return {
      pairs: [
        {
          index: 1,
          usageLabel: label(1, points[0]?.text),
          usageText: usageBody(points[0]?.text),
          ...freqFields(points[0] ?? {}),
          example: null,
          nestedExamples: examples,
        },
      ],
      fallbackUsage: distinctionLead,
      pairCount: 1,
      hasContent: true,
      useCircledExampleIndex: true,
      isContrast: contrast,
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
        usageLabel: label(i + 1, p.text),
        usageText: usageBody(p.text),
        ...freqFields(p),
        example: null,
        nestedExamples: slice.length ? slice : undefined,
      };
    });
    return {
      pairs,
      fallbackUsage: distinctionLead,
      pairCount: pairs.length,
      hasContent: pairs.length > 0,
      useCircledExampleIndex: true,
      isContrast: contrast,
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
        usageLabel: label(i + 1, points[i]?.text),
        usageText: usageBody(points[i]?.text),
        ...freqFields(points[i] ?? {}),
        example: examples[i] ?? null,
      });
    }
    const nested = examples.slice(last);
    pairs.push({
      index: points.length,
      usageLabel: label(points.length, points[last]?.text),
      usageText: usageBody(points[last]?.text),
      ...freqFields(points[last] ?? {}),
      example: null,
      nestedExamples: nested.length ? nested : undefined,
    });
    return {
      pairs,
      fallbackUsage: distinctionLead,
      pairCount: pairs.length,
      hasContent: pairs.length > 0,
      useCircledExampleIndex: true,
      isContrast: contrast,
      nestExamplesUnderSingleUsage: false,
    };
  }

  const pairs: JpVocabUsageExamplePair[] = [];
  for (let i = 0; i < points.length; i++) {
    pairs.push({
      index: i + 1,
      usageLabel: label(i + 1, points[i]?.text),
      usageText: usageBody(points[i]?.text),
      ...freqFields(points[i] ?? {}),
      example: examples[i] ?? null,
    });
  }

  return {
    pairs,
    fallbackUsage: distinctionLead,
    pairCount: pairs.length,
    hasContent: pairs.length > 0 || Boolean(distinctionLead),
    useCircledExampleIndex: true,
    isContrast: contrast,
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
  const byUsage = connectionOpts?.connectionByUsageIndex ?? {};
  const leftover = connectionOpts?.connectionLeftover ?? [];
  const tagged = Boolean(connectionOpts?.connectionHasUsageTagged);
  const usageIndexes = model.pairs
    .filter((p) => Boolean(p.usageText))
    .map((p) => p.index);
  const firstUsage = usageIndexes[0] ?? null;
  const lastUsage = usageIndexes[usageIndexes.length - 1] ?? null;

  const connFor = (usageIndex: number): string | null => {
    const taggedBody = byUsage[usageIndex]?.trim() || "";
    if (tagged) {
      const bits: string[] = [];
      if (taggedBody) bits.push(taggedBody);
      if (usageIndex === lastUsage && leftover.length) bits.push(...leftover);
      return bits.length ? bits.join("\n") : null;
    }
    if (usageIndex === firstUsage && leftover.length) {
      return leftover.join("\n");
    }
    return null;
  };

  if (model.isContrast) {
    const rows = buildJpVocabContrastComparisonRows(model, connFor);
    if (rows?.length) {
      blocks.push("【区别】");
      blocks.push(
        ["读法", "何时用", "接续"].join("\t"),
        ...rows.map((r) =>
          [r.form, r.when, r.connection?.trim() || "—"].join("\t")
        )
      );
    } else if (fallback) {
      blocks.push(fallback);
    }
  } else if (fallback) {
    blocks.push(fallback);
  }

  const circled = model.useCircledExampleIndex;
  for (const pair of model.pairs) {
    const lines: string[] = [];
    if (pair.usageText && !model.isContrast) {
      lines.push(`${pair.usageLabel}：${pair.usageText}`);
      const freqLine = formatJpVocabUsageFrequencyDisplay(
        pair.oralFrequency,
        pair.examFrequency
      );
      if (freqLine) lines.push(freqLine);
      const bits = connFor(pair.index);
      if (bits) lines.push(`接续：${bits}`);
    } else if (pair.usageText && model.isContrast) {
      lines.push(`${pair.usageLabel} 例句`);
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

/** 从对比课 label / 正文抽出读法（なに / なん） */
export function jpVocabContrastFormFromPair(
  usageLabel: string,
  usageText?: string | null
): string {
  const fromLabel = /\d+\.「([^」]+)」/.exec(String(usageLabel || ""));
  if (fromLabel) return fromLabel[1];
  const fromText = /^「([^」]+)」/.exec(String(usageText || "").trim());
  if (fromText) return fromText[1];
  return String(usageLabel || "")
    .replace(/^\d+\.?/, "")
    .replace(/用法|对照/g, "")
    .trim() || "—";
}

export type JpVocabContrastComparisonRow = {
  form: string;
  when: string;
  connection: string | null;
};

/** 对比课卡片表格行：读法 / 何时用 / 接续 */
export function buildJpVocabContrastComparisonRows(
  model: JpVocabUsageExamplesPairedModel,
  connectionTextFor: (usageIndex: number) => string | null
): JpVocabContrastComparisonRow[] | null {
  if (!model.isContrast) return null;
  const withUsage = model.pairs.filter((p) => Boolean(p.usageText));
  if (withUsage.length < 2) return null;
  return withUsage.map((p) => ({
    form: jpVocabContrastFormFromPair(p.usageLabel, p.usageText),
    when: String(p.usageText || "").trim(),
    connection: connectionTextFor(p.index),
  }));
}

