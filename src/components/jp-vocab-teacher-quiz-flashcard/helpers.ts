"use client";

/** 老师抽查卡片右上角计时器：MM:SS（从 00:00 起计，不落库） */
export function formatJpVocabQuizElapsedLabel(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

export export const JP_VOCAB_LEVEL_SYNC_HINT_SHORT = "勾选后同步给学生复习查看";
export const JP_VOCAB_LEVEL_SYNC_HINT = "勾选后，该单词将同步给学生复习查看";
export export export const JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT = "已发给学生，勾选仅更新熟悉程度";
export export const JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED =
  "已发给学生，勾选熟悉程度仅更新记录，不会重复发送";

