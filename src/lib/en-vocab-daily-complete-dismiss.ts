import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { EnVocabDailyQuizProgress } from "@/lib/en-vocab-daily-quiz-progress";

const TEACHER_KEY_PREFIX = "en-vocab-daily-complete-teacher-v1";

export type EnVocabDailyCompleteSnapshot = {
  complete: boolean;
  total: number;
};

function dismissToken(quizTarget: number): string {
  const target = Math.max(0, Math.floor(quizTarget));
  return `${beijingDateString()}:${target}`;
}

function storageKey(userId: number): string {
  return `${TEACHER_KEY_PREFIX}:${userId}`;
}

function readDismissedToken(userId: number): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function shouldShowEnVocabTeacherDailyComplete(
  userId: number,
  quizTarget: number
): boolean {
  return readDismissedToken(userId) !== dismissToken(quizTarget);
}

export function markEnVocabTeacherDailyCompleteDismissed(
  userId: number,
  quizTarget: number
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId), dismissToken(quizTarget));
  } catch {
    /* ignore */
  }
}

/**
 * 决定是否弹出「本轮单词已抽查完成」：
 * - 按用户 + 北京时间日期 + 今日目标数只提示一次
 * - 加载完成后再评估，避免空列表误判
 */
export function evaluateEnVocabDailyCompleteModal(opts: {
  ready: boolean;
  userId: number;
  progress: Pick<EnVocabDailyQuizProgress, "complete" | "total">;
  prevSnapshot: EnVocabDailyCompleteSnapshot | null;
}): { nextSnapshot: EnVocabDailyCompleteSnapshot; open: boolean } {
  const { ready, userId, progress, prevSnapshot } = opts;
  const snapshot: EnVocabDailyCompleteSnapshot = {
    complete: progress.complete,
    total: progress.total,
  };

  if (!ready || progress.total <= 0) {
    return { nextSnapshot: prevSnapshot ?? snapshot, open: false };
  }

  if (!progress.complete) {
    return { nextSnapshot: snapshot, open: false };
  }

  if (!shouldShowEnVocabTeacherDailyComplete(userId, progress.total)) {
    return { nextSnapshot: snapshot, open: false };
  }

  if (!prevSnapshot) {
    return { nextSnapshot: snapshot, open: true };
  }

  const newlyComplete = !prevSnapshot.complete && progress.complete;
  const targetIncreasedWhileComplete =
    progress.complete &&
    progress.total > prevSnapshot.total &&
    shouldShowEnVocabTeacherDailyComplete(userId, progress.total);

  return {
    nextSnapshot: snapshot,
    open: newlyComplete || targetIncreasedWhileComplete,
  };
}
