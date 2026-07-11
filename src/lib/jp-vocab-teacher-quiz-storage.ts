import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";

const KEY_PREFIX = "jp-vocab-teacher-quiz-session-v1";

type StoredTeacherQuizPayload = {
  token: string;
  session: JpVocabTeacherQuizSession;
};

function storageKey(userId: number): string {
  return `${KEY_PREFIX}:${userId}`;
}

function sessionToken(quizTarget: number): string {
  const target = Math.max(0, Math.floor(quizTarget));
  return `${beijingDateString()}:${target}`;
}

export function readJpVocabTeacherQuizSession(
  userId: number,
  quizTarget: number
): JpVocabTeacherQuizSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
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
      currentIndex: Math.max(0, Math.min(Math.floor(currentIndex), wordIds.length - 1)),
    };
  } catch {
    return null;
  }
}

export function writeJpVocabTeacherQuizSession(
  userId: number,
  quizTarget: number,
  session: JpVocabTeacherQuizSession
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredTeacherQuizPayload = {
      token: sessionToken(quizTarget),
      session,
    };
    sessionStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearJpVocabTeacherQuizSession(userId: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}
