"use client";

import { EnLessonCreateModal } from "@/components/en-lesson-page/EnLessonCreateModal";
import type { EnLessonProgressStatus } from "@/lib/en-lesson-shared";
import type { EnLessonRecord } from "@/lib/types";

type Props = {
  open: boolean;
  locale: string;
  onClose: () => void;
  onNeedLogin: () => void;
  onCreatedLesson: (lesson: EnLessonRecord) => void;
  setMobileStatusFilter: (status: EnLessonProgressStatus) => void;
  setStatus: (msg: string) => void;
  loadLessons: () => void | Promise<void>;
};

/** 新增弹窗接线（控编排页行数） */
export function EnLessonCreateBridge({
  open,
  locale,
  onClose,
  onNeedLogin,
  onCreatedLesson,
  setMobileStatusFilter,
  setStatus,
  loadLessons,
}: Props) {
  return (
    <EnLessonCreateModal
      open={open}
      locale={locale}
      onClose={onClose}
      onNeedLogin={onNeedLogin}
      onCreated={(lesson) => {
        onCreatedLesson(lesson);
        setMobileStatusFilter("pending");
        setStatus(`已新增新课 #${lesson.id}`);
        window.setTimeout(() => setStatus(""), 2500);
        void loadLessons();
      }}
    />
  );
}
