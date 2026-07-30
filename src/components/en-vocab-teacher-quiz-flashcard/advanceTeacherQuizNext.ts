import type { EnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz";
import { findFirstUncheckedEnVocabTeacherQuizIndex } from "@/lib/en-vocab-teacher-quiz";

export type EnVocabAdvanceTeacherQuizNextArgs = {
  session: EnVocabTeacherQuizSession;
  wordHasLevel: (wordId: number) => boolean;
  uncheckedCount: number;
  onNavigate: (index: number) => void;
  onComplete: () => void;
  setRemainingUncheckedHint: (v: boolean) => void;
};

/** 老师抽查卡：当前词已勾选后跳下一未勾选 / 完成（不含先同步——调用方先 ensure share） */
export function advanceEnVocabTeacherQuizNext(
  args: EnVocabAdvanceTeacherQuizNextArgs
): void {
  const {
    session,
    wordHasLevel,
    uncheckedCount,
    onNavigate,
    onComplete,
    setRemainingUncheckedHint,
  } = args;

  const nextUnchecked = findFirstUncheckedEnVocabTeacherQuizIndex(
    session,
    wordHasLevel,
    session.currentIndex + 1
  );
  if (nextUnchecked >= 0) {
    onNavigate(nextUnchecked);
    return;
  }
  const remainingUnchecked = findFirstUncheckedEnVocabTeacherQuizIndex(
    session,
    wordHasLevel,
    0
  );
  if (remainingUnchecked >= 0) {
    if (remainingUnchecked !== session.currentIndex) {
      onNavigate(remainingUnchecked);
    }
    setRemainingUncheckedHint(true);
    return;
  }
  if (uncheckedCount > 0) {
    setRemainingUncheckedHint(true);
    onComplete();
    return;
  }
  onComplete();
}
