import { jpVocabClassNotesDisplayLength } from "@/lib/jp-vocab-class-notes";
import type { JpVocabWord } from "@/lib/types";

export type JpVocabTeacherQuizMode = "sequential" | "random";

export type JpVocabTeacherQuizSession = {
  mode: JpVocabTeacherQuizMode;
  wordIds: number[];
  currentIndex: number;
};

/** 备注 ≤ 此字数时抽查弹窗内直接展示，超出则折叠为「查看」 */
export const JP_VOCAB_TEACHER_QUIZ_NOTES_INLINE_MAX = 200;

export function jpVocabTeacherQuizNotesInline(notes: string | null | undefined): boolean {
  return jpVocabClassNotesDisplayLength(notes) <= JP_VOCAB_TEACHER_QUIZ_NOTES_INLINE_MAX;
}

function shuffleWordIds(ids: number[]): number[] {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** 今日可抽查词条按当日序号 1…N 正序排列 */
export function sortJpVocabQuizTargetWordsByDailySeq(
  words: JpVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>
): JpVocabWord[] {
  return [...words].sort((a, b) => {
    const seqA = dailySeqByWordId.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const seqB = dailySeqByWordId.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return seqA - seqB;
  });
}

export function buildJpVocabTeacherQuizWordIds(
  mode: JpVocabTeacherQuizMode,
  quizTargetWords: JpVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>
): number[] {
  const ordered = sortJpVocabQuizTargetWordsByDailySeq(
    quizTargetWords,
    dailySeqByWordId
  );
  const ids = ordered.map((w) => w.id);
  return mode === "random" ? shuffleWordIds(ids) : ids;
}

export function createJpVocabTeacherQuizSession(
  mode: JpVocabTeacherQuizMode,
  quizTargetWords: JpVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>,
  startWordId?: number
): JpVocabTeacherQuizSession | null {
  const wordIds = buildJpVocabTeacherQuizWordIds(
    mode,
    quizTargetWords,
    dailySeqByWordId
  );
  if (!wordIds.length) return null;
  const foundIndex =
    startWordId != null ? wordIds.indexOf(startWordId) : -1;
  const currentIndex = foundIndex >= 0 ? foundIndex : 0;
  return { mode, wordIds, currentIndex };
}

/** 抽查卡片内全部词条均已勾选熟悉程度 */
export function isJpVocabTeacherQuizSessionComplete(
  session: JpVocabTeacherQuizSession,
  hasLevel: (wordId: number) => boolean
): boolean {
  return session.wordIds.every((id) => hasLevel(id));
}

/** 恢复持久化会话时，剔除已不在今日抽查范围内的词并保持索引有效 */
export function reconcileJpVocabTeacherQuizSession(
  session: JpVocabTeacherQuizSession,
  validWordIds: ReadonlySet<number>
): JpVocabTeacherQuizSession | null {
  const wordIds = session.wordIds.filter((id) => validWordIds.has(id));
  if (!wordIds.length) return null;
  const currentWordId = session.wordIds[session.currentIndex];
  const currentIndex =
    currentWordId != null
      ? Math.max(0, wordIds.indexOf(currentWordId))
      : Math.min(session.currentIndex, wordIds.length - 1);
  return {
    mode: session.mode,
    wordIds,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
  };
}

/**
 * 管理员调高今日抽查数量后，把进行中的抽查会话补全到最新目标词表（保留当前词与已抽查进度）。
 */
export function expandJpVocabTeacherQuizSessionForTarget(
  session: JpVocabTeacherQuizSession,
  quizTargetWords: JpVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>
): JpVocabTeacherQuizSession {
  const targetIds = buildJpVocabTeacherQuizWordIds(
    session.mode,
    quizTargetWords,
    dailySeqByWordId
  );
  if (!targetIds.length) return session;
  if (session.wordIds.length >= targetIds.length) {
    return reconcileJpVocabTeacherQuizSession(
      session,
      new Set(targetIds)
    ) ?? session;
  }

  const currentWordId = session.wordIds[session.currentIndex];
  let wordIds: number[];

  if (session.mode === "sequential") {
    wordIds = targetIds;
  } else {
    const targetSet = new Set(targetIds);
    const kept = session.wordIds.filter((id) => targetSet.has(id));
    const inSession = new Set(kept);
    wordIds = [...kept, ...targetIds.filter((id) => !inSession.has(id))];
  }

  const currentIndex =
    currentWordId != null
      ? Math.max(0, wordIds.indexOf(currentWordId))
      : Math.min(session.currentIndex, wordIds.length - 1);

  return {
    mode: session.mode,
    wordIds,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
  };
}

/** 列表点选或恢复抽查时，定位到点击的词；否则跳到第一个未勾选的词 */
export function resolveJpVocabTeacherQuizResumeIndex(
  session: JpVocabTeacherQuizSession,
  preferredWordId: number | undefined,
  hasLevel: (wordId: number) => boolean
): number {
  if (preferredWordId != null) {
    const preferredIndex = session.wordIds.indexOf(preferredWordId);
    if (preferredIndex >= 0) return preferredIndex;
  }
  const firstUnchecked = session.wordIds.findIndex((id) => !hasLevel(id));
  if (firstUnchecked >= 0) return firstUnchecked;
  return Math.max(
    0,
    Math.min(session.currentIndex, session.wordIds.length - 1)
  );
}

/**
 * 刷新/掉线恢复：定位到本会话内第一个尚未勾选熟悉程度的词（正序即「下一个待抽查」）；
 * 若已全部勾选，则落到会话内最后一词或起始索引。
 */
export function resolveJpVocabTeacherQuizRefreshResumeIndex(
  session: JpVocabTeacherQuizSession,
  _wordsById: ReadonlyMap<number, JpVocabWord>,
  _sessionReviewAt: Readonly<Record<number, number>>,
  hasLevel: (wordId: number) => boolean
): number {
  return resolveJpVocabTeacherQuizResumeIndex(session, undefined, hasLevel);
}
