import "server-only";

import {
  parseBeijingDateTime,
  resolveClassDurationMinutes,
} from "@/lib/jp-lesson-shared";
import { enableLinkedTeacherUsersForTeacherIds } from "@/lib/teacher-user-schedule-enable-internal";
import {
  TEACHER_LESSON_LEARNING_AUTO_ENABLE_WITHIN_MS,
  type TeacherUserEnableHit,
  type TeacherUserEnableSkip,
  type TeacherUserLearningLessonEnableResult,
} from "@/lib/teacher-user-schedule-enable-types";

/**
 * 手动日程保存后：若开课在 18h 内或课正在进行 → 立刻启用关联登录账号。
 * （补上「05:00 已过 / 开课前 2h 尚未到」时加日程却不开号的缺口）
 */
export async function maybeEnableTeacherUsersForManualSchedule(
  db: D1Database,
  schedule: {
    class_at: string;
    duration_minutes?: number | null;
    teacher: string;
  },
  options: { dryRun?: boolean; now?: Date; withinMs?: number } = {}
): Promise<TeacherUserLearningLessonEnableResult> {
  const dryRun = Boolean(options.dryRun);
  const withinMs =
    options.withinMs ?? TEACHER_LESSON_LEARNING_AUTO_ENABLE_WITHIN_MS;
  const now = options.now ?? new Date();
  const teacherName = String(schedule.teacher ?? "").trim();
  if (!teacherName) {
    return {
      triggered: false,
      reason: "no_teacher",
      dry_run: dryRun,
      within_ms: withinMs,
      enabled: [],
      skipped: [],
    };
  }

  const start = parseBeijingDateTime(String(schedule.class_at ?? "").trim());
  if (!start) {
    return {
      triggered: false,
      reason: "class_at_invalid",
      dry_run: dryRun,
      within_ms: withinMs,
      enabled: [],
      skipped: [],
    };
  }

  const durationMin = resolveClassDurationMinutes(
    schedule.duration_minutes != null ? Number(schedule.duration_minutes) : null
  );
  const startMs = start.getTime();
  const endMs = startMs + durationMin * 60_000;
  const nowMs = now.getTime();
  const upcoming = startMs >= nowMs && startMs <= nowMs + withinMs;
  const ongoing = nowMs >= startMs && nowMs <= endMs;
  if (!upcoming && !ongoing) {
    return {
      triggered: false,
      reason: "class_not_within_window",
      dry_run: dryRun,
      within_ms: withinMs,
      enabled: [],
      skipped: [],
    };
  }

  const teacherIds = await listJpTeacherIdsByName(db, teacherName);
  if (!teacherIds.length) {
    return {
      triggered: false,
      reason: "teacher_not_found",
      dry_run: dryRun,
      within_ms: withinMs,
      enabled: [],
      skipped: [],
    };
  }

  const { enabled, skipped } = await enableLinkedTeacherUsersForTeacherIds(
    db,
    teacherIds,
    { dryRun, subject: "jp" }
  );

  return {
    triggered: true,
    dry_run: dryRun,
    within_ms: withinMs,
    enabled,
    skipped,
  };
}

async function listJpTeacherIdsByName(
  db: D1Database,
  teacherName: string
): Promise<number[]> {
  const result = await db
    .prepare(
      `SELECT id FROM jp_lesson_teacher
       WHERE lower(trim(name)) = lower(trim(?1))`
    )
    .bind(teacherName)
    .all<{ id: number }>();
  const ids: number[] = [];
  for (const row of result.results ?? []) {
    const id = Number(row.id);
    if (Number.isInteger(id) && id > 0) ids.push(id);
  }
  return ids;
}

export type { TeacherUserEnableHit, TeacherUserEnableSkip };
