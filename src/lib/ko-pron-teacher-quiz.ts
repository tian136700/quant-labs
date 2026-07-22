import type { KoPronLetter } from "@/lib/types";

/** 韩语发音老师抽查：仅随机模式 */
export type KoPronTeacherQuizMode = "random";

export type KoPronTeacherQuizSession = {
  mode: KoPronTeacherQuizMode;
  letterIds: number[];
  currentIndex: number;
};

export function koPronTeacherQuizModeLabel(
  _mode: KoPronTeacherQuizMode = "random",
  locale: "zh" | "en" = "zh"
): string {
  return locale === "en" ? "Random" : "随机";
}

function shuffleIds(ids: number[]): number[] {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function filterKoPronTeacherQuizUncheckedLetters(
  letters: KoPronLetter[],
  hasLevel: (letterId: number) => boolean
): KoPronLetter[] {
  return letters.filter((l) => !hasLevel(l.id));
}

export function buildKoPronTeacherQuizLetterIds(
  quizTargetLetters: KoPronLetter[]
): number[] {
  const ids = quizTargetLetters.map((l) => l.id);
  return shuffleIds(ids);
}

export function pruneKoPronTeacherQuizSessionChecked(
  session: KoPronTeacherQuizSession,
  hasLevel: (letterId: number) => boolean,
  options?: { keepLetterId?: number | null }
): KoPronTeacherQuizSession | null {
  const keepLetterId = options?.keepLetterId ?? null;
  const letterIds = session.letterIds.filter(
    (id) => !hasLevel(id) || id === keepLetterId
  );
  if (!letterIds.length) return null;
  const currentId = session.letterIds[session.currentIndex];
  let currentIndex = letterIds.indexOf(currentId);
  if (currentIndex < 0) currentIndex = 0;
  return { ...session, letterIds, currentIndex };
}

export function expandKoPronTeacherQuizSessionForTarget(
  session: KoPronTeacherQuizSession | null,
  uncheckedPool: KoPronLetter[],
  hasLevel: (letterId: number) => boolean,
  preferredLetterId?: number
): KoPronTeacherQuizSession | null {
  const uncheckedIds = filterKoPronTeacherQuizUncheckedLetters(
    uncheckedPool,
    hasLevel
  ).map((l) => l.id);
  if (!uncheckedIds.length) return null;

  if (!session) {
    const letterIds = buildKoPronTeacherQuizLetterIds(
      uncheckedPool.filter((l) => uncheckedIds.includes(l.id))
    );
    let currentIndex = 0;
    if (preferredLetterId != null) {
      const found = letterIds.indexOf(preferredLetterId);
      if (found >= 0) currentIndex = found;
    }
    return { mode: "random", letterIds, currentIndex };
  }

  const existing = new Set(session.letterIds);
  const appended = [
    ...session.letterIds.filter(
      (id) => uncheckedIds.includes(id) || !hasLevel(id)
    ),
    ...uncheckedIds.filter((id) => !existing.has(id)),
  ].filter((id, i, arr) => arr.indexOf(id) === i);

  const pruned = appended.filter(
    (id) => !hasLevel(id) || id === preferredLetterId
  );
  if (!pruned.length) return null;

  let currentIndex = 0;
  if (preferredLetterId != null) {
    const found = pruned.indexOf(preferredLetterId);
    if (found >= 0) currentIndex = found;
  } else {
    const currentId = session.letterIds[session.currentIndex];
    const found = pruned.indexOf(currentId);
    currentIndex = found >= 0 ? found : 0;
  }

  return { mode: "random", letterIds: pruned, currentIndex };
}

export function advanceKoPronTeacherQuizSession(
  session: KoPronTeacherQuizSession
): KoPronTeacherQuizSession | null {
  if (session.currentIndex + 1 >= session.letterIds.length) return null;
  return { ...session, currentIndex: session.currentIndex + 1 };
}
