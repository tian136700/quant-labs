"use client";

import type { JpVocabLevel } from "@/lib/types";

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

export const LEVEL_LABEL: Record<JpVocabLevel, string> = {
  very: "非常熟悉",
  normal: "一般",
  weak: "不熟悉",
};

export const JP_VOCAB_LEVEL_SYNC_HINT_SHORT = "点「下一个」时同步给学生";
export const JP_VOCAB_LEVEL_SYNC_HINT =
  "勾选熟悉程度后，点「下一个」才同步给学生复习查看（每词只同步一次）";
export const JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT =
  "已同步过，下一个不会再发";
export const JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED =
  "该词今日已同步给学生，点「下一个」不会重复发送";

/** 点「下一个」触发同步时的进度条文案 */
export const JP_VOCAB_SYNC_ON_NEXT_PROGRESS_LABEL =
  "正在同步该单词给学生，请稍等";

/** 同步未完成时再点「下一个」的提示 */
export const JP_VOCAB_SYNC_ON_NEXT_WAIT_HINT =
  "正在同步该单词给学生，请稍等。";
