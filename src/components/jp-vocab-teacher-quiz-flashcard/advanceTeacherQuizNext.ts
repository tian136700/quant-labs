import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import { findFirstUncheckedJpVocabTeacherQuizIndex } from "@/lib/jp-vocab-teacher-quiz";

export type JpVocabAdvanceTeacherQuizNextArgs = {
  session: JpVocabTeacherQuizSession;
  wordHasLevel: (wordId: number) => boolean;
  uncheckedCount: number;
  onNavigate: (index: number) => void;
  onComplete: () => void;
  setRemainingUncheckedHint: (v: boolean) => void;
};

/**
 * 老师抽查卡（非带读）：当前词已勾选后，跳到下一未勾选词 / 完成。
 * （不含「先同步给学生」——调用方先 ensure share 再调本函数。）
 */
export function advanceJpVocabTeacherQuizNext(
  args: JpVocabAdvanceTeacherQuizNextArgs
): void {
  const {
    session,
    wordHasLevel,
    uncheckedCount,
    onNavigate,
    onComplete,
    setRemainingUncheckedHint,
  } = args;

  const nextUnchecked = findFirstUncheckedJpVocabTeacherQuizIndex(
    session,
    wordHasLevel,
    session.currentIndex + 1
  );
  if (nextUnchecked >= 0) {
    onNavigate(nextUnchecked);
    return;
  }
  const remainingUnchecked = findFirstUncheckedJpVocabTeacherQuizIndex(
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
  // 进度条仍显示剩余，但会话词都已勾选：交给 onComplete 补全队列（visible_ids 池）
  if (uncheckedCount > 0) {
    setRemainingUncheckedHint(true);
    onComplete();
    return;
  }
  onComplete();
}
