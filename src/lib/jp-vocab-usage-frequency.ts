/**
 * 日语「普通语法」每种用法旁的口语 / 考试出现分（1～10）。
 * 存库行内标记：`1. [口语7|考试8] 中文说明。(N4)`；展示剥标记后写「口语 7/10 · 考试 8/10」。
 * 对比课、变形课不加分（由 usage-ai 的 jpVocabGrammarNeedsPerUsageFrequency 判定）。
 */

import { clampJpVocabFrequency } from "@/lib/jp-vocab-frequency";

export const JP_VOCAB_USAGE_ORAL_FREQ_LABEL = "口语";
export const JP_VOCAB_USAGE_EXAM_FREQ_LABEL = "考试";

/** 编号行正文开头：`[口语7|考试8]`（兼容冒号、全角竖线） */
export const JP_VOCAB_USAGE_FREQUENCY_PREFIX_RE =
  /^\[\s*口语\s*[：:]?\s*(\d{1,2})\s*[|｜]\s*考试\s*[：:]?\s*(\d{1,2})\s*\]\s*(.+)$/u;

export type JpVocabUsageLineFrequency = {
  oralFrequency: number | null;
  examFrequency: number | null;
  text: string;
};

export function extractJpVocabUsageLineFrequency(
  body: string
): JpVocabUsageLineFrequency {
  const raw = String(body ?? "").trim();
  if (!raw) {
    return { oralFrequency: null, examFrequency: null, text: "" };
  }

  const m = JP_VOCAB_USAGE_FREQUENCY_PREFIX_RE.exec(raw);
  if (m) {
    const oral = clampJpVocabFrequency(m[1]);
    const exam = clampJpVocabFrequency(m[2]);
    const text = m[3].trim();
    if (oral != null && exam != null && text) {
      return { oralFrequency: oral, examFrequency: exam, text };
    }
  }

  // 宽松变体：`[口语：7｜考试：8]` 已由主正则覆盖；再认简写 `[7|8]`
  const short = /^\[\s*(\d{1,2})\s*[|｜]\s*(\d{1,2})\s*\]\s*(.+)$/u.exec(raw);
  if (short) {
    const oral = clampJpVocabFrequency(short[1]);
    const exam = clampJpVocabFrequency(short[2]);
    const text = short[3].trim();
    if (oral != null && exam != null && text) {
      return { oralFrequency: oral, examFrequency: exam, text };
    }
  }

  return { oralFrequency: null, examFrequency: null, text: raw };
}

export function formatJpVocabUsageFrequencyMarker(
  oral: number,
  exam: number
): string {
  const o = clampJpVocabFrequency(oral);
  const e = clampJpVocabFrequency(exam);
  if (o == null || e == null) return "";
  return `[口语${o}|考试${e}]`;
}

/** 写回编号行正文（有分则带标记） */
export function formatJpVocabUsageLineWithFrequency(
  text: string,
  oral: number | null | undefined,
  exam: number | null | undefined
): string {
  const body = String(text ?? "").trim();
  if (!body) return "";
  const o = clampJpVocabFrequency(oral);
  const e = clampJpVocabFrequency(exam);
  if (o == null || e == null) return body;
  return `${formatJpVocabUsageFrequencyMarker(o, e)} ${body}`;
}

/** 展示：「口语 7/10 · 考试 8/10」（缺一边则只显示有的） */
export function formatJpVocabUsageFrequencyDisplay(
  oral: number | null | undefined,
  exam: number | null | undefined
): string | null {
  const o = clampJpVocabFrequency(oral);
  const e = clampJpVocabFrequency(exam);
  const parts: string[] = [];
  if (o != null) parts.push(`${JP_VOCAB_USAGE_ORAL_FREQ_LABEL} ${o}/10`);
  if (e != null) parts.push(`${JP_VOCAB_USAGE_EXAM_FREQ_LABEL} ${e}/10`);
  return parts.length ? parts.join(" · ") : null;
}

export function jpVocabUsagePointHasCompleteFrequency(
  oral: number | null | undefined,
  exam: number | null | undefined
): boolean {
  return (
    clampJpVocabFrequency(oral) != null && clampJpVocabFrequency(exam) != null
  );
}

/** 整段 usage：普通语法且每条编号用法都有双分 → true */
export function jpVocabUsageHasCompletePerUsageFrequency(
  usage: string | null | undefined
): boolean {
  const text = String(usage ?? "").trim();
  if (!text) return false;
  // 延迟 import 解析，避免与 usage-ai 循环依赖：这里只做行级扫描
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let sawPoint = false;
  for (const line of lines) {
    const numbered = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/.exec(line);
    if (!numbered) continue;
    sawPoint = true;
    const extracted = extractJpVocabUsageLineFrequency(numbered[2]);
    if (
      !jpVocabUsagePointHasCompleteFrequency(
        extracted.oralFrequency,
        extracted.examFrequency
      )
    ) {
      return false;
    }
  }
  return sawPoint;
}

/** prompt：按用法写口语/考试分（普通语法） */
export function jpVocabUsagePerUsageFrequencyPromptAppendix(): string {
  return `
每种用法的出现频率（必须，写在编号后、中文说明前）：
- 每条用法都必须打「口语」与「考试」（JLPT）各 1～10 分：10=极常见，1=很少见。
- 口语=日常会话里出现频率；考试=JLPT 等考试里出现频率；可打不同分。
- 多条时按相对常用度区分，不要全部打同一分。
- 标记格式固定：编号后紧跟 [口语7|考试8]（半角方括号，竖线分隔），再接中文说明。
- 例：1. [口语9|考试7] 表示原因、理由：前句说明原因，后句说明结果。(N5)
- ❌ 不要把频率写到文末【出现频率】词级块；❌ 对比课/变形课不要写这些标记。`;
}

/** 存量只补分：给定已有编号用法，只回带标记的编号行 */
export function buildJpVocabUsageFrequencyOnlyAiPrompt(input: {
  word: string;
  reading?: string | null;
  meaning?: string | null;
  usage: string;
}): string {
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `读音：${reading}` : null,
    meaning ? `释义参考：${meaning}` : null,
    "类型：语法",
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

下面是该语法已有的编号用法（请保留中文说明与句末 (Nn) 原样，只在编号后补上口语/考试分标记）。

已有用法：
${String(input.usage || "").trim()}

硬规则：
- 只输出编号用法行（可含【区别】则原样保留，但对比课不应走到本任务）。
- 每行格式：数字. [口语n|考试m] 原文中文说明。(Nn)
- 口语=日常会话出现频率；考试=JLPT 出现频率；各 1～10。
- ❌ 禁止改写用法含义、禁止删等级、禁止加例句、禁止写【接序】、禁止 markdown。
- 多条时分数要有相对区分。`;
}
