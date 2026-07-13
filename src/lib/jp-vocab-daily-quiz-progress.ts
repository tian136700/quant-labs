import { jpVocabTodayCheckStats } from "@/lib/jp-vocab-daily-check";
import {
  JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import type { JpVocabWord } from "@/lib/types";

/** 每日建议优先抽查的前 N 条（与单词表序号 1–N 对应） */
export const JP_VOCAB_DAILY_QUIZ_TOP = 10;

export type JpVocabDailyQuizProgress = {
  total: number;
  checked: number;
  remaining: number;
  complete: boolean;
};

/**
 * 今日抽查进度：分母 = 管理员设置的今日抽查数量；分子 = 今日已抽查过的词条数（每词只计 1 次，与「今日抽查次数」列一致，不按累计抽查次数计）。
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
  if (progress.total <= 0) return "今日暂无抽查任务";
  const shown = jpVocabDailyQuizProgressDisplayChecked(progress);
  if (progress.complete) {
    return `今日 ${progress.total} 个已全部抽查完成`;
  }
  return `已抽查 ${shown} / ${progress.total}，剩余 ${progress.remaining} 个`;
}
