import { beijingDateString } from "@/lib/jp-vocab-daily-check";

const TEACHER_KEY_PREFIX = "jp-vocab-daily-complete-teacher-v1";
const STUDY_KEY_PREFIX = "jp-vocab-daily-complete-study-v1";

function storageKey(prefix: string, userId: number): string {
  return `${prefix}:${userId}`;
}

function readDismissedDate(prefix: string, userId: number): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(storageKey(prefix, userId));
  } catch {
    return null;
  }
}

function markDismissed(prefix: string, userId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(prefix, userId), beijingDateString());
  } catch {
    /* ignore */
  }
}

export function shouldShowJpVocabTeacherDailyComplete(userId: number): boolean {
  return readDismissedDate(TEACHER_KEY_PREFIX, userId) !== beijingDateString();
}

export function markJpVocabTeacherDailyCompleteDismissed(userId: number): void {
  markDismissed(TEACHER_KEY_PREFIX, userId);
}

export function shouldShowJpVocabStudyDailyComplete(userId: number): boolean {
  return readDismissedDate(STUDY_KEY_PREFIX, userId) !== beijingDateString();
}

export function markJpVocabStudyDailyCompleteDismissed(userId: number): void {
  markDismissed(STUDY_KEY_PREFIX, userId);
}
