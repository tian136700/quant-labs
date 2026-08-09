"use client";

type Props = {
  visible: boolean;
  finished: boolean;
  label: string;
};

/**
 * 复制 AI 提示词后顶部 7 分钟倒计时横幅。
 */
export function JpLessonAiPlanCopyCountdown({
  visible,
  finished,
  label,
}: Props) {
  if (!visible) return null;

  return (
    <div
      className={
        finished
          ? "jp-lesson-ai-plan-copy-countdown jp-lesson-ai-plan-copy-countdown--done"
          : "jp-lesson-ai-plan-copy-countdown"
      }
      role="timer"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="jp-lesson-ai-plan-copy-countdown-title">
        {finished ? "教案提醒" : "教案提醒倒计时"}
      </span>
      <span className="jp-lesson-ai-plan-copy-countdown-value">{label}</span>
      <style jsx global>{`
        .jp-lesson-ai-plan-copy-countdown {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: center;
          gap: 0.45rem 0.75rem;
          margin: 0 0 0.55rem;
          padding: 0.45rem 0.75rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 16%, var(--panel));
          color: var(--text);
          font-size: 0.92rem;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .jp-lesson-ai-plan-copy-countdown--done {
          border-color: color-mix(in srgb, #1a7f37 50%, var(--border));
          background: color-mix(in srgb, #1a7f37 18%, var(--panel));
        }
        .jp-lesson-ai-plan-copy-countdown-title {
          color: var(--muted);
          font-weight: 600;
          font-size: 0.82rem;
        }
        .jp-lesson-ai-plan-copy-countdown-value {
          font-variant-numeric: tabular-nums;
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--accent);
        }
        .jp-lesson-ai-plan-copy-countdown--done
          .jp-lesson-ai-plan-copy-countdown-value {
          color: color-mix(in srgb, #1a7f37 85%, var(--text));
        }
        @media (max-width: 767px) {
          .jp-lesson-ai-plan-copy-countdown {
            margin-bottom: 0.45rem;
            padding: 0.4rem 0.6rem;
          }
          .jp-lesson-ai-plan-copy-countdown-value {
            font-size: 1.05rem;
          }
        }
      `}</style>
    </div>
  );
}
