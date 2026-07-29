import { enVocabTodayCheckStats } from "@/lib/en-vocab-daily-check";
import { EN_VOCAB_DAILY_QUIZ_TOP } from "@/lib/en-vocab-page-constants";
import type { EnVocabWord } from "@/lib/types";

export type EnVocabDailyQuizProgress = {
  total: number;
  checked: number;
  remaining: number;
  complete: boolean;
};

/**
 * 今日抽查进度（管理员 / 固定目标视角）：
 * 分母 = 今日抽查数量；分子 = 今日已抽查过的词条数（每词只计 1 次）。
 */
export function computeEnVocabDailyQuizProgress(
  words: EnVocabWord[],
  quizTarget: number = EN_VOCAB_DAILY_QUIZ_TOP,
  now = new Date()
): EnVocabDailyQuizProgress {
  const total = Math.max(0, Math.floor(quizTarget));
  const { wordCount } = enVocabTodayCheckStats(words, now);
  const checked = wordCount;
  const remaining = Math.max(0, total - checked);

  return {
    total,
    checked,
    remaining,
    complete: total > 0 && checked >= total,
  };
}

/**
 * 学生端「今日背英语单词」进度：分子 = 今日共享列表条数；分母 = 管理员设定的今日抽查数量。
 * 禁止用全库 today_check_count（peek 入列表不会写抽查次数，否则会一直 0/N）。
 */
export function computeEnVocabStudyPageQuizProgress(
  sharedItemCount: number,
  quizTarget: number
): EnVocabDailyQuizProgress {
  const total = Math.max(0, Math.floor(quizTarget));
  const checked = Math.max(0, Math.floor(sharedItemCount));
  const remaining = Math.max(0, total - checked);
  return {
    total,
    checked,
    remaining,
    complete: total > 0 && checked >= total,
  };
}

/**
 * 老师端页面进度：分母 = 待抽查词数（未勾选 + 本会话刚勾选）；
 * 完成后只展示「已完成」。
 */
export function computeEnVocabTeacherPageQuizProgress(
  pendingWords: ReadonlyArray<{ id: number }>,
  hasLevel: (wordId: number) => boolean,
  options?: {
    forceComplete?: boolean;
  }
): EnVocabDailyQuizProgress {
  if (options?.forceComplete) {
    return { total: 0, checked: 0, remaining: 0, complete: true };
  }
  const total = pendingWords.length;
  let checked = 0;
  for (const word of pendingWords) {
    if (hasLevel(word.id)) checked += 1;
  }
  const remaining = Math.max(0, total - checked);
  return {
    total,
    checked,
    remaining,
    complete: total > 0 && remaining === 0,
  };
}

/** 进度条分子：相对今日目标封顶 */
export function enVocabDailyQuizProgressDisplayChecked(
  progress: EnVocabDailyQuizProgress
): number {
  if (progress.total <= 0) return progress.checked;
  return Math.min(progress.checked, progress.total);
}

export function formatEnVocabDailyQuizProgressLabel(
  progress: EnVocabDailyQuizProgress
): string {
  if (progress.complete) return "已抽查完成";
  if (progress.total <= 0) return "今日暂无抽查任务";
  const shown = enVocabDailyQuizProgressDisplayChecked(progress);
  return `已抽查 ${shown} / ${progress.total}，剩余 ${progress.remaining} 个`;
}
