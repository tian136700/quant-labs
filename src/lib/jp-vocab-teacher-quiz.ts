import { jpVocabClassNotesDisplayLength } from "@/lib/jp-vocab-class-notes";
import type { JpVocabWord } from "@/lib/types";

export type JpVocabTeacherQuizMode = "sequential" | "random";

export type JpVocabTeacherQuizSession = {
  mode: JpVocabTeacherQuizMode;
  wordIds: number[];
  currentIndex: number;
};

/** 备注 ≤ 此字数时抽查弹窗内直接展示；网页端卡片可滚动后放宽阈值 */
export const JP_VOCAB_TEACHER_QUIZ_NOTES_INLINE_MAX = 4000;

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

/** 抽查队列只保留尚未勾选熟悉程度的词（已抽过的不再进入卡片） */
export function filterJpVocabTeacherQuizUncheckedWords(
  words: JpVocabWord[],
  hasLevel: (wordId: number) => boolean
): JpVocabWord[] {
  return words.filter((w) => !hasLevel(w.id));
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

function clampSessionIndex(
  wordIds: number[],
  preferredWordId: number | undefined,
  fallbackIndex: number
): number {
  if (!wordIds.length) return 0;
  if (preferredWordId != null) {
    const found = wordIds.indexOf(preferredWordId);
    if (found >= 0) return found;
  }
  return Math.max(0, Math.min(fallbackIndex, wordIds.length - 1));
}

/**
 * 从会话中剔除已勾选词；可选保留当前正在看的词（方便改选熟悉程度后再点「下一个」）。
 * 无剩余词时返回 null。
 */
export function pruneJpVocabTeacherQuizSessionChecked(
  session: JpVocabTeacherQuizSession,
  hasLevel: (wordId: number) => boolean,
  options?: { keepWordId?: number | null }
): JpVocabTeacherQuizSession | null {
  const keepWordId = options?.keepWordId ?? null;
  const wordIds = session.wordIds.filter(
    (id) => !hasLevel(id) || id === keepWordId
  );
  if (!wordIds.length) return null;
  const currentWordId = session.wordIds[session.currentIndex];
  return {
    mode: session.mode,
    wordIds,
    currentIndex: clampSessionIndex(wordIds, currentWordId, 0),
  };
}

export function createJpVocabTeacherQuizSession(
  mode: JpVocabTeacherQuizMode,
  quizTargetWords: JpVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>,
  startWordId?: number,
  hasLevel?: (wordId: number) => boolean
): JpVocabTeacherQuizSession | null {
  const pool = hasLevel
    ? filterJpVocabTeacherQuizUncheckedWords(quizTargetWords, hasLevel)
    : quizTargetWords;
  const wordIds = buildJpVocabTeacherQuizWordIds(
    mode,
    pool,
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
  return {
    mode: session.mode,
    wordIds,
    currentIndex: clampSessionIndex(wordIds, currentWordId, session.currentIndex),
  };
}

/**
 * 管理员调高今日抽查数量后，把进行中的抽查会话补全到最新目标词表。
 * 传入 hasLevel 时：队列只保留未勾选词（含新增目标内的未抽查词），已抽过的不再出现。
 * 若未勾选池已空（本轮/今日目标已抽完），返回 null——调用方应清空会话并关闭卡片，展示已抽完列表。
 */
export function expandJpVocabTeacherQuizSessionForTarget(
  session: JpVocabTeacherQuizSession,
  quizTargetWords: JpVocabWord[],
  dailySeqByWordId: ReadonlyMap<number, number>,
  hasLevel?: (wordId: number) => boolean
): JpVocabTeacherQuizSession | null {
  const pool = hasLevel
    ? filterJpVocabTeacherQuizUncheckedWords(quizTargetWords, hasLevel)
    : quizTargetWords;
  const targetIds = buildJpVocabTeacherQuizWordIds(
    session.mode,
    pool,
    dailySeqByWordId
  );
  if (!targetIds.length) {
    if (!hasLevel) return session;
    // 禁止 `prune ?? session`：全部勾选后 prune 为 null 时若回退旧会话，弹窗会永远关不掉
    return pruneJpVocabTeacherQuizSessionChecked(session, hasLevel);
  }

  const currentWordId = session.wordIds[session.currentIndex];
  let wordIds: number[];

  if (hasLevel) {
    // 未勾选池即为完整待抽查队列；正序用序号序，随机保留未完成项并追加新增
    if (session.mode === "sequential") {
      wordIds = targetIds;
    } else {
      const targetSet = new Set(targetIds);
      const kept = session.wordIds.filter(
        (id) => targetSet.has(id) && !hasLevel(id)
      );
      const inSession = new Set(kept);
      wordIds = [...kept, ...targetIds.filter((id) => !inSession.has(id))];
    }
  } else {
    if (session.wordIds.length >= targetIds.length) {
      return (
        reconcileJpVocabTeacherQuizSession(session, new Set(targetIds)) ??
        session
      );
    }
    if (session.mode === "sequential") {
      wordIds = targetIds;
    } else {
      const targetSet = new Set(targetIds);
      const kept = session.wordIds.filter((id) => targetSet.has(id));
      const inSession = new Set(kept);
      wordIds = [...kept, ...targetIds.filter((id) => !inSession.has(id))];
    }
  }

  // 当前词若已勾选（或不在未勾选池中），落到第一个待抽查词
  const preferredId =
    currentWordId != null && (!hasLevel || !hasLevel(currentWordId))
      ? currentWordId
      : undefined;

  return {
    mode: session.mode,
    wordIds,
    currentIndex: clampSessionIndex(wordIds, preferredId, 0),
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
