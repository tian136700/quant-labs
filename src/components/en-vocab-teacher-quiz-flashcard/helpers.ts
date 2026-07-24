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

export const EN_VOCAB_LEVEL_SYNC_HINT_SHORT = "勾选后同步给学生复习查看";
export const EN_VOCAB_LEVEL_SYNC_HINT = "勾选后，该单词将同步给学生复习查看";
export const EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT =
  "已共享给学生，勾选仅更新熟悉程度";
export const EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED =
  "已共享给学生，勾选熟悉程度仅更新记录，不会重复发送";

/** 多条历史备注合并为展示用正文（不含时间戳行） */
export function formatEnVocabClassNotesForDisplay(
  raw: string | null | undefined
): string {
  return parseEnVocabClassNotes(raw)
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .join("\n\n");
}
