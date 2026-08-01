"use client";

type Props = {
  value: string;
  disabled?: boolean;
  feedback?: string | null;
  onChange: (value: string) => void;
  onApply: (value: string) => void;
};

/**
 * 「设置上课时间」顶部：粘贴课程签到通知 → 拆解老师与时间。
 */
export function LessonClassNoticePasteBox({
  value,
  disabled = false,
  feedback = null,
  onChange,
  onApply,
}: Props) {
  return (
    <div className="lesson-class-notice-paste">
      <label className="lesson-class-notice-paste-label" htmlFor="lesson-class-notice-paste-input">
        文字拆解
      </label>
      <textarea
        id="lesson-class-notice-paste-input"
        className="lesson-class-notice-paste-input"
        rows={5}
        disabled={disabled}
        value={value}
        placeholder={
          "粘贴课程签到通知，例如：\n任课教师    AliciaT\n上课时间    2026-08-01 09:00"
        }
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (!pasted.trim()) return;
          e.preventDefault();
          const el = e.currentTarget;
          const start = el.selectionStart ?? value.length;
          const end = el.selectionEnd ?? value.length;
          const next = `${value.slice(0, start)}${pasted}${value.slice(end)}`;
          onChange(next);
          onApply(next);
        }}
      />
      <div className="lesson-class-notice-paste-actions">
        <button
          type="button"
          className="lesson-class-notice-paste-apply"
          disabled={disabled || !value.trim()}
          onClick={() => onApply(value)}
        >
          拆解填入
        </button>
        {feedback ? (
          <p className="lesson-class-notice-paste-feedback" role="status">
            {feedback}
          </p>
        ) : (
          <p className="lesson-class-notice-paste-hint">
            粘贴后自动填日期、时间与老师；没有该老师时保存会新建。
          </p>
        )}
      </div>

      <style jsx>{`
        .lesson-class-notice-paste {
          margin: 0 0 0.85rem;
          padding: 0.65rem 0.7rem;
          border: 1px dashed color-mix(in srgb, var(--accent) 40%, var(--border));
          border-radius: 10px;
          background: color-mix(in srgb, var(--accent) 5%, var(--panel));
        }

        .lesson-class-notice-paste-label {
          display: block;
          margin-bottom: 0.4rem;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--muted);
        }

        .lesson-class-notice-paste-input {
          width: 100%;
          box-sizing: border-box;
          min-height: 5.5rem;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font-size: 0.8125rem;
          line-height: 1.45;
          resize: vertical;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        }

        .lesson-class-notice-paste-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 0.75rem;
          margin-top: 0.5rem;
        }

        .lesson-class-notice-paste-apply {
          flex-shrink: 0;
          padding: 0.4rem 0.75rem;
          border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
          border-radius: 8px;
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
          color: var(--accent);
          font-size: 0.8125rem;
          cursor: pointer;
        }

        .lesson-class-notice-paste-apply:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 18%, var(--panel));
        }

        .lesson-class-notice-paste-apply:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .lesson-class-notice-paste-feedback,
        .lesson-class-notice-paste-hint {
          margin: 0;
          flex: 1 1 12rem;
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--muted);
        }

        .lesson-class-notice-paste-feedback {
          color: var(--accent);
        }
      `}</style>
    </div>
  );
}
