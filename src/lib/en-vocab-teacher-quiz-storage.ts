import { beijingDateString } from "@/lib/en-vocab-daily-check";
import type { EnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz";

const KEY_PREFIX = "en-vocab-teacher-quiz-session-v1";

type StoredTeacherQuizPayload = {
  token: string;
  session: EnVocabTeacherQuizSession;
};

function storageKey(userId: number): string {
  return `${KEY_PREFIX}:${userId}`;
}

function sessionToken(quizTarget: number): string {
  const target = Math.max(0, Math.floor(quizTarget));
  return `${beijingDateString()}:${target}`;
}

export function readEnVocabTeacherQuizSession(
  userId: number,
  quizTarget: number
): EnVocabTeacherQuizSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTeacherQuizPayload;
    if (!parsed?.session || parsed.token !== sessionToken(quizTarget)) return null;
    const { mode, wordIds, currentIndex } = parsed.session;
    if (
      (mode !== "sequential" && mode !== "random") ||
      !Array.isArray(wordIds) ||
      wordIds.length === 0 ||
      typeof currentIndex !== "number"
    ) {
      return null;
    }
    return {
      mode,
      wordIds: wordIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
      currentIndex: Math.max(
        0,
        Math.min(Math.floor(currentIndex), wordIds.length - 1)
      ),
    };
  } catch {
    return null;
  }
}

export function writeEnVocabTeacherQuizSession(
  userId: number,
  quizTarget: number,
  session: EnVocabTeacherQuizSession
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredTeacherQuizPayload = {
      token: sessionToken(quizTarget),
      session,
    };
    localStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearEnVocabTeacherQuizSession(userId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}
