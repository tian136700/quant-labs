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
          <span className="jp-vocab-teacher-quiz__meta-freq-score">
            {score}/10
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * 抽问/带读/学生/复习卡：备注（与标注）下方展示课数 + 口语/考试频率。
 * 无数据时仍显示行，值为空白（旧词条常见）。
 * 语法卡：隐藏词级口语/考试（改看每种用法旁的「口语 n/10 · 考试 m/10」）。
 */
export function JpVocabCourseFreqMetaSection({
  courseLabel,
  oralFrequency,
  examFrequency,
  kind,
  hideWordFrequency,
}: {
  courseLabel?: string | null;
  oralFrequency?: number | null;
  examFrequency?: number | null;
  /** grammar → 默认隐藏词级频率 */
  kind?: string | null;
  hideWordFrequency?: boolean;
}) {
  const course = (courseLabel || "").trim();
  const hideFreq =
    hideWordFrequency === true ||
    (hideWordFrequency !== false && String(kind || "").trim() === "grammar");

  return (
    <section
      className="jp-vocab-teacher-quiz__meta-after-notes"
      aria-label={hideFreq ? "课数" : "课数与出现频率"}
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
      {hideFreq ? null : (
        <>
          <FreqBar
            label={JP_VOCAB_ORAL_FREQUENCY_LABEL}
            frequency={oralFrequency}
          />
          <FreqBar
            label={JP_VOCAB_EXAM_FREQUENCY_LABEL}
            frequency={examFrequency}
          />
        </>
      )}
    </section>
  );
}
