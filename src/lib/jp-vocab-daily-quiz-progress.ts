import { jpVocabTodayCheckStats } from "@/lib/jp-vocab-daily-check";
import {
  JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import type { JpVocabWord } from "@/lib/types";

/** 每日抽查目标默认 N（与单词表序号 1–N、跨日重置一致；对齐英语 EN_VOCAB_DAILY_QUIZ_TOP=20） */
export const JP_VOCAB_DAILY_QUIZ_TOP = 20;

export type JpVocabDailyQuizProgress = {
  total: number;
  checked: number;
  remaining: number;
  complete: boolean;
};

/**
 * 今日抽查进度（管理员视角）：分母 = 管理员设置的今日抽查数量；
 * 分子 = 今日已抽查过的词条数（每词只计 1 次，与「今日抽查次数」列一致，不按累计抽查次数计）。
 */
export function computeJpVocabDailyQuizProgress(
  words: JpVocabWord[],
  teacherVisible: Pick<JpVocabTeacherVisibleLimit, "quiz_target"> = {
    quiz_target: JP_VOCAB_DAILY_QUIZ_TOP,
  },
  now = new Date()
): JpVocabDailyQuizProgress {
  const total = Math.max(0, Math.floor(teacherVisible.quiz_target));
  const { wordCount } = jpVocabTodayCheckStats(words, now);
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
 * 老师端页面进度：分母 = 待抽查词数（未勾选 + 本会话刚勾选）；
 * 不按 1 小时锁定统计。已勾过的不进分母。完成后只展示「已完成」。
 */
export function computeJpVocabTeacherPageQuizProgress(
  pendingWords: ReadonlyArray<{ id: number }>,
  hasLevel: (wordId: number) => boolean,
  options?: {
    forceComplete?: boolean;
  }
): JpVocabDailyQuizProgress {
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

/** 进度条分子：相对今日目标封顶，避免已抽 45、目标 20 时显示 45/20 */
export function jpVocabDailyQuizProgressDisplayChecked(
  progress: JpVocabDailyQuizProgress
): number {
  if (progress.total <= 0) return progress.checked;
  return Math.min(progress.checked, progress.total);
}

export function formatJpVocabDailyQuizProgressLabel(
  progress: JpVocabDailyQuizProgress
): string {
  if (progress.complete) return "已抽查完成";
  if (progress.total <= 0) return "今日暂无抽查任务";
  const shown = jpVocabDailyQuizProgressDisplayChecked(progress);
  return `已抽查 ${shown} / ${progress.total}，剩余 ${progress.remaining} 个`;
}
