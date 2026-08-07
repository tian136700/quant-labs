"use client";

import dynamic from "next/dynamic";
import type { MutableRefObject } from "react";
import { EnLessonNextClassEditModal } from "@/components/EnLessonNextClassEditModal";
import {
  EnLessonTeacherEditModal,
  type EnLessonTeacherUpdateInput,
} from "@/components/EnLessonTeacherEditModal";
import { EnVocabRefEditModal } from "@/components/EnVocabRefEditModal";
import {
  EnLessonImportScheduleBridge,
  type EnLessonImportScheduleApi,
} from "@/components/en-lesson-page/EnLessonImportScheduleBridge";
import { EnLessonApiUploadHelp } from "@/components/en-lesson-page/EnLessonApiUploadHelp";
import { EnLessonCreateBridge } from "@/components/en-lesson-page/EnLessonCreateBridge";
import {
  EnLessonEditBridge,
  type EnLessonEditApi,
} from "@/components/en-lesson-page/EnLessonEditBridge";
import { saveEnLessonNextClassWithMeta } from "@/components/en-lesson-page/save-en-lesson-next-class";
import { persistLessonCache, refViewUrl } from "@/components/en-lesson-page/en-lesson-page-helpers";
import type { EnLessonProgressStatus } from "@/lib/en-lesson-shared";
import type {
  EnLessonClassScheduleInput,
  EnLessonNote,
  EnLessonRecord,
  EnLessonTeacher,
  EnVocabRef,
} from "@/lib/types";

const EnLessonAnnotateModal = dynamic(
  () =>
    import("@/components/EnLessonAnnotateModal").then((m) => m.EnLessonAnnotateModal),
  { ssr: false }
);

type Props = {
  locale: string;
  canOperate: boolean;
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  openEnAuth: () => void;
  lessons: EnLessonRecord[];
  setLessons: React.Dispatch<React.SetStateAction<EnLessonRecord[]>>;
  refs: Record<string, EnVocabRef>;
  notes: EnLessonNote[];
  teachers: EnLessonTeacher[];
  setTeachers: React.Dispatch<React.SetStateAction<EnLessonTeacher[]>>;
  setMobileStatusFilter: (status: EnLessonProgressStatus) => void;
  setStatus: (msg: string) => void;
  loadLessons: () => void | Promise<void>;
  editContentApiRef: MutableRefObject<EnLessonEditApi | null>;
  importScheduleApiRef: MutableRefObject<EnLessonImportScheduleApi | null>;
  editingTeacherLesson: EnLessonRecord | null;
  setEditingTeacherLesson: (lesson: EnLessonRecord | null) => void;
  savingTeacherId: number | null;
  addLessonTeacher: (name: string) => Promise<EnLessonTeacher | null>;
  deleteLessonTeacher: (teacherId: number) => Promise<boolean>;
  setLessonTeachers: (
    lessonId: number,
    teacherIds: number[],
    teacherOther: string | null,
    teacherUpdates?: EnLessonTeacherUpdateInput[],
    options?: { keepOpen?: boolean }
  ) => Promise<boolean | void>;
  editingNextClassLesson: EnLessonRecord | null;
  setEditingNextClassLesson: (lesson: EnLessonRecord | null) => void;
  savingNextClassId: number | null;
  setLessonClassSchedules: (
    lessonId: number,
    schedules: EnLessonClassScheduleInput[],
    options?: { keepOpen?: boolean }
  ) => Promise<boolean | void>;
  editingLesson: EnLessonRecord | null;
  setEditingLesson: (lesson: EnLessonRecord | null) => void;
  handleRefUpdated: (ref: EnVocabRef, lesson: EnLessonRecord) => void;
  annotatingLesson: {
    lesson: EnLessonRecord;
    ref: EnVocabRef;
    imageUrl: string;
    mediaType?: "image" | "pdf";
  } | null;
  setAnnotatingLesson: (
    value: {
      lesson: EnLessonRecord;
      ref: EnVocabRef;
      imageUrl: string;
      mediaType?: "image" | "pdf";
    } | null
  ) => void;
  handleAnnotateSaved: (ref: EnVocabRef, lesson: EnLessonRecord) => void;
  handleImportScheduleLessonSynced: (lesson: EnLessonRecord) => void;
  handleImportScheduleStatus: (message: string) => void;
  showOperateModals: boolean;
};

/** 英语新课页弹窗区（控编排页行数） */
export function EnLessonPageModals({
  locale,
  canOperate,
  createOpen,
  setCreateOpen,
  openEnAuth,
  lessons,
  setLessons,
  refs,
  notes,
  teachers,
  setTeachers,
  setMobileStatusFilter,
  setStatus,
  loadLessons,
  editContentApiRef,
  importScheduleApiRef,
  editingTeacherLesson,
  setEditingTeacherLesson,
  savingTeacherId,
  addLessonTeacher,
  deleteLessonTeacher,
  setLessonTeachers,
  editingNextClassLesson,
  setEditingNextClassLesson,
  savingNextClassId,
  setLessonClassSchedules,
  editingLesson,
  setEditingLesson,
  handleRefUpdated,
  annotatingLesson,
  setAnnotatingLesson,
  handleAnnotateSaved,
  handleImportScheduleLessonSynced,
  handleImportScheduleStatus,
  showOperateModals,
}: Props) {
  const editingRef = editingLesson?.ref_key
    ? refs[editingLesson.ref_key]
    : undefined;

  return (
    <>
      {showOperateModals ? (
        <>
          <EnLessonCreateBridge
            open={createOpen}
            locale={locale}
            onClose={() => setCreateOpen(false)}
            onNeedLogin={openEnAuth}
            onCreatedLesson={(lesson) => {
              setLessons((prev) => {
                const next = [lesson, ...prev.filter((l) => l.id !== lesson.id)];
                persistLessonCache(next, refs, notes, teachers);
                return next;
              });
            }}
            setMobileStatusFilter={setMobileStatusFilter}
            setStatus={setStatus}
            loadLessons={loadLessons}
          />

          <EnLessonEditBridge
            locale={locale}
            apiRef={editContentApiRef}
            onNeedLogin={openEnAuth}
            onUpdated={(lesson) => {
              setLessons((prev) => {
                const next = prev.map((item) =>
                  item.id === lesson.id ? { ...item, ...lesson } : item
                );
                persistLessonCache(next, refs, notes, teachers);
                return next;
              });
              setStatus(`已更新新课 #${lesson.id}`);
              window.setTimeout(() => setStatus(""), 2500);
            }}
          />

          <EnLessonTeacherEditModal
            open={editingTeacherLesson != null}
            lesson={editingTeacherLesson}
            teachers={teachers}
            saving={savingTeacherId === editingTeacherLesson?.id}
            onClose={() => setEditingTeacherLesson(null)}
            onAddTeacher={addLessonTeacher}
            onDeleteTeacher={deleteLessonTeacher}
            onSave={(teacherIds, teacherOther, teacherUpdates, options) => {
              if (editingTeacherLesson) {
                return setLessonTeachers(
                  editingTeacherLesson.id,
                  teacherIds,
                  teacherOther,
                  teacherUpdates,
                  options
                );
              }
            }}
          />

          <EnLessonNextClassEditModal
            open={editingNextClassLesson != null}
            lesson={editingNextClassLesson}
            teachers={teachers}
            saving={
              savingNextClassId === editingNextClassLesson?.id ||
              savingTeacherId === editingNextClassLesson?.id
            }
            onClose={() => setEditingNextClassLesson(null)}
            onAddTeacher={addLessonTeacher}
            onSave={(schedules, meta) => {
              if (!editingNextClassLesson) return;
              void saveEnLessonNextClassWithMeta({
                lessonId: editingNextClassLesson.id,
                schedules,
                meta,
                onTeacherUpdated: (teacher) => {
                  setTeachers((prev) => {
                    const next = prev.map((t) =>
                      t.id === teacher.id ? teacher : t
                    );
                    persistLessonCache(lessons, refs, notes, next);
                    return next;
                  });
                },
                setLessonTeachers,
                setLessonClassSchedules,
              });
            }}
          />

          <EnVocabRefEditModal
            open={editingLesson != null}
            lessonId={editingLesson?.id ?? null}
            refKey={editingLesson?.ref_key ?? null}
            refMeta={editingRef}
            locale={locale}
            canEdit={canOperate}
            onClose={() => setEditingLesson(null)}
            onUpdated={handleRefUpdated}
            onNeedAuth={openEnAuth}
          />

          <EnLessonAnnotateModal
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
            onNeedAuth={openEnAuth}
          />

          <EnLessonApiUploadHelp />
        </>
      ) : null}

      <EnLessonImportScheduleBridge
        locale={locale}
        teachers={teachers}
        canOperate={canOperate}
        apiRef={importScheduleApiRef}
        onLessonSynced={handleImportScheduleLessonSynced}
        onStatus={handleImportScheduleStatus}
      />
    </>
  );
}
