"use client";

import { CopyToast } from "@/components/CopyToast";
import { EnLessonNextClassEditModal } from "@/components/EnLessonNextClassEditModal";
import { JpLessonManualScheduleModal } from "@/components/JpLessonManualScheduleModal";
import { JpLessonNextClassEditModal } from "@/components/JpLessonNextClassEditModal";
import type { Locale } from "@/i18n/messages";
import type { JpLessonManualSchedule } from "@/lib/jp-lesson-manual-schedule";
import type { EnLessonRecord, EnLessonTeacher, JpLessonRecord, JpLessonTeacher, KoLessonTeacher } from "@/lib/types";

export type JpLessonScheduleModalsProps = {
  manualModalOpen: boolean;
  selectedDate: string;
  editingManual: JpLessonManualSchedule | null;
  manualModalMode: "full" | "time";
  teachers: JpLessonTeacher[];
  enTeachers: EnLessonTeacher[];
  koTeachers: KoLessonTeacher[];
  savingManualSchedule: boolean;
  closeManualModal: () => void;
  handleSaveManualSchedule: (...args: any[]) => void;
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
    manualModalOpen, selectedDate, editingManual, manualModalMode, teachers, enTeachers, koTeachers,
    savingManualSchedule, closeManualModal, handleSaveManualSchedule, addLessonTeacher, addEnLessonTeacher,
    addKoLessonTeacher, editingNextClassLesson, editingEnNextClassLesson, savingNextClassId,
    setEditingNextClassLesson, setEditingEnNextClassLesson, setLessonClassSchedules, setEnLessonClassSchedules,
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
        onAddJpTeacher={addLessonTeacher}
        onAddEnTeacher={addEnLessonTeacher}
        onAddKoTeacher={addKoLessonTeacher}
        saving={savingManualSchedule}
        onClose={closeManualModal}
        onSave={handleSaveManualSchedule}
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
