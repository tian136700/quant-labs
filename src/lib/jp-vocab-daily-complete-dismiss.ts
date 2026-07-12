import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";

const TEACHER_KEY_PREFIX = "jp-vocab-daily-complete-teacher-v2";
const STUDY_KEY_PREFIX = "jp-vocab-daily-complete-study-v2";

export type JpVocabDailyCompleteSnapshot = {
  complete: boolean;
  total: number;
};

function dismissToken(quizTarget: number): string {
  const target = Math.max(0, Math.floor(quizTarget));
  return `${beijingDateString()}:${target}`;
}

function storageKey(prefix: string, userId: number): string {
  return `${prefix}:${userId}`;
}

function readDismissedToken(prefix: string, userId: number): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(storageKey(prefix, userId));
  } catch {
    return null;
  }
}

function markDismissed(prefix: string, userId: number, quizTarget: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(prefix, userId), dismissToken(quizTarget));
  } catch {
    /* ignore */
  }
}

export function shouldShowJpVocabTeacherDailyComplete(
  userId: number,
  quizTarget: number
): boolean {
  return readDismissedToken(TEACHER_KEY_PREFIX, userId) !== dismissToken(quizTarget);
}

export function markJpVocabTeacherDailyCompleteDismissed(
  userId: number,
  quizTarget: number
): void {
  markDismissed(TEACHER_KEY_PREFIX, userId, quizTarget);
}

export function shouldShowJpVocabStudyDailyComplete(
  userId: number,
  quizTarget: number
): boolean {
  return readDismissedToken(STUDY_KEY_PREFIX, userId) !== dismissToken(quizTarget);
}

export function markJpVocabStudyDailyCompleteDismissed(
  userId: number,
  quizTarget: number
): void {
  markDismissed(STUDY_KEY_PREFIX, userId, quizTarget);
}

/**
 * 决定是否弹出「今日抽查已完成」：
 * - 按用户 + 北京时间日期 + 今日目标数（localStorage）只提示一次
 * - 数据加载完成后才评估，避免空列表 → 全量列表被误判为「刚完成」
 * - 管理员调高今日目标后，若新目标尚未提示过且已达标，再提示一次
 */
export function evaluateJpVocabDailyCompleteModal(opts: {
  ready: boolean;
  userId: number;
  progress: Pick<JpVocabDailyQuizProgress, "complete" | "total">;
  prevSnapshot: JpVocabDailyCompleteSnapshot | null;
  shouldShow: (userId: number, quizTarget: number) => boolean;
}): { nextSnapshot: JpVocabDailyCompleteSnapshot; open: boolean } {
  const { ready, userId, progress, prevSnapshot, shouldShow } = opts;
  const snapshot: JpVocabDailyCompleteSnapshot = {
    complete: progress.complete,
    total: progress.total,
  };

  if (!ready || progress.total <= 0) {
    return { nextSnapshot: prevSnapshot ?? snapshot, open: false };
  }

  if (!progress.complete) {
    return { nextSnapshot: snapshot, open: false };
  }

  if (!shouldShow(userId, progress.total)) {
    return { nextSnapshot: snapshot, open: false };
  }

  if (!prevSnapshot) {
    return { nextSnapshot: snapshot, open: true };
  }

  const newlyComplete = !prevSnapshot.complete && progress.complete;
  const targetIncreasedWhileComplete =
    progress.complete &&
    progress.total > prevSnapshot.total &&
    shouldShow(userId, progress.total);

  return {
    nextSnapshot: snapshot,
    open: newlyComplete || targetIncreasedWhileComplete,
  };
}
