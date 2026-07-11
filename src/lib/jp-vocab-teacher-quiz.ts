import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { reviewTimestampMs } from "@/lib/jp-vocab-review";
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
  return (notes ?? "").trim().length <= JP_VOCAB_TEACHER_QUIZ_NOTES_INLINE_MAX;
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

function quizWordReviewTimestampMs(
  word: JpVocabWord,
  sessionReviewAtMs: number | undefined,
  now = new Date()
): number {
  const storedMs = reviewTimestampMs(word.last_review_at) ?? 0;
  if (sessionReviewAtMs == null) return storedMs;
  const sessionDay = beijingDateString(new Date(sessionReviewAtMs));
  if (sessionDay !== beijingDateString(now)) return storedMs;
  return Math.max(storedMs, sessionReviewAtMs);
}

/**
 * 刷新/掉线恢复：定位到本会话内最近一次勾选熟悉程度的词；
 * 若尚未勾选任何词，则落到第一个未勾选或会话起始索引。
 */
export function resolveJpVocabTeacherQuizRefreshResumeIndex(
  session: JpVocabTeacherQuizSession,
  wordsById: ReadonlyMap<number, JpVocabWord>,
  sessionReviewAt: Readonly<Record<number, number>>,
  hasLevel: (wordId: number) => boolean,
  now = new Date()
): number {
  let bestIndex = -1;
  let bestMs = -1;

  for (let i = 0; i < session.wordIds.length; i++) {
    const id = session.wordIds[i];
    const word = wordsById.get(id);
    if (!word || !hasLevel(id)) continue;
    const ms = quizWordReviewTimestampMs(word, sessionReviewAt[id], now);
    if (ms > bestMs) {
      bestMs = ms;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0) return bestIndex;
  return resolveJpVocabTeacherQuizResumeIndex(session, undefined, hasLevel);
}
