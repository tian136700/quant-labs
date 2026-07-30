"use client";

/** 抽问/带读/学生/复习卡：次要教材课次标签（如「标日初级上册第23课」），靠后弱展示 */
export function JpVocabCourseLabelSection({
  courseLabel,
}: {
  courseLabel?: string | null;
}) {
  const value = (courseLabel || "").trim();
  if (!value) return null;

  return (
    <div
      className="jp-vocab-teacher-quiz__course-label"
      aria-label={`教材：${value}`}
    >
      <span className="jp-vocab-teacher-quiz__course-label-tag" title={value}>
        {value}
      </span>
    </div>
  );
}
