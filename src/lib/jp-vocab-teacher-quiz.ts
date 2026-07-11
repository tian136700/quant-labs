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
