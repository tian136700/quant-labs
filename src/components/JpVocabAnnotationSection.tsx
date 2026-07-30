"use client";

import {
  JP_VOCAB_ANNOTATION_LABEL,
  normalizeJpVocabAnnotation,
} from "@/lib/jp-vocab-annotation";

/** 抽问/带读/学生/复习卡：备注下方展示「标注」 */
export function JpVocabAnnotationSection({
  annotation,
}: {
  annotation?: string | null;
}) {
  const value = normalizeJpVocabAnnotation(annotation);
  if (!value) return null;

  return (
    <section
      className="jp-vocab-teacher-quiz__annotation"
      aria-label={JP_VOCAB_ANNOTATION_LABEL}
    >
      <h3 className="jp-vocab-teacher-quiz__annotation-title">
        {JP_VOCAB_ANNOTATION_LABEL}
      </h3>
      <p className="jp-vocab-teacher-quiz__annotation-value">{value}</p>
    </section>
  );
}
