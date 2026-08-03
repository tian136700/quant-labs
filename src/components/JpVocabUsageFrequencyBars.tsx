"use client";

import {
  clampJpVocabFrequency,
  JP_VOCAB_EXAM_FREQUENCY_LABEL,
  JP_VOCAB_ORAL_FREQUENCY_LABEL,
} from "@/lib/jp-vocab-frequency";

/**
 * 语法用法旁：口语频率 / 考试频率小进度条（满分 10，7 → 70%），
 * 对齐词级 JpVocabCourseFreqMetaSection 与英语「出现频次」条。
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
        title={`${label} ${score}/10（满分 10）`}
        aria-label={`${label} ${score}/10`}
      >
        <span className="jp-usage-ex-paired-freq-caption">{label}</span>
        <span
          className="jp-usage-ex-paired-freq-bar"
          role="progressbar"
          aria-valuemin={1}
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
    <div className="jp-usage-ex-paired-freq-wrap">
      {oral != null ? row(JP_VOCAB_ORAL_FREQUENCY_LABEL, oral) : null}
      {exam != null ? row(JP_VOCAB_EXAM_FREQUENCY_LABEL, exam) : null}
    </div>
  );
}
