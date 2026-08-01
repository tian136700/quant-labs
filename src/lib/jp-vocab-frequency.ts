/**
 * 日语词条「口语 / 考试」出现频率（1～10），对齐英语用法出现频次打分。
 * 词级字段（非整条用法）；旧数据可为空。
 */

export const JP_VOCAB_FREQUENCY_MIN = 1;
export const JP_VOCAB_FREQUENCY_MAX = 10;

export const JP_VOCAB_ORAL_FREQUENCY_LABEL = "口语频率";
export const JP_VOCAB_EXAM_FREQUENCY_LABEL = "考试频率";
export const JP_VOCAB_COURSE_LABEL_DISPLAY = "课数";

/** AI 输出末尾频率块标题（剥掉后再解析用法/例句） */
export const JP_VOCAB_FREQUENCY_BLOCK_MARKER = "【出现频率】";

const ORAL_LINE_RE =
  /^(?:口语频率|口语出现频率|oral(?:[_\s-]?freq(?:uency)?)?)\s*[:：]\s*(\d{1,2})\s*$/i;
const EXAM_LINE_RE =
  /^(?:考试频率|考试出现频率|exam(?:[_\s-]?freq(?:uency)?)?)\s*[:：]\s*(\d{1,2})\s*$/i;

export function clampJpVocabFrequency(
  raw: number | string | null | undefined | unknown
): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  const score = Math.round(n);
  if (score < JP_VOCAB_FREQUENCY_MIN || score > JP_VOCAB_FREQUENCY_MAX) {
    return null;
  }
  return score;
}

export function formatJpVocabFrequencyLabel(
  kind: "oral" | "exam",
  frequency: number | null | undefined
): string | null {
  const score = clampJpVocabFrequency(frequency);
  if (score == null) return null;
  const title =
    kind === "oral"
      ? JP_VOCAB_ORAL_FREQUENCY_LABEL
      : JP_VOCAB_EXAM_FREQUENCY_LABEL;
  return `${title} ${score}`;
}

export type JpVocabFrequencyPair = {
  oral_frequency: number | null;
  exam_frequency: number | null;
};

/** 从整段 AI 文本提取口语/考试频率；返回剥掉频率行后的正文 */
export function extractJpVocabFrequencyFromAiText(raw: string): JpVocabFrequencyPair & {
  body: string;
} {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  if (!text.trim()) {
    return { oral_frequency: null, exam_frequency: null, body: "" };
  }

  let oral: number | null = null;
  let exam: number | null = null;
  const kept: string[] = [];
  let inFreqBlock = false;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (!inFreqBlock) kept.push(line);
      continue;
    }
    if (trimmed === JP_VOCAB_FREQUENCY_BLOCK_MARKER || trimmed === "【频率】") {
      inFreqBlock = true;
      continue;
    }
    const oralM = ORAL_LINE_RE.exec(trimmed);
    if (oralM) {
      oral = clampJpVocabFrequency(oralM[1]) ?? oral;
      inFreqBlock = true;
      continue;
    }
    const examM = EXAM_LINE_RE.exec(trimmed);
    if (examM) {
      exam = clampJpVocabFrequency(examM[1]) ?? exam;
      inFreqBlock = true;
      continue;
    }
    if (inFreqBlock) {
      // 频率块后若又出现正常内容，结束块
      inFreqBlock = false;
    }
    kept.push(line);
  }

  return {
    oral_frequency: oral,
    exam_frequency: exam,
    body: kept.join("\n").trim(),
  };
}

/** prompt 附录：请模型顺带打口语/考试频率 */
export function jpVocabFrequencyPromptAppendix(options?: {
  needOral?: boolean;
  needExam?: boolean;
}): string {
  const needOral = options?.needOral !== false;
  const needExam = options?.needExam !== false;
  if (!needOral && !needExam) return "";
  const lines: string[] = [
    `${JP_VOCAB_FREQUENCY_BLOCK_MARKER}`,
    "（词条在真实场景中的相对出现频率，1＝很少见，10＝极常见；口语与考试可打不同分）",
  ];
  if (needOral) {
    lines.push(`${JP_VOCAB_ORAL_FREQUENCY_LABEL}：8`);
  }
  if (needExam) {
    lines.push(`${JP_VOCAB_EXAM_FREQUENCY_LABEL}：6`);
  }
  return `

末尾请另起一块给出出现频率（不要写进用法/例句正文）：
${lines.join("\n")}`;
}
