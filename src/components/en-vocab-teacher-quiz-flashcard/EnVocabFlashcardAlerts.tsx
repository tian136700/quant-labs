"use client";

type Props = {
  nextBlockedHint: boolean;
  /** 同步给学生未完成时点「下一个」 */
  syncWaitHint?: boolean;
  /** true=超时/失败文案；false=进行中请稍等 */
  syncWaitFailed?: boolean;
  previewMode: boolean;
  isStudy: boolean;
  selected: import("@/lib/types").EnVocabLevel | undefined;
  nextBlockedUsageMessage: string | null;
  remainingUncheckedHint: boolean;
  onDismissNextBlocked: () => void;
  onDismissSyncWait?: () => void;
  onDismissRemaining: () => void;
  stop: (e: React.MouseEvent) => void;
};

export function EnVocabFlashcardAlerts({
  nextBlockedHint,
  syncWaitHint = false,
  syncWaitFailed = false,
  previewMode,
  isStudy,
  selected,
  nextBlockedUsageMessage,
  remainingUncheckedHint,
  onDismissNextBlocked,
  onDismissSyncWait,
  onDismissRemaining,
  stop,
}: Props) {
  return (
    <>
      {syncWaitHint && !previewMode && !isStudy ? (
        <div
          className="jp-vocab-teacher-quiz-alert-overlay"
          role="presentation"
          onClick={() => onDismissSyncWait?.()}
        >
          <div
            className="jp-vocab-teacher-quiz-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="en-vocab-teacher-quiz-sync-title"
            aria-describedby="en-vocab-teacher-quiz-sync-desc"
            onClick={stop}
          >
            <h3
              id="en-vocab-teacher-quiz-sync-title"
              className="jp-vocab-teacher-quiz-alert__title"
            >
              {syncWaitFailed
                ? "同步失败或超时"
                : "此单词正在同步给学生复习"}
            </h3>
            <p
              id="en-vocab-teacher-quiz-sync-desc"
              className="jp-vocab-teacher-quiz-alert__desc"
            >
              {syncWaitFailed
                ? "同步失败或超时，请再点「下一个」重试。"
                : "此单词正在同步给学生复习，请稍等。"}
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

      {nextBlockedHint && !previewMode && !isStudy && !selected ? (
        <div
          className="jp-vocab-teacher-quiz-alert-overlay"
          role="presentation"
          onClick={() => {
            onDismissNextBlocked();
          }}
        >
          <div
            className="jp-vocab-teacher-quiz-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="en-vocab-teacher-quiz-alert-title"
            aria-describedby="en-vocab-teacher-quiz-alert-desc"
            onClick={stop}
          >
            <h3
              id="en-vocab-teacher-quiz-alert-title"
              className="jp-vocab-teacher-quiz-alert__title"
            >
              请先勾选熟悉程度
            </h3>
            <p
              id="en-vocab-teacher-quiz-alert-desc"
              className="jp-vocab-teacher-quiz-alert__desc"
            >
              {nextBlockedUsageMessage ??
                "请先勾选学生的熟悉程度，再进入下一词。"}
            </p>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz-alert__close"
              onClick={() => {
                onDismissNextBlocked();
              }}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {remainingUncheckedHint && !previewMode ? (
        <div
          className="jp-vocab-teacher-quiz-alert-overlay"
          role="presentation"
          onClick={() => onDismissRemaining()}
        >
          <div
            className="jp-vocab-teacher-quiz-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="en-vocab-teacher-quiz-remain-title"
            aria-describedby="en-vocab-teacher-quiz-remain-desc"
            onClick={stop}
          >
            <h3
              id="en-vocab-teacher-quiz-remain-title"
              className="jp-vocab-teacher-quiz-alert__title"
            >
              还有未抽查词条
            </h3>
            <p
              id="en-vocab-teacher-quiz-remain-desc"
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
