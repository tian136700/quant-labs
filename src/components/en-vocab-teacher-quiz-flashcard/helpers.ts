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

/** 点「下一个」触发同步时的进度条文案（勿用于勾选熟悉程度） */
export const EN_VOCAB_SYNC_ON_NEXT_PROGRESS_LABEL =
  "此单词正在同步给学生复习…";

/** 同步未完成时再点「下一个」的提示 */
export const EN_VOCAB_SYNC_ON_NEXT_WAIT_HINT =
  "此单词正在同步给学生复习，请稍等。";

export {
  EN_VOCAB_SHARE_FETCH_TIMEOUT_MS,
  EN_VOCAB_SYNC_ON_NEXT_RETRY_HINT,
  type EnVocabShareWordResult,
} from "@/lib/en-vocab-share-ui";

/** 多条历史备注合并为展示用正文（不含时间戳行） */
export function formatEnVocabClassNotesForDisplay(
  raw: string | null | undefined
): string {
  return parseEnVocabClassNotes(raw)
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .join("\n\n");
}
