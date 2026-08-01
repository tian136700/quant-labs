import type { EnLessonNextClassSaveMeta } from "@/components/EnLessonNextClassEditModal";
import type { EnLessonTeacherUpdateInput } from "@/components/EnLessonTeacherEditModal";
import type { EnLessonClassScheduleInput, EnLessonTeacher } from "@/lib/types";

/**
 * 设置上课时间保存：可选补写会议号 → 绑老师 → 写预约。
 * 抽到页外，避免 EnLessonPage 超 1000 行。
 */
export async function saveEnLessonNextClassWithMeta(options: {
  lessonId: number;
  schedules: EnLessonClassScheduleInput[];
  meta?: EnLessonNextClassSaveMeta;
  onTeacherUpdated?: (teacher: EnLessonTeacher) => void;
  setLessonTeachers: (
    lessonId: number,
    teacherIds: number[],
    teacherOther: string | null,
    teacherUpdates?: EnLessonTeacherUpdateInput[],
    options?: { keepOpen?: boolean }
  ) => Promise<void>;
  setLessonClassSchedules: (
    lessonId: number,
    schedules: EnLessonClassScheduleInput[]
  ) => void | Promise<void>;
}): Promise<void> {
  const {
    lessonId,
    schedules,
    meta,
    onTeacherUpdated,
    setLessonTeachers,
    setLessonClassSchedules,
  } = options;

  if (meta?.teacherMeetingPatch) {
    try {
      const res = await fetch("/api/admin/en-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: meta.teacherMeetingPatch.teacherId,
          tencent_meeting_id: meta.teacherMeetingPatch.meetingId,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teacher?: EnLessonTeacher;
      };
      if (data.ok && data.teacher) {
        onTeacherUpdated?.(data.teacher);
      }
    } catch {
      /* 会议号补写失败不阻断时间保存 */
    }
  }

  if (meta?.teacherIds?.length) {
    try {
      await setLessonTeachers(lessonId, meta.teacherIds, null, [], {
        keepOpen: true,
      });
    } catch {
      return;
    }
  }

  void setLessonClassSchedules(lessonId, schedules);
}
