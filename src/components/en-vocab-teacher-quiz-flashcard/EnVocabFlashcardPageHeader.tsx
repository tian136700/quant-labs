"use client";

import { enVocabTeacherQuizModeLabel } from "@/lib/en-vocab-teacher-quiz";
import { formatEnVocabQuizElapsedLabel } from "@/components/en-vocab-teacher-quiz-flashcard/helpers";

type Props = {
  isStudy: any;
  previewMode: any;
  session: any;
  locale: any;
  dailySeq: any;
  progressLabel: any;
  remainingLabel: any;
  sessionComplete: any;
  showAnswerTimer: any;
  answerTimerArmed: any;
  selected: any;
  answerElapsedSec: any;
  onClose: any;
  sessionChecked: any;
  sessionTotal: any;
  uncheckedCount: any;
  sessionPct: any;
  /** 学生主动「查看老师正在抽查的单词」 */
  studentPeeked: any;
  /** 老师勾选熟悉程度后已同步到学生「今日背英语单词」 */
  wordSynced?: boolean;
};

export function EnVocabFlashcardPageHeader({
  isStudy,
  previewMode,
  session,
  locale,
  dailySeq,
  progressLabel,
  remainingLabel,
  sessionComplete,
  showAnswerTimer,
  answerTimerArmed,
  selected,
  answerElapsedSec,
  onClose,
  sessionChecked,
  sessionTotal,
  uncheckedCount,
  sessionPct,
  studentPeeked,
  wordSynced = false,
}: Props) {
  // 学生主动查看优先于老师同步提示
  const studentStatusBanner =
    !isStudy && studentPeeked
      ? "该学生已查看该单词"
      : !isStudy && wordSynced
        ? "该单词已同步"
        : null;

  return (
        <header className="jp-vocab-teacher-quiz__header">
          <div className="jp-vocab-teacher-quiz__header-top">
            <div className="jp-vocab-teacher-quiz__header-left">
              {isStudy ? (
                <span className="jp-vocab-teacher-quiz__kind jp-vocab-teacher-quiz__kind--coach">
                  今日共享
                </span>
              ) : previewMode ? (
                <span className="jp-vocab-teacher-quiz__kind jp-vocab-teacher-quiz__kind--coach">
                  管理员预览
                </span>
              ) : session ? (
                <span
                  className="jp-vocab-teacher-quiz__mode"
                  title={
                    session.mode === "random"
                      ? locale === "zh"
                        ? "本轮为随机抽查"
                        : "This round is random order"
                      : locale === "zh"
                        ? "本轮为正序抽查"
                        : "This round is sequential order"
                  }
                >
                  {enVocabTeacherQuizModeLabel(session.mode, locale)}
                </span>
              ) : null}
              {!isStudy && dailySeq != null ? (
                <span className="jp-vocab-teacher-quiz__seq" title="今日固定序号">
                  序号 {dailySeq}
                </span>
              ) : null}
              {!isStudy ? (
                <span className="jp-vocab-teacher-quiz__progress">{progressLabel}</span>
              ) : null}
              {!sessionComplete && !previewMode && !isStudy ? (
                <span className="jp-vocab-teacher-quiz__remaining">{remainingLabel}</span>
              ) : null}
            </div>
            <div className="jp-vocab-teacher-quiz__header-right">
              {showAnswerTimer && answerTimerArmed ? (
                <div
                  className={`jp-vocab-teacher-quiz__answer-timer${
                    selected ? " jp-vocab-teacher-quiz__answer-timer--frozen" : ""
                  }`}
                  role="timer"
                  aria-live="off"
                  aria-atomic="true"
                  title={
                    locale === "zh"
                      ? selected
                        ? "计时器（勾选后已停住）"
                        : "计时器（从打开卡片起）"
                      : selected
                        ? "Timer (paused)"
                        : "Timer"
                  }
                >
                  <span className="jp-vocab-teacher-quiz__answer-timer-label">
                    {locale === "zh" ? "计时器" : "Timer"}
                  </span>
                  <span className="jp-vocab-teacher-quiz__answer-timer-value">
                    {formatEnVocabQuizElapsedLabel(answerElapsedSec)}
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                className="jp-vocab-teacher-quiz__close-x"
                aria-label={
                  isStudy ? "关闭" : previewMode ? "关闭预览" : "关闭抽查"
                }
                onClick={onClose}
              >
                ×
              </button>
            </div>
          </div>
          {!isStudy ? (
            <div
              className={`jp-vocab-teacher-quiz__header-progress${
                sessionComplete
                  ? " jp-vocab-teacher-quiz__header-progress--complete"
                  : ""
              }`}
            >
              <div className="jp-vocab-teacher-quiz__header-progress-head">
                <span className="jp-vocab-teacher-quiz__header-progress-title">
                  {previewMode
                    ? locale === "zh"
                      ? "抽问卡片预览"
                      : "Quiz card preview"
                    : locale === "zh"
                      ? "本轮抽查进度"
                      : "Round progress"}
                </span>
                <span className="jp-vocab-teacher-quiz__header-progress-stats">
                  {sessionComplete ? (
                    <span className="jp-vocab-teacher-quiz__header-progress-done">
                      {locale === "zh" ? "已完成" : "Done"}
                    </span>
                  ) : (
                    <>
                      <strong>{sessionChecked}</strong>
                      <span className="jp-vocab-teacher-quiz__header-progress-sep">
                        /
                      </span>
                      {sessionTotal}
                      <span className="jp-vocab-teacher-quiz__header-progress-remaining">
                        （剩余 {uncheckedCount}）
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div
                className="jp-vocab-teacher-quiz__progress-track"
                role="progressbar"
                aria-valuenow={sessionPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={
                  locale === "zh"
                    ? `本轮已抽查 ${sessionChecked} / ${sessionTotal}`
                    : `Round ${sessionChecked} / ${sessionTotal}`
                }
              >
                <div
                  className="jp-vocab-teacher-quiz__progress-fill"
                  style={{ width: `${sessionPct}%` }}
                />
              </div>
            </div>
          ) : null}
          {studentStatusBanner ? (
            <div
              className="jp-vocab-teacher-quiz__student-peek-banner"
              role="status"
              aria-live="polite"
            >
              <span className="jp-vocab-teacher-quiz__student-peek-banner-mark" aria-hidden="true">
                ●
              </span>
              <span className="jp-vocab-teacher-quiz__student-peek-banner-text">
                {studentStatusBanner}
              </span>
            </div>
          ) : null}
        </header>
  );
}
