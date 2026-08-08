/**
 * 日语新课板书 Word（预生成、含 OJAD 读音）共用常量与指纹。
 * Mac 定时上传；老师下载取现成文件。
 */

import { parseJpVocabPitchAccent } from "@/lib/jp-vocab-pitch-accent";
import { JP_VOCAB_REF_R2_PREFIX } from "@/lib/jp-vocab-ref-shared";

/** 与 Python `BOARD_DOCX_FORMAT_VERSION` 同步；变了则全部重建板书 Word */
export const JP_LESSON_BOARD_DOCX_FORMAT_VERSION = "pitch-overline-v2";

/** R2：与教案图分开，如 vocab-ref/board/lesson-148.docx */
export function jpLessonBoardDocxR2Key(lessonId: number): string {
  return `${JP_VOCAB_REF_R2_PREFIX}board/lesson-${lessonId}.docx`;
}

export function jpLessonBoardDocxLocalMarker(lessonId: number): string {
  return `local:board:lesson-${lessonId}`;
}

export function isLocalJpLessonBoardDocxMarker(r2Key: string): boolean {
  return r2Key.startsWith("local:board:");
}

/**
 * 板书单元格文案兜底（无图画时）：只显示日语读音，禁止 NLLL／头高。
 * 实际 Word 由 Mac 脚本画 OJAD 顶横线图。
 */
export function formatJpLessonBoardPitchCell(input: {
  word: string;
  pitchAccentJson?: string | null;
  reading?: string | null;
}): string {
  const word = (input.word || "").trim();
  const parsed = parseJpVocabPitchAccent(input.pitchAccentJson);
  if (parsed?.kana) return parsed.kana;
  const reading = (input.reading || "").trim();
  return reading || word;
}

export type JpLessonBoardDocxFingerprintInput = {
  refUpdatedAt: string;
  content: string;
  meanings: string | null;
  /** 与 content 词序对齐的 pitch 摘要（如 kana|pattern 或 OJAD_NONE） */
  pitchDigests: string[];
};

/** 稳定指纹：版式版本 + 教案更新时间 + 内容 + 释义 + 各词音调摘要 */
export function buildJpLessonBoardDocxFingerprint(
  input: JpLessonBoardDocxFingerprintInput
): string {
  const meanings = (input.meanings || "").trim();
  const pitches = input.pitchDigests.map((d) => (d || "").trim()).join("\n");
  const raw = [
    JP_LESSON_BOARD_DOCX_FORMAT_VERSION,
    (input.refUpdatedAt || "").trim(),
    (input.content || "").trim(),
    meanings,
    pitches,
  ].join("\n---\n");
  return fnv1aHex(raw);
}

function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `v2-${hash.toString(16).padStart(8, "0")}`;
}

export function pitchDigestFromStored(input: {
  pitchAccent: string | null;
  pitchAccentSource: string | null;
}): string {
  const src = (input.pitchAccentSource || "").trim();
  if (src === "OJAD_NONE") return "OJAD_NONE";
  const parsed = parseJpVocabPitchAccent(input.pitchAccent);
  if (!parsed) return "";
  return `${parsed.kana}|${parsed.pattern}`;
}
