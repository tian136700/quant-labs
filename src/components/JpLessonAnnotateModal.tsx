"use client";

import {
  LessonAnnotateModal,
  type LessonAnnotateModalProps,
} from "@/components/lesson-annotate/LessonAnnotateModal";
import type { JpLessonRecord, JpVocabRef } from "@/lib/types";

type Props = Omit<LessonAnnotateModalProps, "subject" | "onSaved"> & {
  onSaved?: (ref: JpVocabRef, lesson: JpLessonRecord) => void;
};

/** 日语新课随手画 — 实现见 `lesson-annotate/LessonAnnotateModal`. */
export function JpLessonAnnotateModal({ onSaved, ...rest }: Props) {
  return (
    <LessonAnnotateModal
      {...rest}
      subject="jp"
      onSaved={
        onSaved
          ? (ref, lesson) => onSaved(ref as JpVocabRef, lesson as JpLessonRecord)
          : undefined
      }
    />
  );
}
