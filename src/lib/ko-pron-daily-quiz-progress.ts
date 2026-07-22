import { koPronTodayCheckStats } from "@/lib/ko-pron-review";
import {
  KO_PRON_DAILY_QUIZ_TOP,
  type KoPronTeacherVisibleLimit,
} from "@/lib/ko-pron-teacher-visible";
import type { KoPronLetter } from "@/lib/types";

export { KO_PRON_DAILY_QUIZ_TOP };

export type KoPronDailyQuizProgress = {
  total: number;
  checked: number;
  remaining: number;
  complete: boolean;
};

/**
 * 今日抽查进度（管理员视角）：分母 = 今日抽查数量；
 * 分子 = 今日已抽查字母数。
 */
export function computeKoPronDailyQuizProgress(
  letters: KoPronLetter[],
  teacherVisible: Pick<KoPronTeacherVisibleLimit, "quiz_target"> = {
    quiz_target: KO_PRON_DAILY_QUIZ_TOP,
  },
  now = new Date()
): KoPronDailyQuizProgress {
  const total = Math.max(0, Math.floor(teacherVisible.quiz_target));
  const { wordCount } = koPronTodayCheckStats(letters, now);
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
 * 老师端页面进度：分母 = 待抽查数（未勾选 + 本会话刚勾选）。
 */
export function computeKoPronTeacherPageQuizProgress(
  pendingLetters: ReadonlyArray<{ id: number }>,
  hasLevel: (letterId: number) => boolean,
  options?: { forceComplete?: boolean }
): KoPronDailyQuizProgress {
  if (options?.forceComplete) {
    return { total: 0, checked: 0, remaining: 0, complete: true };
  }
  const total = pendingLetters.length;
  let checked = 0;
  for (const letter of pendingLetters) {
    if (hasLevel(letter.id)) checked += 1;
  }
  const remaining = Math.max(0, total - checked);
  return {
    total,
    checked,
    remaining,
    complete: total > 0 && remaining === 0,
  };
}

export function koPronDailyQuizProgressDisplayChecked(
  progress: KoPronDailyQuizProgress
): number {
  if (progress.total <= 0) return progress.checked;
  return Math.min(progress.checked, progress.total);
}

export function formatKoPronDailyQuizProgressLabel(
  progress: KoPronDailyQuizProgress
): string {
  if (progress.complete) return "已抽查完成";
  if (progress.total <= 0) return "今日暂无抽查任务";
  const shown = koPronDailyQuizProgressDisplayChecked(progress);
  return `已抽查 ${shown} / ${progress.total}，剩余 ${progress.remaining} 个`;
}
