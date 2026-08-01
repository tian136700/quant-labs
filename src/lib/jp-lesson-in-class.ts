/**
 * 「上课中」判定：按预约上课时间窗口，不依赖「学习中」进度门禁。
 * 日程关联教材写了 class_schedules 后，整节课内都应在「上课中」Tab 找得到教案。
 */

import {
  getLessonClassSchedules,
  parseBeijingDateTime,
  resolveClassDurationMinutes,
} from "@/lib/jp-lesson-shared";

/**
 * 「上课中」提前进入窗口：开课前这么多分钟即可进 Tab（方便找教案）。
 * 例：10:00 开课、时长 55 → 09:50～10:55 都算上课中。
 */
export const JP_LESSON_IN_CLASS_MARK_WINDOW_MINUTES = 10;

export type JpLessonInClassLesson = {
  id?: number;
  class_schedules?: Array<{
    id: number;
    class_at: string;
    duration_minutes: number | null;
  }>;
  next_class_at?: string | null;
  class_duration_minutes?: number | null;
};

/**
 * 「上课中」：北京时间 now 落在
 * [开课前 N 分钟, 本节课结束)（N=`JP_LESSON_IN_CLASS_MARK_WINDOW_MINUTES`）即算。
 * 整节课进行中都要能看到教案；勿再缩成开课后仅 N 分钟。
 * **不**走 `buildJpLessonScheduleEvents`（那会要求学习中/已完成）——
 * 日程侧写入的上课时间即使进度尚未标「学习中」，也应能在上课中 Tab 显示。
 * 不限定老师。
 */
export function isJpLessonCurrentlyInClass(
  lesson: JpLessonInClassLesson,
  now: Date = new Date()
): boolean {
  const t = now.getTime();
  const earlyMs = JP_LESSON_IN_CLASS_MARK_WINDOW_MINUTES * 60_000;
  for (const schedule of getLessonClassSchedules(lesson)) {
    const start = parseBeijingDateTime(schedule.class_at);
    if (!start) continue;
    const durationMinutes = resolveClassDurationMinutes(schedule.duration_minutes);
    const startMs = start.getTime();
    const endMs = startMs + durationMinutes * 60_000;
    if (startMs - earlyMs <= t && t < endMs) return true;
  }
  return false;
}
