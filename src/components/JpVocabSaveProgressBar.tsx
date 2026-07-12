"use client";

/** 远端 D1 写入时的标准橙色进度条（发给学生 / 勾选熟悉程度等共用） */
type Props = {
  label: string;
  percent: number;
  /** 额外 class，如卡片内 `jp-vocab-teacher-quiz__level-progress` */
  className?: string;
  /** 表格窄列 / 弹窗内默认 false；抽查卡片内 true */
  fullWidth?: boolean;
};

export function JpVocabSaveProgressBar({
  label,
  percent,
  className = "",
  fullWidth = false,
}: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      className={`jp-vocab-save-progress${fullWidth ? " jp-vocab-save-progress--full" : ""}${
        className ? ` ${className}` : ""
      }`}
      aria-live="polite"
    >
      <span className="jp-vocab-save-progress__label">{label}</span>
      <div
        className="jp-vocab-save-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={label}
      >
        <div
          className="jp-vocab-save-progress__fill"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <style jsx>{`
        .jp-vocab-save-progress {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.3rem;
          min-width: 7.5rem;
          max-width: 11rem;
          padding: 0.35rem 0.45rem;
          border-radius: 6px;
          border: 1px solid color-mix(in srgb, #f0a840 45%, var(--border));
          background: color-mix(in srgb, var(--panel) 90%, #f0a840 10%);
        }
        .jp-vocab-save-progress--full {
          width: 100%;
          max-width: none;
        }
        .jp-vocab-save-progress__label {
          font-size: 0.75rem;
          line-height: 1.3;
          color: #f0a840;
          text-align: center;
          white-space: nowrap;
        }
        .jp-vocab-save-progress__track {
          height: 0.4rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--border) 70%, transparent);
          overflow: hidden;
        }
        .jp-vocab-save-progress__fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, #f0a840 80%, #fff),
            #f0a840
          );
          transition: width 0.2s linear;
        }
      `}</style>
    </div>
  );
}
