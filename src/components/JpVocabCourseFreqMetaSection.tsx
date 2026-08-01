"use client";

import {
  clampJpVocabFrequency,
  JP_VOCAB_COURSE_LABEL_DISPLAY,
  JP_VOCAB_EXAM_FREQUENCY_LABEL,
  JP_VOCAB_ORAL_FREQUENCY_LABEL,
} from "@/lib/jp-vocab-frequency";

function FreqBar({
  label,
  frequency,
}: {
  label: string;
  frequency: number | null | undefined;
}) {
  const score = clampJpVocabFrequency(frequency);
  return (
    <div className="jp-vocab-teacher-quiz__meta-row">
      <span className="jp-vocab-teacher-quiz__meta-label">{label}</span>
      {score == null ? (
        <span className="jp-vocab-teacher-quiz__meta-value jp-vocab-teacher-quiz__meta-empty">
          {"\u00A0"}
        </span>
      ) : (
        <span
          className="jp-vocab-teacher-quiz__meta-freq"
          title={`${label} ${score}（1～10）`}
          aria-label={`${label} ${score}`}
        >
          <span
            className="jp-vocab-teacher-quiz__meta-freq-bar"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={10}
            aria-valuenow={score}
          >
            <span
              className="jp-vocab-teacher-quiz__meta-freq-fill"
              style={{ width: `${Math.round((score / 10) * 100)}%` }}
            />
          </span>
          <span className="jp-vocab-teacher-quiz__meta-freq-score">{score}</span>
        </span>
      )}
    </div>
  );
}

/**
 * 抽问/带读/学生/复习卡：备注（与标注）下方展示课数 + 口语/考试频率。
 * 无数据时仍显示行，值为空白（旧词条常见）。
 */
export function JpVocabCourseFreqMetaSection({
  courseLabel,
  oralFrequency,
  examFrequency,
}: {
  courseLabel?: string | null;
  oralFrequency?: number | null;
  examFrequency?: number | null;
}) {
  const course = (courseLabel || "").trim();

  return (
    <section
      className="jp-vocab-teacher-quiz__meta-after-notes"
      aria-label="课数与出现频率"
    >
      <div className="jp-vocab-teacher-quiz__meta-row">
        <span className="jp-vocab-teacher-quiz__meta-label">
          {JP_VOCAB_COURSE_LABEL_DISPLAY}
        </span>
        <span
          className={`jp-vocab-teacher-quiz__meta-value${
            course ? "" : " jp-vocab-teacher-quiz__meta-empty"
          }`}
        >
          {course || "\u00A0"}
        </span>
      </div>
      <FreqBar label={JP_VOCAB_ORAL_FREQUENCY_LABEL} frequency={oralFrequency} />
      <FreqBar label={JP_VOCAB_EXAM_FREQUENCY_LABEL} frequency={examFrequency} />
    </section>
  );
}
