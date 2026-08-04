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

/** 行首可有列表前缀；分值后可有 /10（模型常抄 UI 文案） */
const _LINE_PREFIX = String.raw`^(?:[-*•]|\d{1,2}[.)、])?\s*`;
const _SCORE = String.raw`(\d{1,2})(?:\s*/\s*10)?(?:\s*[分点])?`;
const ORAL_LINE_RE = new RegExp(
  _LINE_PREFIX +
    String.raw`(?:口语(?:出现)?频率|oral(?:[_\s-]?freq(?:uency)?)?|口语)\s*[:：\s]\s*` +
    _SCORE +
    String.raw`\s*$`,
  "i"
);
const EXAM_LINE_RE = new RegExp(
  _LINE_PREFIX +
    String.raw`(?:考试(?:出现)?频率|exam(?:[_\s-]?freq(?:uency)?)?|考试)\s*[:：\s]\s*` +
    _SCORE +
    String.raw`\s*$`,
  "i"
);
const SAME_LINE_RE = new RegExp(
  String.raw`(?:口语(?:出现)?频率|oral(?:[_\s-]?freq(?:uency)?)?|口语)\s*[:：\s]\s*` +
    _SCORE +
    String.raw`\s*(?:[·|,，/\s]+)\s*` +
    String.raw`(?:考试(?:出现)?频率|exam(?:[_\s-]?freq(?:uency)?)?|考试)\s*[:：\s]\s*` +
    _SCORE,
  "i"
);
const JSON_ORAL_KEYS = ["oral_frequency", "oral", "oralFreq", "oral_freq"] as const;
const JSON_EXAM_KEYS = ["exam_frequency", "exam", "examFreq", "exam_freq"] as const;

function frequenciesFromJsonBlob(text: string): {
  oral: number | null;
  exam: number | null;
} {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { oral: null, exam: null };
  try {
    const data = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (!data || typeof data !== "object") return { oral: null, exam: null };
    let oral: number | null = null;
    let exam: number | null = null;
    for (const k of JSON_ORAL_KEYS) {
      if (k in data) {
        oral = clampJpVocabFrequency(data[k]);
        if (oral != null) break;
      }
    }
    for (const k of JSON_EXAM_KEYS) {
      if (k in data) {
        exam = clampJpVocabFrequency(data[k]);
        if (exam != null) break;
      }
    }
    return { oral, exam };
  } catch {
    return { oral: null, exam: null };
  }
}

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
  return `${title} ${score}/10`;
}

/** 存量只补词级口语/考试分（单词） */
export function buildJpVocabWordFrequencyOnlyAiPrompt(input: {
  word: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
}): string {
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const pos = input.pos?.trim();
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `读音：${reading}` : null,
    meaning ? `释义：${meaning}` : null,
    pos ? `词性：${pos}` : null,
    "类型：单词",
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

请只评估该词在真实场景中的相对出现频率（1＝很少见，10＝极常见）。
口语=日常会话；考试=JLPT 等考试。口语与考试可打不同分。

硬规则：
- 只输出下面频率块，不要释义、例句、解释。
- 分必须是 1～10 整数；禁止写成 8/10、附单位或解释。
- 口语与考试各占一行，标签用「口语频率」「考试频率」。

${JP_VOCAB_FREQUENCY_BLOCK_MARKER}
${JP_VOCAB_ORAL_FREQUENCY_LABEL}：8
${JP_VOCAB_EXAM_FREQUENCY_LABEL}：6`;
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
    const sameM = SAME_LINE_RE.exec(trimmed);
    if (sameM) {
      oral = clampJpVocabFrequency(sameM[1]) ?? oral;
      exam = clampJpVocabFrequency(sameM[2]) ?? exam;
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

  if (oral == null || exam == null) {
    const fromJson = frequenciesFromJsonBlob(text);
    if (oral == null) oral = fromJson.oral;
    if (exam == null) exam = fromJson.exam;
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
