"use client";

import { EnLessonNextClassEditModal } from "@/components/EnLessonNextClassEditModal";
import { JpLessonManualScheduleLinkFromDetailModal } from "@/components/JpLessonManualScheduleLinkFromDetailModal";
import { JpLessonManualScheduleModal } from "@/components/JpLessonManualScheduleModal";
import { JpLessonNextClassEditModal } from "@/components/JpLessonNextClassEditModal";
import type { JpLessonManualSchedule } from "@/lib/jp-lesson-manual-schedule";
import type { ManualScheduleLessonOption } from "@/lib/jp-lesson-manual-schedule-linked";
import type {
  EnLessonRecord,
  EnLessonTeacher,
  JpLessonRecord,
  JpLessonTeacher,
  KoLessonTeacher,
} from "@/lib/types";

export type JpLessonScheduleModalsProps = {
  manualModalOpen: boolean;
  selectedDate: string;
  editingManual: JpLessonManualSchedule | null;
  manualModalMode: "full" | "time";
  teachers: JpLessonTeacher[];
  enTeachers: EnLessonTeacher[];
  koTeachers: KoLessonTeacher[];
  jpLessons: JpLessonRecord[];
  enLessons: EnLessonRecord[];
  savingManualSchedule: boolean;
  closeManualModal: () => void;
  handleSaveManualSchedule: (...args: any[]) => void;
  linkLessonPickOpen: boolean;
  selectedManualSchedule: JpLessonManualSchedule | null;
  linkingManualLesson: boolean;
  linkLessonProgressPercent: number | null;
  closeLinkLessonPick: () => void;
  handleLinkLessonFromDetail: (option: ManualScheduleLessonOption) => void | Promise<void>;
  addLessonTeacher: (...args: any[]) => any;
  addEnLessonTeacher: (...args: any[]) => any;
  addKoLessonTeacher: (...args: any[]) => any;
  editingNextClassLesson: JpLessonRecord | null;
  editingEnNextClassLesson: EnLessonRecord | null;
  savingNextClassId: number | null;
  setEditingNextClassLesson: (v: JpLessonRecord | null) => void;
  setEditingEnNextClassLesson: (v: EnLessonRecord | null) => void;
  setLessonClassSchedules: (id: number, schedules: any[]) => void;
  setEnLessonClassSchedules: (id: number, schedules: any[]) => void;
};

export function JpLessonScheduleModals(props: JpLessonScheduleModalsProps) {
  const {
    manualModalOpen,
    selectedDate,
    editingManual,
    manualModalMode,
    teachers,
    enTeachers,
    koTeachers,
    jpLessons,
    enLessons,
    savingManualSchedule,
    closeManualModal,
    handleSaveManualSchedule,
    linkLessonPickOpen,
    selectedManualSchedule,
    linkingManualLesson,
    linkLessonProgressPercent,
    closeLinkLessonPick,
    handleLinkLessonFromDetail,
    addLessonTeacher,
    addEnLessonTeacher,
    addKoLessonTeacher,
    editingNextClassLesson,
    editingEnNextClassLesson,
    savingNextClassId,
    setEditingNextClassLesson,
    setEditingEnNextClassLesson,
    setLessonClassSchedules,
    setEnLessonClassSchedules,
  } = props;
  return (
    <>
      <JpLessonManualScheduleModal
        open={manualModalOpen}
        initialDate={selectedDate}
        editing={editingManual}
        mode={manualModalMode}
        jpTeachers={teachers}
        enTeachers={enTeachers}
        koTeachers={koTeachers}
        jpLessons={jpLessons}
        enLessons={enLessons}
        onAddJpTeacher={addLessonTeacher}
        onAddEnTeacher={addEnLessonTeacher}
        onAddKoTeacher={addKoLessonTeacher}
        saving={savingManualSchedule}
        onClose={closeManualModal}
        onSave={handleSaveManualSchedule}
      />

      <JpLessonManualScheduleLinkFromDetailModal
        open={linkLessonPickOpen}
        manual={selectedManualSchedule}
        jpLessons={jpLessons}
        enLessons={enLessons}
        jpTeachers={teachers}
        enTeachers={enTeachers}
        syncing={linkingManualLesson}
        progressPercent={linkLessonProgressPercent}
        onClose={closeLinkLessonPick}
        onPick={handleLinkLessonFromDetail}
      />

      <JpLessonNextClassEditModal
        open={editingNextClassLesson != null}
        lesson={editingNextClassLesson}
        saving={savingNextClassId === editingNextClassLesson?.id}
        onClose={() => setEditingNextClassLesson(null)}
        onSave={(schedules) => {
          if (editingNextClassLesson) {
            void setLessonClassSchedules(editingNextClassLesson.id, schedules);
          }
        }}
      />

      <EnLessonNextClassEditModal
        open={editingEnNextClassLesson != null}
        lesson={editingEnNextClassLesson}
        saving={savingNextClassId === editingEnNextClassLesson?.id}
        onClose={() => setEditingEnNextClassLesson(null)}
        onSave={(schedules) => {
          if (editingEnNextClassLesson) {
            void setEnLessonClassSchedules(editingEnNextClassLesson.id, schedules);
          }
        }}
      />
    </>
  );
}
