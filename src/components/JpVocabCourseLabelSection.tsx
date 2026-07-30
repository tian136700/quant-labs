"use client";

/** 抽问/带读/学生/复习卡：偏后展示教材课次（如「标日初级上册第23课」） */
export function JpVocabCourseLabelSection({
  courseLabel,
}: {
  courseLabel?: string | null;
}) {
  const value = (courseLabel || "").trim();
  if (!value) return null;

  return (
    <section
      className="jp-vocab-teacher-quiz__course-label"
      aria-label="教材"
    >
      <h3 className="jp-vocab-teacher-quiz__course-label-title">教材</h3>
      <p className="jp-vocab-teacher-quiz__course-label-value">{value}</p>
    </section>
  );
}
