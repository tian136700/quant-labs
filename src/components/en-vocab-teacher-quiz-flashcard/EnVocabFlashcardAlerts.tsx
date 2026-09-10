"use client";

import { useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { copyTextToClipboard } from "@/lib/copy-text";

type Props = {
  nextBlockedHint: boolean;
  /** 同步给学生未完成时点「下一个」 */
  syncWaitHint?: boolean;
  /** true=超时/失败文案；false=进行中请稍等 */
  syncWaitFailed?: boolean;
  /** 失败时展示的原始报错（禁止只写「同步失败」） */
  syncWaitErrorDetail?: string | null;
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
  syncWaitErrorDetail = null,
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
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const errorLog =
    (syncWaitErrorDetail || "").trim() ||
    "（无详细报错；请再点「下一个」重试并保留此弹窗）";

  const handleCopyError = () => {
    void copyTextToClipboard(errorLog).then((ok) =>
      setCopyToast(ok ? "复制成功" : "复制失败")
    );
  };

  return (
    <>
      {syncWaitHint && !previewMode && !isStudy ? (
        <div
          className="jp-vocab-teacher-quiz-alert-overlay"
          role="presentation"
          onClick={() => onDismissSyncWait?.()}
        >
          <div
            className={
              syncWaitFailed
                ? "jp-vocab-teacher-quiz-alert jp-vocab-teacher-quiz-alert--error-log"
                : "jp-vocab-teacher-quiz-alert"
            }
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
              {syncWaitFailed ? "报错（原样）" : "此单词正在同步给学生复习"}
            </h3>
            {syncWaitFailed ? (
              <pre
                id="en-vocab-teacher-quiz-sync-desc"
                className="jp-vocab-teacher-quiz-alert__error-log"
              >
                {errorLog}
              </pre>
            ) : (
              <p
                id="en-vocab-teacher-quiz-sync-desc"
                className="jp-vocab-teacher-quiz-alert__desc"
              >
                此单词正在同步给学生复习，请稍等。
              </p>
            )}
            {syncWaitFailed ? (
              <div className="jp-vocab-teacher-quiz-alert__actions">
                <button
                  type="button"
                  className="btn-rsi-filter jp-vocab-teacher-quiz-alert__copy"
                  onClick={handleCopyError}
                >
                  复制报错
                </button>
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz-alert__close"
                  onClick={() => onDismissSyncWait?.()}
                >
                  知道了
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz-alert__close"
                onClick={() => onDismissSyncWait?.()}
              >
                知道了
              </button>
            )}
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

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />
    </>
  );
}
