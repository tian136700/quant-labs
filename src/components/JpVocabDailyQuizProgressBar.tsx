"use client";

import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import { formatJpVocabDailyQuizProgressLabel } from "@/lib/jp-vocab-daily-quiz-progress";

type Props = {
  progress: JpVocabDailyQuizProgress;
  /** teacher = 单词抽背页；study = 今日背单词 */
  variant?: "teacher" | "study";
};

export function JpVocabDailyQuizProgressBar({
  progress,
  variant = "study",
}: Props) {
  if (progress.total <= 0) return null;

  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.checked / progress.total) * 100))
      : 0;

  const label =
    variant === "study"
      ? `老师抽查进度：${formatJpVocabDailyQuizProgressLabel(progress)}`
      : formatJpVocabDailyQuizProgressLabel(progress);

  return (
    <div
      className={`jp-vocab-quiz-progress jp-vocab-quiz-progress--${variant}${
        progress.complete ? " jp-vocab-quiz-progress--complete" : ""
      }`}
      role="status"
      aria-label={label}
    >
      <div className="jp-vocab-quiz-progress-head">
        <span className="jp-vocab-quiz-progress-title">
          {variant === "study" ? "老师抽查进度" : "今日抽查进度"}
        </span>
        <span className="jp-vocab-quiz-progress-stats">
          <strong>{progress.checked}</strong>
          <span className="jp-vocab-quiz-progress-sep">/</span>
          {progress.total}
          {!progress.complete ? (
            <span className="jp-vocab-quiz-progress-remaining">
              （剩余 {progress.remaining}）
            </span>
          ) : (
            <span className="jp-vocab-quiz-progress-done">（已完成）</span>
          )}
        </span>
      </div>
      <div
        className="jp-vocab-quiz-progress-track"
        aria-hidden="true"
      >
        <div
          className="jp-vocab-quiz-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>

      <style jsx>{`
        .jp-vocab-quiz-progress {
          margin-bottom: 0.85rem;
          padding: 0.75rem 0.85rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 92%, var(--accent) 8%);
        }
        .jp-vocab-quiz-progress--complete {
          border-color: color-mix(in srgb, var(--fall) 35%, var(--border));
          background: color-mix(in srgb, var(--panel) 88%, var(--fall) 12%);
        }
        .jp-vocab-quiz-progress-head {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.35rem 0.75rem;
          margin-bottom: 0.5rem;
        }
        .jp-vocab-quiz-progress-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
        }
        .jp-vocab-quiz-progress-stats {
          font-size: 0.875rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-quiz-progress-stats strong {
          color: var(--accent);
          font-weight: 700;
        }
        .jp-vocab-quiz-progress--complete .jp-vocab-quiz-progress-stats strong {
          color: var(--fall);
        }
        .jp-vocab-quiz-progress-sep {
          margin: 0 0.15rem;
        }
        .jp-vocab-quiz-progress-remaining,
        .jp-vocab-quiz-progress-done {
          margin-left: 0.25rem;
          font-size: 0.8125rem;
        }
        .jp-vocab-quiz-progress-done {
          color: var(--fall);
          font-weight: 600;
        }
        .jp-vocab-quiz-progress-track {
          height: 0.45rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--border) 70%, transparent);
          overflow: hidden;
        }
        .jp-vocab-quiz-progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--accent) 85%, #fff),
            var(--accent)
          );
          transition: width 0.35s ease;
        }
        .jp-vocab-quiz-progress--complete .jp-vocab-quiz-progress-fill {
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--fall) 80%, #fff),
            var(--fall)
          );
        }
      `}</style>
    </div>
  );
}
