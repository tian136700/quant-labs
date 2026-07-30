"use client";

import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import type { JpLessonCoursePair } from "@/lib/jp-lesson-course-pair";

export type JpLessonCourseMergeBusy = {
  courseGroupId: string;
  percent: number;
  label: string;
} | null;

type Props = {
  courseLabel: string;
  pair?: JpLessonCoursePair | null;
  canMerge: boolean;
  mergeBusy: JpLessonCourseMergeBusy;
  onCopyCourseMerge?: (pair: JpLessonCoursePair) => void;
  /** 手机卡片内嵌样式 */
  mobile?: boolean;
};

export function JpLessonCourseMergeCell({
  courseLabel,
  pair = null,
  canMerge,
  mergeBusy,
  onCopyCourseMerge,
  mobile = false,
}: Props) {
  const busyForThis =
    pair && mergeBusy?.courseGroupId === pair.courseGroupId ? mergeBusy : null;
  const showMerge =
    Boolean(pair && canMerge && onCopyCourseMerge) && !busyForThis;

  return (
    <div
      className={
        mobile
          ? "jp-lesson-course-merge jp-lesson-course-merge--mobile"
          : "jp-lesson-course-merge"
      }
    >
      <span
        className={`jp-lesson-course-label${
          mobile ? " jp-lesson-mobile-course-label" : ""
        }`}
        title={
          pair
            ? `同一课 ${courseLabel}`
            : courseLabel
        }
      >
        {courseLabel}
      </span>
      {showMerge ? (
        <button
          type="button"
          className="jp-lesson-course-merge-btn"
          onClick={() => onCopyCourseMerge?.(pair!)}
        >
          复制整课
        </button>
      ) : null}
      {busyForThis ? (
        <JpVocabSaveProgressBar
          label={busyForThis.label}
          percent={busyForThis.percent}
          fullWidth
        />
      ) : null}
    </div>
  );
}
