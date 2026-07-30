"use client";

import { JpLessonAnnotateModal } from "@/components/JpLessonAnnotateModal";
import { JpLessonBatchScheduleTeacherModal } from "@/components/JpLessonBatchScheduleTeacherModal";
import { JpLessonExamplesViewModal, type JpLessonExamplesViewTarget } from "@/components/JpLessonExamplesViewModal";
import { JpLessonNextClassEditModal } from "@/components/JpLessonNextClassEditModal";
import { JpLessonTeacherEditModal } from "@/components/JpLessonTeacherEditModal";
import { JpVocabRefEditModal } from "@/components/JpVocabRefEditModal";
import type { Locale } from "@/i18n/messages";
import type { JpLessonProgressStatus } from "@/lib/jp-lesson-shared";
import type { JpLessonClassScheduleInput, JpLessonRecord, JpLessonTeacher, JpVocabRef } from "@/lib/types";

export type JpLessonPageModalsProps = {
  locale: Locale;
  canOperate: boolean;
  isAdmin: boolean;
  teachers: JpLessonTeacher[];
  editingTeacherLesson: JpLessonRecord | null;
  editingTeacherLessonIds: number[];
  savingTeacherLessonId: number | null;
  editingNextClassLesson: JpLessonRecord | null;
  savingNextClassId: number | null;
  batchModalOpen: boolean;
  batchLessonIds: number[];
  batchSaving: boolean;
  editingLesson: JpLessonRecord | null;
  editingRef: JpVocabRef | undefined;
  annotatingLesson: {
    lesson: JpLessonRecord;
    ref: JpVocabRef;
    imageUrl: string;
    mediaType?: "image" | "pdf";
  } | null;
  viewingExamples: JpLessonExamplesViewTarget | null;
  setEditingTeacherLesson: (v: JpLessonRecord | null) => void;
  setEditingTeacherLessonIds: (ids: number[]) => void;
  addLessonTeacher: (...args: any[]) => any;
  updateLessonTeacher: (...args: any[]) => any;
  deleteLessonTeacher: (...args: any[]) => any;
  setLessonTeachersForMany: (...args: any[]) => any;
  setEditingNextClassLesson: (v: JpLessonRecord | null) => void;
  setLessonClassSchedules: (...args: any[]) => any;
  openTeacherEditModal: (lesson: JpLessonRecord) => void;
  setBatchModalOpen: (open: boolean) => void;
  setBatchClassSchedulesAndTeachers: (...args: any[]) => any;
  setEditingLesson: (v: JpLessonRecord | null) => void;
  handleRefUpdated: (...args: any[]) => void;
  openJpAuth: () => void;
  setAnnotatingLesson: (v: JpLessonPageModalsProps["annotatingLesson"]) => void;
  handleAnnotateSaved: (...args: any[]) => void;
  setViewingExamples: (v: JpLessonExamplesViewTarget | null) => void;
};

export function JpLessonPageModals(props: JpLessonPageModalsProps) {
  const {
    locale,
    canOperate,
    editingTeacherLesson,
    editingTeacherLessonIds,
    savingTeacherLessonId,
    editingNextClassLesson,
    savingNextClassId,
    batchModalOpen,
    batchLessonIds,
    batchSaving,
    teachers,
    editingLesson,
    editingRef,
    annotatingLesson,
    viewingExamples,
    setEditingTeacherLesson,
    setEditingTeacherLessonIds,
    addLessonTeacher,
    updateLessonTeacher,
    deleteLessonTeacher,
    setLessonTeachersForMany,
    setEditingNextClassLesson,
    setLessonClassSchedules,
    openTeacherEditModal,
    setBatchModalOpen,
    setBatchClassSchedulesAndTeachers,
    setEditingLesson,
    handleRefUpdated,
    openJpAuth,
    setAnnotatingLesson,
    handleAnnotateSaved,
    setViewingExamples,
  } = props;

  return (
    <>
<JpLessonTeacherEditModal
        open={editingTeacherLesson != null}
        lesson={editingTeacherLesson}
        teachers={teachers}
        saving={savingTeacherLessonId === editingTeacherLesson?.id}
        onClose={() => {
          setEditingTeacherLesson(null);
          setEditingTeacherLessonIds([]);
        }}
        onAddTeacher={addLessonTeacher}
        onUpdateTeacher={updateLessonTeacher}
        onDeleteTeacher={deleteLessonTeacher}
        onSave={async (teacherIds, teacherOther, teacherUpdates, options) => {
          if (editingTeacherLesson) {
            await setLessonTeachersForMany(
              editingTeacherLessonIds.length
                ? editingTeacherLessonIds
                : [editingTeacherLesson.id],
              teacherIds,
              teacherOther,
              teacherUpdates,
              options
            );
          }
        }}
      />

      <JpLessonNextClassEditModal
        open={editingNextClassLesson != null}
        lesson={editingNextClassLesson}
        teachers={teachers}
        saving={savingNextClassId === editingNextClassLesson?.id}
        onClose={() => setEditingNextClassLesson(null)}
        onSave={(schedules) => {
          if (editingNextClassLesson) {
            void setLessonClassSchedules(editingNextClassLesson.id, schedules);
          }
        }}
        onEditTeachers={() => {
          if (!editingNextClassLesson) return;
          const lesson = editingNextClassLesson;
          setEditingNextClassLesson(null);
          openTeacherEditModal(lesson);
        }}
      />

      <JpLessonBatchScheduleTeacherModal
        open={batchModalOpen}
        lessonCount={batchLessonIds.length}
        teachers={teachers}
        saving={batchSaving}
        onClose={() => {
          if (!batchSaving) setBatchModalOpen(false);
        }}
        onSave={(schedules, teacherIds, teacherOther, progressStatus) => {
          void setBatchClassSchedulesAndTeachers(
            schedules,
            teacherIds,
            teacherOther,
            progressStatus
          );
        }}
      />

      <JpVocabRefEditModal
        open={editingLesson != null}
        lessonId={editingLesson?.id ?? null}
        refKey={editingLesson?.ref_key ?? null}
        refMeta={editingRef}
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingLesson(null)}
        onUpdated={handleRefUpdated}
        onNeedAuth={openJpAuth}
      />

      <JpLessonAnnotateModal
        open={annotatingLesson != null}
        imageUrl={annotatingLesson?.imageUrl ?? ""}
        mediaType={
          annotatingLesson?.mediaType ??
          (annotatingLesson?.ref.media_type === "pdf" ? "pdf" : "image")
        }
        refKey={annotatingLesson?.lesson.ref_key ?? ""}
        lessonId={annotatingLesson?.lesson.id ?? 0}
        lessonContent={annotatingLesson?.lesson.content ?? ""}
        locale={locale}
        canSave={canOperate}
        onClose={() => setAnnotatingLesson(null)}
        onSaved={handleAnnotateSaved}
        onNeedAuth={openJpAuth}
      />

      <JpLessonExamplesViewModal
        open={viewingExamples != null}
        target={viewingExamples}
        onClose={() => setViewingExamples(null)}
      />
    </>
  );
}
