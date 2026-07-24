"use client";

import { EnLessonTeacherReviewModal } from "@/components/EnLessonTeacherReviewModal";
import { JpLessonTeacherReviewModal } from "@/components/JpLessonTeacherReviewModal";
import type { Locale } from "@/i18n/messages";
import type { LessonTeacherSubject } from "@/lib/locale-path";
import { teacherReviewApiBase } from "@/lib/lesson-teacher-subject";
import type { JpLessonTeacher } from "@/lib/types";

export type AdminJpLessonTeachersReviewModalsProps = {
  teacherSubject: LessonTeacherSubject;
  reviewTeacher: JpLessonTeacher | null;
  locale: Locale;
  onClose: () => void;
  onChanged: () => void;
};

export function AdminJpLessonTeachersReviewModals({
  teacherSubject,
  reviewTeacher,
  locale,
  onClose,
  onChanged,
}: AdminJpLessonTeachersReviewModalsProps) {
  if (teacherSubject !== "jp") {
    return (
      <EnLessonTeacherReviewModal
        open={reviewTeacher != null}
        teacher={reviewTeacher}
        locale={locale}
        reviewApiBase={teacherReviewApiBase(teacherSubject)}
        onClose={onClose}
        onChanged={onChanged}
      />
    );
  }

  return (
    <JpLessonTeacherReviewModal
      open={reviewTeacher != null}
      teacher={reviewTeacher}
      locale={locale}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
