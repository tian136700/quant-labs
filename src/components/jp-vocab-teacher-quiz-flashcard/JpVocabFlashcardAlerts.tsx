"use client";

type Props = {
  nextBlockedHint: boolean;
  /** 同步给学生未完成时点「下一个」 */
  syncWaitHint?: boolean;
  previewMode: boolean;
  isCoach: boolean;
  isStudy: boolean;
  selected: import("@/lib/types").JpVocabLevel | undefined;
  remainingUncheckedHint: boolean;
  onDismissNextBlocked: () => void;
  onDismissSyncWait?: () => void;
  onDismissRemaining: () => void;
  stop: (e: React.MouseEvent) => void;
};

export function JpVocabFlashcardAlerts({
  nextBlockedHint,
  syncWaitHint = false,
  previewMode,
  isCoach,
  isStudy,
  selected,
  remainingUncheckedHint,
  onDismissNextBlocked,
  onDismissSyncWait,
  onDismissRemaining,
  stop,
}: Props) {
  return (
    <>
      {syncWaitHint && !previewMode && !isCoach && !isStudy ? (
        <div
          className="jp-vocab-teacher-quiz-alert-overlay"
          role="presentation"
          onClick={() => onDismissSyncWait?.()}
        >
          <div
            className="jp-vocab-teacher-quiz-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="jp-vocab-teacher-quiz-sync-title"
            aria-describedby="jp-vocab-teacher-quiz-sync-desc"
            onClick={stop}
          >
            <h3
              id="jp-vocab-teacher-quiz-sync-title"
              className="jp-vocab-teacher-quiz-alert__title"
            >
              正在同步该单词给学生
            </h3>
            <p
              id="jp-vocab-teacher-quiz-sync-desc"
              className="jp-vocab-teacher-quiz-alert__desc"
            >
              正在同步该单词给学生，请稍等。
            </p>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz-alert__close"
              onClick={() => onDismissSyncWait?.()}
            >
              知道了
            </button>
          </div>
        </div>
      ) : null}

      {nextBlockedHint && !previewMode && !isCoach && !isStudy && !selected ? (
        <div
          className="jp-vocab-teacher-quiz-alert-overlay"
          role="presentation"
          onClick={() => onDismissNextBlocked()}
        >
          <div
            className="jp-vocab-teacher-quiz-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="jp-vocab-teacher-quiz-alert-title"
            aria-describedby="jp-vocab-teacher-quiz-alert-desc"
            onClick={stop}
          >
            <h3 id="jp-vocab-teacher-quiz-alert-title" className="jp-vocab-teacher-quiz-alert__title">
              请先勾选熟悉程度
            </h3>
            <p id="jp-vocab-teacher-quiz-alert-desc" className="jp-vocab-teacher-quiz-alert__desc">
              请先勾选学生的熟悉程度，再进入下一词。
            </p>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz-alert__close"
              onClick={() => onDismissNextBlocked()}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {remainingUncheckedHint && !previewMode && !isCoach ? (
        <div
          className="jp-vocab-teacher-quiz-alert-overlay"
          role="presentation"
          onClick={() => onDismissRemaining()}
        >
          <div
            className="jp-vocab-teacher-quiz-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="jp-vocab-teacher-quiz-remain-title"
            aria-describedby="jp-vocab-teacher-quiz-remain-desc"
            onClick={stop}
          >
            <h3
              id="jp-vocab-teacher-quiz-remain-title"
              className="jp-vocab-teacher-quiz-alert__title"
            >
              还有未抽查词条
            </h3>
            <p
              id="jp-vocab-teacher-quiz-remain-desc"
              className="jp-vocab-teacher-quiz-alert__desc"
            >
              本轮仍有词条未勾选熟悉程度，已为你跳到下一词。请继续勾选后完成抽查。
            </p>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz-alert__close"
              onClick={() => onDismissRemaining()}
            >
              继续抽查
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
