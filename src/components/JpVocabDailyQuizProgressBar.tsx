"use client";

import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import { formatJpVocabDailyQuizProgressLabel } from "@/lib/jp-vocab-daily-quiz-progress";

type Props = {
  progress: JpVocabDailyQuizProgress;
  /** teacher = 单词抽背页；study = 今日背单词 */
  variant?: "teacher" | "study";
  /** 仅管理员：在进度条内设置今日抽查总数 */
  adminQuizTarget?: {
    value: number;
    savedValue: number;
    hideCheckedToday: boolean;
    savedHideCheckedToday: boolean;
    saving: boolean;
    onChange: (value: number) => void;
    onHideCheckedTodayChange: (value: boolean) => void;
    onSave: () => void;
  };
};

export function JpVocabDailyQuizProgressBar({
  progress,
  variant = "study",
  adminQuizTarget,
}: Props) {
  if (progress.total <= 0 && !adminQuizTarget) return null;

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
      {adminQuizTarget ? (
        <div className="jp-vocab-quiz-target-admin">
          <label className="jp-vocab-quiz-target-admin__label" htmlFor="jp-vocab-quiz-target">
            今日抽查数量
          </label>
          <input
            id="jp-vocab-quiz-target"
            type="number"
            className="jp-vocab-quiz-target-admin__input"
            min={1}
            max={999}
            step={1}
            value={adminQuizTarget.value}
            onChange={(e) => {
              const next = Number(e.target.value);
              adminQuizTarget.onChange(
                Number.isFinite(next) && next >= 1 ? Math.floor(next) : 1
              );
            }}
            disabled={adminQuizTarget.saving}
            aria-label="今日抽查数量"
          />
          <span className="jp-vocab-quiz-target-admin__unit">个</span>
          <label className="jp-vocab-quiz-target-admin__checkbox">
            <input
              type="checkbox"
              checked={adminQuizTarget.hideCheckedToday}
              onChange={(e) =>
                adminQuizTarget.onHideCheckedTodayChange(e.target.checked)
              }
              disabled={adminQuizTarget.saving}
            />
            <span>隐藏老师端已抽查单词</span>
          </label>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
            onClick={adminQuizTarget.onSave}
            disabled={
              adminQuizTarget.saving ||
              adminQuizTarget.value < 1 ||
              (adminQuizTarget.value === adminQuizTarget.savedValue &&
                adminQuizTarget.hideCheckedToday ===
                  adminQuizTarget.savedHideCheckedToday)
            }
          >
            {adminQuizTarget.saving ? "保存中…" : "确认设置"}
          </button>
        </div>
      ) : null}
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
        .jp-vocab-quiz-target-admin {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem 0.5rem;
          margin-bottom: 0.55rem;
          padding: 0.45rem 0.55rem;
          border-radius: 6px;
          border: 1px dashed color-mix(in srgb, var(--accent) 35%, var(--border));
          background: color-mix(in srgb, var(--panel) 94%, var(--accent) 6%);
        }
        .jp-vocab-quiz-target-admin__label,
        .jp-vocab-quiz-target-admin__unit {
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-quiz-target-admin__checkbox {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.8125rem;
          color: var(--text);
          cursor: pointer;
          user-select: none;
        }
        .jp-vocab-quiz-target-admin__checkbox input {
          margin: 0;
        }
        .jp-vocab-quiz-target-admin__input {
          width: 4.25rem;
          padding: 0.2rem 0.45rem;
          border-radius: 4px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font-size: 0.875rem;
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-quiz-target-admin__input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .jp-vocab-quiz-target-admin__input:disabled {
          opacity: 0.6;
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
