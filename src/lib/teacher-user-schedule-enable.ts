import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { findUserById, listJpLessonTeacherNameMapByUserId } from "@/lib/etr-auth-db";
import type { EtrUser } from "@/lib/etr-auth";
import {
  getJpLessonProgressStatus,
  parseBeijingDateTime,
} from "@/lib/jp-lesson-shared";
import type { JpLessonRecord } from "@/lib/types";

/** 不受课表自动启用控制的账号（仅管理员手动开关） */
export const TEACHER_SCHEDULE_AUTO_ENABLE_EXCLUDED_USERNAMES = [
  "user1",
  "test",
] as const;

/**
 * 日语新课设为「学习中」且开课时间在此时长内 → 立即启用关联老师账号。
 * 与每日 05:00「今日有课」启用互补（补上排课晚于 05:00、或开课前不足一天的场景）。
 */
export const TEACHER_LESSON_LEARNING_AUTO_ENABLE_WITHIN_MS =
  18 * 60 * 60 * 1000;

export function isExcludedFromTeacherScheduleAutoEnable(
  user: Pick<EtrUser, "role" | "username">
): boolean {
  if (user.role === "admin") return true;
  const lower = user.username.trim().toLowerCase();
  return TEACHER_SCHEDULE_AUTO_ENABLE_EXCLUDED_USERNAMES.some(
    (name) => lower === name
  );
}

export type TeacherUserEnableSkip = {
  user_id: number;
  username: string;
  teacher_id: number;
  reason: string;
};

export type TeacherUserEnableHit = {
  user_id: number;
  username: string;
  teacher_id: number;
};

export type TeacherUserScheduleEnableResult = {
  date: string;
  dry_run: boolean;
  teachers_with_class: number[];
  enabled: TeacherUserEnableHit[];
  skipped: TeacherUserEnableSkip[];
};

export type TeacherUserLearningLessonEnableResult = {
  triggered: boolean;
  reason?: string;
  dry_run: boolean;
  within_ms: number;
  enabled: TeacherUserEnableHit[];
  skipped: TeacherUserEnableSkip[];
};

async function listTeacherIdsWithClassOnDate(
  db: D1Database,
  dateStr: string
): Promise<number[]> {
  const datePrefix = `${dateStr}%`;
  // 仅日语新课排课 + 手动日程。英语老师不提供系统登录账号，不纳入自动启用。
  const result = await db
    .prepare(
      `SELECT DISTINCT teacher_id FROM (
         SELECT tl.teacher_id AS teacher_id
         FROM jp_lesson_teacher_link tl
         INNER JOIN jp_lesson_class_schedule cs ON cs.lesson_id = tl.lesson_id
         WHERE cs.class_at LIKE ?1
         UNION
         SELECT jt.id AS teacher_id
         FROM jp_lesson_teacher jt
         INNER JOIN jp_lesson_manual_schedule ms
           ON lower(trim(ms.teacher)) = lower(trim(jt.name))
         WHERE ms.class_at LIKE ?1
       )`
    )
    .bind(datePrefix)
    .all<{ teacher_id: number }>();

  const ids = new Set<number>();
  for (const row of result.results ?? []) {
    const teacherId = Number(row.teacher_id);
    if (Number.isInteger(teacherId) && teacherId > 0) ids.add(teacherId);
  }
  return [...ids].sort((a, b) => a - b);
}

type LinkedTeacherUser = {
  user_id: number;
  username: string;
  role: string;
  disabled: number;
  teacher_id: number;
};

async function listLinkedTeacherUsersForTeacherIds(
  db: D1Database,
  teacherIds: number[]
): Promise<LinkedTeacherUser[]> {
  if (!teacherIds.length) return [];
  await listJpLessonTeacherNameMapByUserId(db);
  const placeholders = teacherIds.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(
      `SELECT link.user_id AS user_id, u.username AS username, u.role AS role,
              COALESCE(u.disabled, 0) AS disabled, link.teacher_id AS teacher_id
       FROM etr_user_jp_lesson_teacher_link link
       INNER JOIN etr_users u ON u.id = link.user_id
       WHERE link.teacher_id IN (${placeholders})`
    )
    .bind(...teacherIds)
    .all<LinkedTeacherUser>();
  return result.results ?? [];
}

async function enableLinkedTeacherUsers(
  db: D1Database,
  teacherIds: number[],
  options: { dryRun?: boolean } = {}
): Promise<{ enabled: TeacherUserEnableHit[]; skipped: TeacherUserEnableSkip[] }> {
  const dryRun = Boolean(options.dryRun);
  const linkedUsers = await listLinkedTeacherUsersForTeacherIds(db, teacherIds);
  const enabled: TeacherUserEnableHit[] = [];
  const skipped: TeacherUserEnableSkip[] = [];

  for (const row of linkedUsers) {
    const userId = Number(row.user_id);
    const teacherId = Number(row.teacher_id);
    const username = String(row.username ?? "").trim();
    if (!Number.isInteger(userId) || userId <= 0 || !username) continue;

    const user = await findUserById(db, userId);
    if (!user) {
      skipped.push({
        user_id: userId,
        username,
        teacher_id: teacherId,
        reason: "user_not_found",
      });
      continue;
    }

    if (isExcludedFromTeacherScheduleAutoEnable(user)) {
      skipped.push({
        user_id: userId,
        username,
        teacher_id: teacherId,
        reason: "excluded_account",
      });
      continue;
    }

    if ((user.disabled ?? 0) === 0) {
      skipped.push({
        user_id: userId,
        username,
        teacher_id: teacherId,
        reason: "already_enabled",
      });
      continue;
    }

    if (!dryRun) {
      await db
        .prepare(`UPDATE etr_users SET disabled = 0 WHERE id = ?1`)
        .bind(userId)
        .run();
    }

    enabled.push({ user_id: userId, username, teacher_id: teacherId });
  }

  return { enabled, skipped };
}

/** 新课是否有「尚未开始且在 withinMs 内」的上课时间 */
export function jpLessonHasClassStartingWithin(
  lesson: Pick<JpLessonRecord, "class_schedules" | "next_class_at">,
  withinMs: number,
  now = new Date()
): boolean {
  const schedules =
    lesson.class_schedules?.length > 0
      ? lesson.class_schedules
      : lesson.next_class_at?.trim()
        ? [{ class_at: lesson.next_class_at.trim() }]
        : [];
  if (!schedules.length) return false;

  const nowMs = now.getTime();
  const deadlineMs = nowMs + withinMs;
  for (const schedule of schedules) {
    const start = parseBeijingDateTime(String(schedule.class_at ?? "").trim());
    if (!start) continue;
    const startMs = start.getTime();
    if (startMs >= nowMs && startMs <= deadlineMs) return true;
  }
  return false;
}

/**
 * 日语新课保存老师 / 上课时间 /「学习中」后调用：
 * 若状态为学习中、已指定老师、且开课在 18 小时内 → 启用关联登录账号。
 * 失败不抛给调用方业务路径用；调用方宜 try/catch 以免影响主保存。
 */
export async function maybeEnableTeacherUsersForLearningLesson(
  db: D1Database,
  lesson: Pick<
    JpLessonRecord,
    "learning" | "completed" | "teacher_ids" | "class_schedules" | "next_class_at"
  >,
  options: { dryRun?: boolean; now?: Date; withinMs?: number } = {}
): Promise<TeacherUserLearningLessonEnableResult> {
  const dryRun = Boolean(options.dryRun);
  const withinMs =
    options.withinMs ?? TEACHER_LESSON_LEARNING_AUTO_ENABLE_WITHIN_MS;
  const now = options.now ?? new Date();

  if (getJpLessonProgressStatus(lesson) !== "learning") {
    return {
      triggered: false,
      reason: "not_learning",
      dry_run: dryRun,
      within_ms: withinMs,
      enabled: [],
      skipped: [],
    };
  }

  const teacherIds = (lesson.teacher_ids ?? []).filter(
    (id) => Number.isInteger(id) && id > 0
  );
  if (!teacherIds.length) {
    return {
      triggered: false,
      reason: "no_teacher",
      dry_run: dryRun,
      within_ms: withinMs,
      enabled: [],
      skipped: [],
    };
  }

  if (!jpLessonHasClassStartingWithin(lesson, withinMs, now)) {
    return {
      triggered: false,
      reason: "class_not_within_window",
      dry_run: dryRun,
      within_ms: withinMs,
      enabled: [],
      skipped: [],
    };
  }

  const { enabled, skipped } = await enableLinkedTeacherUsers(db, teacherIds, {
    dryRun,
  });

  return {
    triggered: true,
    dry_run: dryRun,
    within_ms: withinMs,
    enabled,
    skipped,
  };
}

/** 北京时间当日 05:00 定时：有关联老师且今日有课的用户，自动从禁用改为启用。 */
export async function runTeacherUserScheduleEnable(
  db: D1Database,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<TeacherUserScheduleEnableResult> {
  const dryRun = Boolean(options.dryRun);
  const date = beijingDateString(options.now);
  const teacherIds = await listTeacherIdsWithClassOnDate(db, date);
  const { enabled, skipped } = await enableLinkedTeacherUsers(db, teacherIds, {
    dryRun,
  });

  return {
    date,
    dry_run: dryRun,
    teachers_with_class: teacherIds,
    enabled,
    skipped,
  };
}
