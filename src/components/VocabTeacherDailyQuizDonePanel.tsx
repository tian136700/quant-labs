"use client";

type CoachAction = {
  busy: boolean;
  coachCount: number;
  onClick: () => void;
};

type ExportAction = {
  busy: boolean;
  onClick: () => void;
};

type Props = {
  /** 日语：今日抽单词已抽查完成；英语：本轮单词已抽查完成 */
  title: string;
  subtitle?: string;
  onViewLastWord: () => void;
  viewLastDisabled?: boolean;
  coachAction?: CoachAction;
  /** 英语老师端：导出今日抽查预览 Excel */
  exportAction?: ExportAction;
};

/**
 * 老师端今日/本轮抽完后的落地页：祝贺 +「查看上一个单词」回看卡片。
 */
export function VocabTeacherDailyQuizDonePanel({
  title,
  subtitle = "点「查看上一个单词」可回看；您也可以选择关闭当前页面。",
  onViewLastWord,
  viewLastDisabled = false,
  coachAction,
  exportAction,
}: Props) {
  return (
    <div
      className="vocab-teacher-quiz-done-panel"
      role="status"
      aria-live="polite"
    >
      <div className="vocab-teacher-quiz-done-panel__icon" aria-hidden="true">
        ✓
      </div>
      <h2 className="vocab-teacher-quiz-done-panel__title">{title}</h2>
      {subtitle ? (
        <p className="vocab-teacher-quiz-done-panel__subtitle">{subtitle}</p>
      ) : null}
      <div className="vocab-teacher-quiz-done-panel__actions">
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--primary vocab-teacher-quiz-done-panel__btn"
          disabled={viewLastDisabled}
          onClick={onViewLastWord}
        >
          查看上一个单词
        </button>
        {exportAction ? (
          <button
            type="button"
            className="btn-rsi-filter vocab-teacher-quiz-done-panel__btn"
            disabled={exportAction.busy}
            onClick={exportAction.onClick}
          >
            {exportAction.busy ? "导出中…" : "导出 Excel"}
          </button>
        ) : null}
        {coachAction ? (
          <button
            type="button"
            className="btn-rsi-filter vocab-teacher-quiz-done-panel__btn"
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
      </div>
      <style jsx>{`
        .vocab-teacher-quiz-done-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          margin: 0 0 0.85rem;
          padding: 1.15rem 1rem 1rem;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--fall) 32%, var(--border));
          background: color-mix(in srgb, var(--fall) 8%, var(--panel));
        }
        .vocab-teacher-quiz-done-panel__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.75rem;
          height: 2.75rem;
          margin-bottom: 0.65rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--fall) 18%, var(--panel));
          color: var(--fall);
          font-size: 1.35rem;
          font-weight: 700;
          line-height: 1;
        }
        .vocab-teacher-quiz-done-panel__title {
          margin: 0 0 0.35rem;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text);
        }
        .vocab-teacher-quiz-done-panel__subtitle {
          margin: 0 0 0.95rem;
          max-width: 28rem;
          font-size: 0.9rem;
          line-height: 1.55;
          color: var(--muted);
        }
        .vocab-teacher-quiz-done-panel__actions {
          width: min(22rem, 100%);
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .vocab-teacher-quiz-done-panel__btn {
          width: 100%;
          min-height: 2.65rem;
        }
        @media (max-width: 767px) {
          .vocab-teacher-quiz-done-panel {
            padding: 1rem 0.85rem 0.9rem;
          }
          .vocab-teacher-quiz-done-panel__btn {
            font-size: clamp(0.8125rem, 3.4vw, 0.9375rem);
            line-height: 1.35;
          }
        }
      `}</style>
    </div>
  );
}
