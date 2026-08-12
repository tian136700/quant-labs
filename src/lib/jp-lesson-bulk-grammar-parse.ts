/**
 * 日语新课「批量新增语法」粘贴解析。
 * 格式：编号块 + 释义 / 标注 / 口语频次 / 考试频次。
 */

import {
  canonicalizeJpVocabAnnotationAlias,
  parseJpVocabAnnotationInput,
  type JpVocabAnnotation,
} from "@/lib/jp-vocab-annotation";
import { clampJpVocabFrequency } from "@/lib/jp-vocab-frequency";

export type JpLessonBulkGrammarItem = {
  word: string;
  meaning: string | null;
  annotation: JpVocabAnnotation | null;
  oral_frequency: number | null;
  exam_frequency: number | null;
};

export type JpLessonBulkGrammarParseResult =
  | {
      ok: true;
      items: JpLessonBulkGrammarItem[];
      content: string;
      meanings: string | null;
      annotations: string | null;
    }
  | { ok: false; error: string; detail?: string };

const BLOCK_SPLIT_RE = /(?=^\d+[\.．、]\s*)/m;
const BLOCK_HEAD_RE = /^\d+[\.．、]\s*/;
const MEANING_RE = /^释义\s*[:：]\s*(.*)$/;
const ANNOTATION_RE = /^标注\s*[:：]\s*(.*)$/;
const ORAL_FREQ_RE = /^口语(?:频次|频率)\s*[:：]\s*(\d{1,2})\s*$/i;
const EXAM_FREQ_RE = /^考试(?:频次|频率)\s*[:：]\s*(\d{1,2})\s*$/i;

function parseOneBlock(rawBlock: string): JpLessonBulkGrammarItem | null {
  const lines = rawBlock
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  let wordLine = lines[0] || "";
  wordLine = wordLine.replace(BLOCK_HEAD_RE, "").trim();
  if (!wordLine) return null;

  let meaning: string | null = null;
  let annotationRaw = "";
  let oral: number | null = null;
  let exam: number | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const mMean = line.match(MEANING_RE);
    if (mMean) {
      meaning = (mMean[1] || "").trim() || null;
      continue;
    }
    const mAnn = line.match(ANNOTATION_RE);
    if (mAnn) {
      annotationRaw = canonicalizeJpVocabAnnotationAlias(mAnn[1] || "");
      continue;
    }
    const mOral = line.match(ORAL_FREQ_RE);
    if (mOral) {
      oral = clampJpVocabFrequency(mOral[1]);
      continue;
    }
    const mExam = line.match(EXAM_FREQ_RE);
    if (mExam) {
      exam = clampJpVocabFrequency(mExam[1]);
      continue;
    }
  }

  const annParsed = parseJpVocabAnnotationInput(annotationRaw);
  const annotation = annParsed.ok ? annParsed.value : null;

  return {
    word: wordLine,
    meaning,
    annotation,
    oral_frequency: oral,
    exam_frequency: exam,
  };
}

/**
 * 解析批量粘贴文本 → 条目 + 新课 content/meanings/annotations。
 */
export function parseJpLessonBulkGrammarText(
  text: string
): JpLessonBulkGrammarParseResult {
  const raw = (text || "").replace(/^\uFEFF/, "").trim();
  if (!raw) {
    return { ok: false, error: "text_empty" };
  }

  const chunks = raw
    .split(BLOCK_SPLIT_RE)
    .map((c) => c.trim())
    .filter(Boolean);

  const items: JpLessonBulkGrammarItem[] = [];
  for (const chunk of chunks) {
    if (!BLOCK_HEAD_RE.test(chunk)) {
      // 允许无编号的单块（整段当作一条）
      if (items.length === 0 && chunks.length === 1) {
        const fake = `1. ${chunk}`;
        const one = parseOneBlock(fake);
        if (one) items.push(one);
      }
      continue;
    }
    const one = parseOneBlock(chunk);
    if (one) items.push(one);
  }

  if (!items.length) {
    return { ok: false, error: "no_items", detail: "未识别到编号语法条目" };
  }

  // 拒绝空 lemma；标注非法（有非空但无法 canonicalize）已在 parse 中变 null——若原文非空且非法则报错
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (!it.word.trim()) {
      return { ok: false, error: "empty_word", detail: `第 ${i + 1} 条语法为空` };
    }
  }

  // 再扫一遍：块内「标注：」非空但 normalize 失败
  const rawBlocks = chunks.filter((c) => BLOCK_HEAD_RE.test(c));
  for (let i = 0; i < rawBlocks.length; i++) {
    const lines = rawBlocks[i]!
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const mAnn = line.match(ANNOTATION_RE);
      if (!mAnn) continue;
      const rawAnn = (mAnn[1] || "").trim();
      if (!rawAnn) continue;
      const parsed = parseJpVocabAnnotationInput(rawAnn);
      if (!parsed.ok) {
        return {
          ok: false,
          error: "invalid_annotation",
          detail: `第 ${i + 1} 条标注无效：${rawAnn}`,
        };
      }
    }
  }

  const content = items.map((it) => it.word).join(", ");
  const meaningsJoined = items.map((it) => it.meaning || "").join("|");
  const meanings = meaningsJoined.replace(/\|+$/, "").length
    ? meaningsJoined
    : null;
  const annJoined = items.map((it) => it.annotation || "").join("|");
  const annotations = annJoined.replace(/\|+$/, "").length ? annJoined : null;

  return {
    ok: true,
    items,
    content,
    meanings,
    annotations,
  };
}
