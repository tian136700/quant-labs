"use client";

import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import {
  formatJpVocabDailyQuizProgressLabel,
  jpVocabDailyQuizProgressDisplayChecked,
} from "@/lib/jp-vocab-daily-quiz-progress";

type Props = {
  progress: JpVocabDailyQuizProgress;
  /** teacher = 单词抽背页；study = 今日背单词 */
  variant?: "teacher" | "study";
  /** 仅管理员：在进度条内设置今日抽查总数 */
  adminQuizTarget?: {
    value: string;
    savedValue: number;
    saving: boolean;
    onChange: (value: string) => void;
    onSave: () => void;
    /** 聚焦编辑中：父级勿用 sync 旧值盖回草稿 */
    onFocusChange?: (focused: boolean) => void;
  };
  /** 今日抽查已完成：进入课堂带读 */
  coachAction?: {
    busy: boolean;
    coachCount: number;
    onClick: () => void;
  };
};

function parseQuizTargetDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const count = Math.floor(parsed);
  if (count < 1 || count > 999) return null;
  return count;
}

/** 全角数字 → 半角，避免 IME/全角键盘打字被 /^\d+$/ 静默吞掉 */
function normalizeQuizTargetInputDigits(raw: string): string {
  return raw.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10)
  );
}

function isAllowedQuizTargetDraft(next: string): boolean {
  return next === "" || /^\d{0,3}$/.test(next);
}

/**
 * 中文等 CJK IME 常把数字键当成候选选择（空框时按 3 像「打不进去」）。
 * 在 keydown 里手动插入半角数字，绕过 IME。
 */
function applyQuizTargetDigitKey(
  current: string,
  key: string,
  selectionStart: number | null,
  selectionEnd: number | null
): { next: string; caret: number } | null {
  if (!/^[0-9]$/.test(key)) return null;
  const start = selectionStart ?? current.length;
  const end = selectionEnd ?? current.length;
  const next = normalizeQuizTargetInputDigits(
    current.slice(0, start) + key + current.slice(end)
  );
  if (!isAllowedQuizTargetDraft(next)) return null;
  return { next, caret: Math.min(start + 1, next.length) };
}

export function JpVocabDailyQuizProgressBar({
  progress,
  variant = "study",
  adminQuizTarget,
  coachAction,
}: Props) {
  if (progress.total <= 0 && !adminQuizTarget) return null;

  const displayChecked = jpVocabDailyQuizProgressDisplayChecked(progress);

  const pct = progress.complete
    ? 100
    : progress.total > 0
      ? Math.min(100, Math.round((displayChecked / progress.total) * 100))
      : 0;

  const label =
    variant === "study"
      ? `老师抽查进度：${formatJpVocabDailyQuizProgressLabel(progress)}`
      : formatJpVocabDailyQuizProgressLabel(progress);

  const parsedQuizTarget = adminQuizTarget
    ? parseQuizTargetDraft(adminQuizTarget.value)
    : null;

  const title =
    variant === "study"
      ? "老师抽查进度"
      : adminQuizTarget
        ? "今日抽查进度"
        : "抽查进度";

  return (
    <div
      className={`jp-vocab-quiz-progress jp-vocab-quiz-progress--${variant}${
        progress.complete ? " jp-vocab-quiz-progress--complete" : ""
      }`}
      role="status"
      aria-label={label}
    >
      <div className="jp-vocab-quiz-progress-head">
        <span className="jp-vocab-quiz-progress-title">{title}</span>
        {adminQuizTarget ? (
          <div className="jp-vocab-quiz-target-admin">
            <label className="jp-vocab-quiz-target-admin__label" htmlFor="jp-vocab-quiz-target">
              今日抽查数量
            </label>
            <input
              id="jp-vocab-quiz-target"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              lang="en"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="jp-vocab-quiz-target-admin__input"
              value={adminQuizTarget.value}
              onFocus={(e) => {
                adminQuizTarget.onFocusChange?.(true);
                // 全选后直接打新数字即可替换；与 IME 数字键兜底配合
                e.currentTarget.select();
              }}
              onBlur={() => adminQuizTarget.onFocusChange?.(false)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.key === "Process") return;
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                if (!/^[0-9]$/.test(e.key)) return;
                e.preventDefault();
                const el = e.currentTarget;
                const applied = applyQuizTargetDigitKey(
                  adminQuizTarget.value,
                  e.key,
                  el.selectionStart,
                  el.selectionEnd
                );
                if (!applied) return;
                adminQuizTarget.onChange(applied.next);
                requestAnimationFrame(() => {
                  try {
                    el.setSelectionRange(applied.caret, applied.caret);
                  } catch {
                    /* ignore */
                  }
                });
              }}
              onChange={(e) => {
                const next = normalizeQuizTargetInputDigits(e.target.value);
                if (isAllowedQuizTargetDraft(next)) {
                  adminQuizTarget.onChange(next);
                }
              }}
              disabled={adminQuizTarget.saving}
              aria-label="今日抽查数量"
            />
            <span className="jp-vocab-quiz-target-admin__unit">个</span>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
              onClick={adminQuizTarget.onSave}
              disabled={
                adminQuizTarget.saving ||
                parsedQuizTarget == null ||
                parsedQuizTarget === adminQuizTarget.savedValue
              }
            >
              {adminQuizTarget.saving ? "保存中…" : "确认设置"}
            </button>
          </div>
        ) : null}
        <span className="jp-vocab-quiz-progress-stats">
          {progress.complete ? (
            <span className="jp-vocab-quiz-progress-done">已完成</span>
          ) : (
            <>
              <strong>{displayChecked}</strong>
              <span className="jp-vocab-quiz-progress-sep">/</span>
              {progress.total}
              <span className="jp-vocab-quiz-progress-remaining">
                （剩余 {progress.remaining}）
              </span>
            </>
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
      {progress.complete && variant === "teacher" && coachAction ? (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-quiz-progress-coach-btn"
          disabled={coachAction.busy}
          onClick={coachAction.onClick}
        >
          {coachAction.busy
            ? "正在进入今日带读…"
            : coachAction.coachCount > 0
              ? `进入今日带读（${coachAction.coachCount} 条）`
              : "进入今日带读"}
        </button>
      ) : null}

      {/* jsx global：须压过 globals-forms 的 input[type=text]{w-full;min-height:44px}，
          否则进度条一行里输入框被压扁，数字像「打不进去」 */}
      <style jsx global>{`
        .jp-vocab-quiz-progress {
          margin-bottom: 0.55rem;
          padding: 0.4rem 0.65rem 0.45rem;
          border-radius: 6px;
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
          align-items: center;
          gap: 0.3rem 0.65rem;
          margin-bottom: 0.3rem;
        }
        .jp-vocab-quiz-target-admin {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.25rem 0.35rem;
          flex: 1 1 auto;
          min-width: 0;
        }
        .jp-vocab-quiz-target-admin__label,
        .jp-vocab-quiz-target-admin__unit {
          display: inline;
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
          flex: 0 0 auto;
        }
        input.jp-vocab-quiz-target-admin__input[type="text"] {
          box-sizing: border-box;
          flex: 0 0 auto;
          flex-shrink: 0;
          width: 3.5rem;
          min-width: 3.5rem;
          max-width: 4.5rem;
          min-height: 1.85rem;
          height: 1.85rem;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          caret-color: var(--accent);
          font-size: 0.875rem;
          font-variant-numeric: tabular-nums;
          line-height: 1.25;
          text-align: center;
        }
        input.jp-vocab-quiz-target-admin__input[type="text"]:focus {
          outline: none;
          border-color: var(--accent);
        }
        input.jp-vocab-quiz-target-admin__input[type="text"]:disabled {
          opacity: 0.6;
        }
        .jp-vocab-quiz-progress-title {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text);
          flex: 0 0 auto;
        }
        .jp-vocab-quiz-progress-stats {
          font-size: 0.8125rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
          flex: 0 0 auto;
          margin-left: auto;
        }
        .jp-vocab-quiz-progress-stats strong {
          color: var(--accent);
          font-weight: 700;
        }
        .jp-vocab-quiz-progress--complete .jp-vocab-quiz-progress-stats strong {
          color: var(--fall);
        }
        .jp-vocab-quiz-progress-sep {
          margin: 0 0.1rem;
        }
        .jp-vocab-quiz-progress-remaining,
        .jp-vocab-quiz-progress-done {
          margin-left: 0.2rem;
          font-size: 0.75rem;
        }
        .jp-vocab-quiz-progress-done {
          color: var(--fall);
          font-weight: 600;
        }
        .jp-vocab-quiz-progress-track {
          height: 0.28rem;
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
        .jp-vocab-quiz-progress-coach-btn {
          width: 100%;
          margin-top: 0.45rem;
        }
      `}</style>
    </div>
  );
}
