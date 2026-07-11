import { beijingDateString } from "@/lib/jp-vocab-daily-check";

const TEACHER_KEY_PREFIX = "jp-vocab-daily-complete-teacher-v2";
const STUDY_KEY_PREFIX = "jp-vocab-daily-complete-study-v2";

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
