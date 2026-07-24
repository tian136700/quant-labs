"use client";

import { jpVocabTeacherQuizModeLabel } from "@/lib/jp-vocab-teacher-quiz";
import { formatJpVocabQuizElapsedLabel } from "@/components/jp-vocab-teacher-quiz-flashcard/helpers";
import type { JpVocabLevel, JpVocabTeacherQuizSession } from "@/lib/types";

type Props = {
  isStudy: boolean;
  isCoach: boolean;
  previewMode: boolean;
  session: JpVocabTeacherQuizSession | null;
  locale: "zh" | "en";
  dailySeq: number | null | undefined;
  progressLabel: string;
  remainingLabel: string;
  sessionComplete: boolean;
  showAnswerTimer: boolean;
  answerTimerArmed: boolean;
  selected: JpVocabLevel | undefined;
  answerElapsedSec: number;
  onClose: () => void;
  sessionChecked: number;
  sessionTotal: number;
  uncheckedCount: number;
  sessionPct: number;
  studentPeeked: boolean;
};

export function JpVocabFlashcardHeader(props: Props) {
  const {
    isStudy, isCoach, previewMode, session, locale, dailySeq, progressLabel, remainingLabel,
    sessionComplete, showAnswerTimer, answerTimerArmed, selected, answerElapsedSec, onClose,
    sessionChecked, sessionTotal, uncheckedCount, sessionPct, studentPeeked,
  } = props;
  return (
        <header className="jp-vocab-teacher-quiz__header">
          <div className="jp-vocab-teacher-quiz__header-top">
            <div className="jp-vocab-teacher-quiz__header-left">
              {isStudy ? (
                <span className="jp-vocab-teacher-quiz__kind jp-vocab-teacher-quiz__kind--coach">
                  今日共享
                </span>
              ) : isCoach ? (
                <span className="jp-vocab-teacher-quiz__kind jp-vocab-teacher-quiz__kind--coach">
                  {previewMode ? "带读卡片预览" : "课堂带读"}
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
                  {jpVocabTeacherQuizModeLabel(session.mode, locale)}
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
                    {formatJpVocabQuizElapsedLabel(answerElapsedSec)}
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                className="jp-vocab-teacher-quiz__close-x"
                aria-label={
                  isStudy
                    ? "关闭"
                    : previewMode
                      ? "关闭预览"
                      : isCoach
                        ? "关闭带读"
                        : "关闭抽查"
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
              sessionComplete ? " jp-vocab-teacher-quiz__header-progress--complete" : ""
            }`}
          >
            <div className="jp-vocab-teacher-quiz__header-progress-head">
              <span className="jp-vocab-teacher-quiz__header-progress-title">
                {previewMode && !isCoach
                  ? locale === "zh"
                    ? "抽问卡片预览"
                    : "Quiz card preview"
                  : locale === "zh"
                    ? isCoach
                      ? previewMode
                        ? "带读卡片预览"
                        : "本轮带读进度"
                      : "本轮抽查进度"
                    : isCoach
                      ? previewMode
                        ? "Coach card preview"
                        : "Read-along progress"
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
                    <span className="jp-vocab-teacher-quiz__header-progress-sep">/</span>
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
                  ? isCoach
                    ? `本轮已带读 ${sessionChecked} / ${sessionTotal}`
                    : `本轮已抽查 ${sessionChecked} / ${sessionTotal}`
                  : isCoach
                    ? `Read-along ${sessionChecked} / ${sessionTotal}`
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
        </header>
  );
}
