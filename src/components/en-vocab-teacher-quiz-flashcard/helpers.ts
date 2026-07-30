"use client";

import { parseEnVocabClassNotes } from "@/lib/en-vocab-class-notes";
import type { EnVocabLevel } from "@/lib/types";

/** 老师抽查卡片右上角计时器：MM:SS（从 00:00 起计，不落库） */
export function formatEnVocabQuizElapsedLabel(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const LEVELS: { key: EnVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

export const LEVEL_LABEL: Record<EnVocabLevel, string> = {
  very: "非常熟悉",
  normal: "一般",
  weak: "不熟悉",
};

export const EN_VOCAB_LEVEL_SYNC_HINT_SHORT = "点「下一个」时同步给学生";
export const EN_VOCAB_LEVEL_SYNC_HINT =
  "勾选熟悉程度后，点「下一个」才同步给学生复习查看（每词只同步一次）";
export const EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT =
  "已同步过，下一个不会再发";
export const EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED =
  "该词今日已同步给学生，点「下一个」不会重复发送";

/** 点「下一个」触发同步时的进度条文案 */
export const EN_VOCAB_SYNC_ON_NEXT_PROGRESS_LABEL =
  "正在同步该单词给学生，请稍等";

/** 多条历史备注合并为展示用正文（不含时间戳行） */
export function formatEnVocabClassNotesForDisplay(
  raw: string | null | undefined
): string {
  return parseEnVocabClassNotes(raw)
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .join("\n\n");
}
