"use client";

import {
  LessonAnnotateModal,
  type LessonAnnotateModalProps,
} from "@/components/lesson-annotate/LessonAnnotateModal";
import type { EnLessonRecord, EnVocabRef } from "@/lib/types";

type Props = Omit<LessonAnnotateModalProps, "subject" | "onSaved"> & {
  onSaved?: (ref: EnVocabRef, lesson: EnLessonRecord) => void;
};

/** 英语新课随手画 — 实现见 `lesson-annotate/LessonAnnotateModal`. */
export function EnLessonAnnotateModal({ onSaved, ...rest }: Props) {
  return (
    <LessonAnnotateModal
      {...rest}
      subject="en"
      onSaved={
        onSaved
          ? (ref, lesson) => onSaved(ref as EnVocabRef, lesson as EnLessonRecord)
          : undefined
      }
    />
  );
}
