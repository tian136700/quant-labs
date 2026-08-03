"use client";

import dynamic from "next/dynamic";
import { JpLessonAiPlanPromptModal } from "@/components/JpLessonAiPlanPromptModal";
import { JpLessonBatchScheduleTeacherModal } from "@/components/JpLessonBatchScheduleTeacherModal";
import { JpLessonContentEditModal } from "@/components/JpLessonContentEditModal";
import { JpLessonExamplesViewModal, type JpLessonExamplesViewTarget } from "@/components/JpLessonExamplesViewModal";
import { JpLessonNextClassEditModal } from "@/components/JpLessonNextClassEditModal";
import { JpLessonTeacherEditModal } from "@/components/JpLessonTeacherEditModal";
import { JpLessonWordsViewModal } from "@/components/JpLessonWordsViewModal";
import { JpVocabRefEditModal } from "@/components/JpVocabRefEditModal";
import type { Locale } from "@/i18n/messages";
import type { JpLessonProgressStatus } from "@/lib/jp-lesson-shared";
import type { JpLessonClassScheduleInput, JpLessonRecord, JpLessonTeacher, JpVocabRef } from "@/lib/types";
import { refViewUrl } from "@/components/jp-lesson-page/jp-lesson-page-helpers";
import type { JpLessonCompleteContentItemsResult } from "@/components/jp-lesson-page/completeJpLessonContentItems";

/** 含 pdfjs/jspdf：禁止打进 Worker，仅客户端懒加载 */
const JpLessonAnnotateModal = dynamic(
  () =>
    import("@/components/JpLessonAnnotateModal").then((m) => m.JpLessonAnnotateModal),
  { ssr: false }
);

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
  aiPlanModalOpen: boolean;
  aiPlanLessons: JpLessonRecord[];
  editingLesson: JpLessonRecord | null;
  editingRef: JpVocabRef | undefined;
  editingContentLesson: JpLessonRecord | null;
  savingContentId: number | null;
  viewingWordsLesson: JpLessonRecord | null;
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
  setEditingContentLesson: (v: JpLessonRecord | null) => void;
  setViewingWordsLesson: (v: JpLessonRecord | null) => void;
  saveLessonContentMeanings: (
    lessonId: number,
    content: string,
    meanings: string | null
  ) => void | Promise<void>;
  completeLessonContentItems: (
    lessonId: number,
    itemIndexes: number[]
  ) =>
    | void
    | Promise<void>
    | Promise<JpLessonCompleteContentItemsResult>;
  handleRefUpdated: (...args: any[]) => void;
  openJpAuth: () => void;
  setAnnotatingLesson: (v: JpLessonPageModalsProps["annotatingLesson"]) => void;
  handleAnnotateSaved: (...args: any[]) => void;
  setViewingExamples: (v: JpLessonExamplesViewTarget | null) => void;
  setAiPlanModalOpen: (open: boolean) => void;
  handleAiPlanAttached: (payload: {
    lessons: JpLessonRecord[];
    refs: Record<string, JpVocabRef>;
  }) => void;
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
    aiPlanModalOpen,
    aiPlanLessons,
    teachers,
    editingLesson,
    editingRef,
    editingContentLesson,
    savingContentId,
    viewingWordsLesson,
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
    setEditingContentLesson,
    setViewingWordsLesson,
    saveLessonContentMeanings,
    completeLessonContentItems,
    handleRefUpdated,
    openJpAuth,
    setAnnotatingLesson,
    handleAnnotateSaved,
    setViewingExamples,
    setAiPlanModalOpen,
    handleAiPlanAttached,
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
        saving={
          savingNextClassId === editingNextClassLesson?.id ||
          savingTeacherLessonId === editingNextClassLesson?.id
        }
        onClose={() => setEditingNextClassLesson(null)}
        onSave={(schedules) => {
          if (!editingNextClassLesson) return;
          void setLessonClassSchedules(editingNextClassLesson.id, schedules);
        }}
        onEditTeachers={() => {
          if (!editingNextClassLesson) return;
          const lesson = editingNextClassLesson;
          setEditingNextClassLesson(null);
          openTeacherEditModal(lesson);
        }}
      />

      <JpLessonContentEditModal
        open={editingContentLesson != null}
        lesson={editingContentLesson}
        saving={savingContentId === editingContentLesson?.id}
        onClose={() => setEditingContentLesson(null)}
        onSave={(content, meanings) => {
          if (!editingContentLesson) return;
          void saveLessonContentMeanings(
            editingContentLesson.id,
            content,
            meanings
          );
        }}
        onCompleteItems={
          canOperate
            ? (itemIndexes) => {
                if (!editingContentLesson) {
                  return Promise.resolve({
                    ok: false as const,
                    error: "课程已关闭，请重新打开后再标完成",
                  });
                }
                return completeLessonContentItems(
                  editingContentLesson.id,
                  itemIndexes
                );
              }
            : undefined
        }
      />

      <JpLessonWordsViewModal
        open={viewingWordsLesson != null}
        lesson={viewingWordsLesson}
        onClose={() => setViewingWordsLesson(null)}
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

      <JpLessonAiPlanPromptModal
        open={aiPlanModalOpen}
        lessons={aiPlanLessons}
        onClose={() => setAiPlanModalOpen(false)}
        onAttached={handleAiPlanAttached}
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
        viewUrl={
          annotatingLesson?.lesson.ref_key
            ? refViewUrl(
                annotatingLesson.lesson.ref_key,
                annotatingLesson.ref.updated_at
              )
            : ""
        }
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
