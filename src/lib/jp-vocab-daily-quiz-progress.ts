import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { JP_VOCAB_TEACHER_VISIBLE_DEFAULT } from "@/lib/jp-vocab-teacher-visible";

/** 每日建议优先抽查的前 N 条（与单词表序号 1–N 对应） */
export const JP_VOCAB_DAILY_QUIZ_TOP = 20;

export type JpVocabDailyQuizProgress = {
  total: number;
  checked: number;
  remaining: number;
  complete: boolean;
};

export function computeJpVocabDailyQuizProgress(
  displayOrder: JpVocabDailyDisplayOrder,
  teacherVisibleLimit = JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  now = new Date()
): JpVocabDailyQuizProgress {
  const today = beijingDateString(now);
  const limit = Math.max(0, Math.floor(teacherVisibleLimit));
  const maxTarget = Math.min(JP_VOCAB_DAILY_QUIZ_TOP, limit);

  if (displayOrder.date !== today || maxTarget <= 0) {
    return {
      total: maxTarget,
      checked: 0,
      remaining: maxTarget,
      complete: maxTarget === 0,
    };
  }

  const targetIds = displayOrder.ids.slice(0, maxTarget);
  const total = targetIds.length;
  const checkedSet = new Set(displayOrder.round_checked_ids ?? []);
  const checked = targetIds.filter((id) => checkedSet.has(id)).length;
  const remaining = Math.max(0, total - checked);

  return {
    total,
    checked,
    remaining,
    complete: total > 0 && checked >= total,
  };
}

export function formatJpVocabDailyQuizProgressLabel(
  progress: JpVocabDailyQuizProgress
): string {
  if (progress.total <= 0) return "今日暂无抽查任务";
  if (progress.complete) {
    return `今日 ${progress.total} 个已全部抽查完成`;
  }
  return `已抽查 ${progress.checked} / ${progress.total}，剩余 ${progress.remaining} 个`;
}
