"use client";

import {
  clampJpVocabFrequency,
  JP_VOCAB_EXAM_FREQUENCY_LABEL,
  JP_VOCAB_ORAL_FREQUENCY_LABEL,
} from "@/lib/jp-vocab-frequency";

/**
 * 语法用法旁：口语频率 / 考试频率小进度条（满分 10，7 → 70% 条宽）。
 * 样式写在本组件（jsx global），避免子组件挂在 PairedContent 时 fill 样式丢失 → 整条灰。
 * 文案必须写完整「口语频率」「考试频率」。
 */
export function JpVocabUsageFrequencyBars({
  oralFrequency,
  examFrequency,
}: {
  oralFrequency?: number | null;
  examFrequency?: number | null;
}) {
  const oral = clampJpVocabFrequency(oralFrequency);
  const exam = clampJpVocabFrequency(examFrequency);
  if (oral == null && exam == null) return null;

  const row = (label: string, score: number) => {
    const pct = Math.round((score / 10) * 100);
    return (
      <span
        key={label}
        className="jp-usage-ex-paired-freq-row"
        title={`${label} ${score}/10（满分 10；约${pct}%）`}
        aria-label={`${label} ${score}/10，满分 10`}
      >
        <span className="jp-usage-ex-paired-freq-caption">{label}</span>
        <span
          className="jp-usage-ex-paired-freq-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuenow={score}
        >
          <span
            className="jp-usage-ex-paired-freq-fill"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="jp-usage-ex-paired-freq-score">{score}/10</span>
      </span>
    );
  };

  return (
    <div className="jp-usage-ex-paired-freq-wrap" aria-label="出现频率">
      {oral != null ? row(JP_VOCAB_ORAL_FREQUENCY_LABEL, oral) : null}
      {exam != null ? row(JP_VOCAB_EXAM_FREQUENCY_LABEL, exam) : null}
      <style jsx global>{`
        .jp-usage-ex-paired-freq-wrap {
          display: flex;
          flex-direction: column;
          gap: 0.28rem;
          margin: 0.28rem 0 0.4rem;
          max-width: 100%;
        }
        .jp-usage-ex-paired-freq-row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          white-space: nowrap;
          max-width: 100%;
        }
        .jp-usage-ex-paired-freq-caption {
          flex: 0 0 auto;
          min-width: 4.8em;
          font-size: 0.8rem;
          font-weight: 650;
          letter-spacing: 0.01em;
          color: var(--muted);
        }
        .jp-usage-ex-paired-freq-bar {
          display: inline-flex;
          align-items: stretch;
          width: 5.5rem;
          height: 0.55rem;
          border-radius: 999px;
          /* 轨道：可见灰底，与占比填充对比 */
          background: color-mix(in srgb, var(--muted, #94a3b8) 28%, #0f172a);
          overflow: hidden;
          flex: 0 0 auto;
        }
        .jp-usage-ex-paired-freq-fill {
          display: block;
          height: 100%;
          min-height: 0.55rem;
          border-radius: inherit;
          /* 实心 accent，7/10 → 宽 70%；勿用高透明 mix（暗色底上看不见） */
          background: var(--accent, #3b82f6);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 12%, transparent);
        }
        .jp-usage-ex-paired-freq-score {
          flex: 0 0 auto;
          font-size: 0.8rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: color-mix(in srgb, var(--accent, #3b82f6) 88%, var(--text, #e2e8f0));
        }
        @media (max-width: 767px) {
          .jp-usage-ex-paired-freq-bar {
            width: 4.2rem;
            height: 0.48rem;
          }
          .jp-usage-ex-paired-freq-fill {
            min-height: 0.48rem;
          }
          .jp-usage-ex-paired-freq-caption,
          .jp-usage-ex-paired-freq-score {
            font-size: 0.72rem;
          }
        }
      `}</style>
    </div>
  );
}
