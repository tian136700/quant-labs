import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import {
  jpVocabTeacherVisibleRange,
  JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";

/** 每日建议优先抽查的前 N 条（与单词表序号 1–N 对应） */
export const JP_VOCAB_DAILY_QUIZ_TOP = 20;

export type JpVocabDailyQuizProgress = {
  total: number;
  checked: number;
  remaining: number;
  complete: boolean;
};

function jpVocabDailyQuizTargetIds(
  displayOrder: JpVocabDailyDisplayOrder,
  teacherVisible: Pick<JpVocabTeacherVisibleLimit, "limit" | "count" | "quiz_target">
): number[] {
  const quizTarget = Math.max(1, Math.floor(teacherVisible.quiz_target));
  const { start, end } = jpVocabTeacherVisibleRange(teacherVisible);
  const startIdx = Math.max(0, start - 1);
  const endIdx = Math.min(displayOrder.ids.length, end);
  return displayOrder.ids.slice(startIdx, endIdx).slice(0, quizTarget);
}

export function computeJpVocabDailyQuizProgress(
  displayOrder: JpVocabDailyDisplayOrder,
  teacherVisible: Pick<JpVocabTeacherVisibleLimit, "limit" | "count" | "quiz_target"> = {
    limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    quiz_target: JP_VOCAB_DAILY_QUIZ_TOP,
  },
  now = new Date()
): JpVocabDailyQuizProgress {
  const today = beijingDateString(now);
  const targetIds = jpVocabDailyQuizTargetIds(displayOrder, teacherVisible);
  const total = targetIds.length;

  if (displayOrder.date !== today || total <= 0) {
    return {
      total,
      checked: 0,
      remaining: total,
      complete: total === 0,
    };
  }
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
