import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { findUserById, listJpLessonTeacherNameMapByUserId, revokeUserSessions } from "@/lib/etr-auth-db";
import type { EtrUser } from "@/lib/etr-auth";
import {
  getJpLessonProgressStatus,
  parseBeijingDateTime,
  resolveClassDurationMinutes,
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

/**
 * 开课前此时长内：定时任务必须把已禁用的关联登录账号改为启用
 * （补上抽完延时禁用后、下午还有课等场景；与 05:00 / 学习中 18h 互补）。
 */
export const TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS = 2 * 60 * 60 * 1000;

/**
 * 抽完延时禁用时：开课前 / 下课后再此时长内跳过禁用，避免刚解禁又被禁、或课中被踢。
 * 与 `TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS` 同窗口（按 class_at→下课时刻计算）。
 */
export const TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS =
  TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS;

/**
 * 下课（开课 + 课时）后，再过此时长 → 自动禁用关联登录账号。
 * 北京墙钟；有后续未结束/未过宽限的课则不禁。
 */
export const TEACHER_POST_CLASS_DISABLE_AFTER_MS = 10 * 60 * 1000;

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

export type TeacherUserPreClassEnableResult = {
  dry_run: boolean;
  within_ms: number;
  teachers_with_upcoming_class: number[];
  enabled: TeacherUserEnableHit[];
  skipped: TeacherUserEnableSkip[];
};

export type TeacherUserPostClassDisableHit = {
  user_id: number;
  username: string;
  teacher_id: number;
};

export type TeacherUserPostClassDisableResult = {
  dry_run: boolean;
  grace_ms: number;
  teachers_due: number[];
  disabled: TeacherUserPostClassDisableHit[];
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

type TeacherClassAtRow = {
  teacher_id: number;
  class_at: string;
  duration_minutes: number | null;
};

/** 北京日 today / tomorrow 的日语排课 + 手动日程（含 teacher_id + class_at + 时长） */
async function listTeacherClassAtsNearBeijingDates(
  db: D1Database,
  dateStrs: string[]
): Promise<TeacherClassAtRow[]> {
  const prefixes = [...new Set(dateStrs.map((d) => d.trim()).filter(Boolean))];
  if (!prefixes.length) return [];

  const likeClauses = prefixes.map((_, i) => `cs.class_at LIKE ?${i + 1}`).join(" OR ");
  const likeClausesMs = prefixes
    .map((_, i) => `ms.class_at LIKE ?${i + 1}`)
    .join(" OR ");
  const binds = prefixes.map((d) => `${d}%`);

  const result = await db
    .prepare(
      `SELECT teacher_id, class_at, duration_minutes FROM (
         SELECT tl.teacher_id AS teacher_id, cs.class_at AS class_at,
                cs.duration_minutes AS duration_minutes
         FROM jp_lesson_teacher_link tl
         INNER JOIN jp_lesson_class_schedule cs ON cs.lesson_id = tl.lesson_id
         WHERE ${likeClauses}
         UNION ALL
         SELECT jt.id AS teacher_id, ms.class_at AS class_at,
                ms.duration_minutes AS duration_minutes
         FROM jp_lesson_teacher jt
         INNER JOIN jp_lesson_manual_schedule ms
           ON lower(trim(ms.teacher)) = lower(trim(jt.name))
         WHERE ${likeClausesMs}
       )`
    )
    .bind(...binds)
    .all<TeacherClassAtRow>();

  return result.results ?? [];
}

function beijingDatePlusDays(now: Date, days: number): string {
  return beijingDateString(new Date(now.getTime() + days * 86_400_000));
}

function teacherClassEndMs(row: TeacherClassAtRow): number | null {
  const start = parseBeijingDateTime(String(row.class_at ?? "").trim());
  if (!start) return null;
  const durationMin = resolveClassDurationMinutes(
    row.duration_minutes != null ? Number(row.duration_minutes) : null
  );
  return start.getTime() + durationMin * 60_000;
}

/**
 * 老师在 [class_at - beforeMs, 下课 + afterMs] 内有课（北京墙钟）。
 * beforeMs：开课前；afterMs：下课后再算「临近」（课中/刚下课仍算）。
 * 课时缺省按 DEFAULT 55min。供抽完禁用跳过等。
 */
export async function listTeacherIdsWithClassNearNow(
  db: D1Database,
  options: { beforeMs: number; afterMs?: number; now?: Date } = {
    beforeMs: TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS,
  }
): Promise<number[]> {
  const now = options.now ?? new Date();
  const beforeMs = Math.max(0, options.beforeMs);
  const afterMs = Math.max(0, options.afterMs ?? 0);
  const nowMs = now.getTime();

  const dateStrs = [
    beijingDatePlusDays(now, -1),
    beijingDateString(now),
    beijingDatePlusDays(now, 1),
  ];
  const rows = await listTeacherClassAtsNearBeijingDates(db, dateStrs);
  const ids = new Set<number>();
  for (const row of rows) {
    const teacherId = Number(row.teacher_id);
    if (!Number.isInteger(teacherId) || teacherId <= 0) continue;
    const start = parseBeijingDateTime(String(row.class_at ?? "").trim());
    if (!start) continue;
    const endMs = teacherClassEndMs(row);
    if (endMs == null) continue;
    const windowStart = start.getTime() - beforeMs;
    const windowEnd = endMs + afterMs;
    if (nowMs >= windowStart && nowMs <= windowEnd) ids.add(teacherId);
  }
  return [...ids].sort((a, b) => a - b);
}

/** 开课前启用专用：尚未开始、且 class_at ∈ [now, now+withinMs] */
export async function listTeacherIdsWithUpcomingClassStart(
  db: D1Database,
  options: { withinMs?: number; now?: Date } = {}
): Promise<number[]> {
  const now = options.now ?? new Date();
  const withinMs = Math.max(
    0,
    options.withinMs ?? TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS
  );
  const nowMs = now.getTime();
  const toMs = nowMs + withinMs;
  const dateStrs = [
    beijingDatePlusDays(now, -1),
    beijingDateString(now),
    beijingDatePlusDays(now, 1),
  ];
  const rows = await listTeacherClassAtsNearBeijingDates(db, dateStrs);
  const ids = new Set<number>();
  for (const row of rows) {
    const teacherId = Number(row.teacher_id);
    if (!Number.isInteger(teacherId) || teacherId <= 0) continue;
    const start = parseBeijingDateTime(String(row.class_at ?? "").trim());
    if (!start) continue;
    const startMs = start.getTime();
    if (startMs >= nowMs && startMs <= toMs) ids.add(teacherId);
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * 下课 + grace 已过、且没有「尚未下课+grace」的后续课 → 应禁用。
 * 例：12:30 开课、55min → 13:25 下课，13:35 起可禁；若下午还有课则等最后一节过宽限。
 */
export async function listTeacherIdsDueForPostClassDisable(
  db: D1Database,
  options: { graceMs?: number; now?: Date } = {}
): Promise<number[]> {
  const now = options.now ?? new Date();
  const graceMs = Math.max(0, options.graceMs ?? TEACHER_POST_CLASS_DISABLE_AFTER_MS);
  const nowMs = now.getTime();
  const dateStrs = [
    beijingDatePlusDays(now, -1),
    beijingDateString(now),
    beijingDatePlusDays(now, 1),
  ];
  const rows = await listTeacherClassAtsNearBeijingDates(db, dateStrs);
  const byTeacher = new Map<number, TeacherClassAtRow[]>();
  for (const row of rows) {
    const teacherId = Number(row.teacher_id);
    if (!Number.isInteger(teacherId) || teacherId <= 0) continue;
    const list = byTeacher.get(teacherId) ?? [];
    list.push(row);
    byTeacher.set(teacherId, list);
  }

  const due: number[] = [];
  for (const [teacherId, classRows] of byTeacher) {
    let hasBlocking = false;
    let hasFinishedPastGrace = false;
    for (const row of classRows) {
      const endMs = teacherClassEndMs(row);
      if (endMs == null) continue;
      const disableAt = endMs + graceMs;
      if (nowMs < disableAt) {
        hasBlocking = true;
      } else {
        hasFinishedPastGrace = true;
      }
    }
    if (hasFinishedPastGrace && !hasBlocking) {
      due.push(teacherId);
    }
  }
  return due.sort((a, b) => a - b);
}

/** 关联登录用户中，临近开课的 user_id 集合（供抽完禁用跳过） */
export async function listLinkedUserIdsWithClassNearNow(
  db: D1Database,
  options: { beforeMs: number; afterMs?: number; now?: Date } = {
    beforeMs: TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
    afterMs: TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
  }
): Promise<Set<number>> {
  const teacherIds = await listTeacherIdsWithClassNearNow(db, options);
  if (!teacherIds.length) return new Set();
  const linked = await listLinkedTeacherUsersForTeacherIds(db, teacherIds);
  const userIds = new Set<number>();
  for (const row of linked) {
    const userId = Number(row.user_id);
    if (Number.isInteger(userId) && userId > 0) userIds.add(userId);
  }
  return userIds;
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

/**
 * 开课前 2 小时内定时：关联账号若仍禁用则启用。
 * Mac launchd 每 10 分钟跑一次；与 05:00 / 学习中 18h 互补。
 */
export async function runTeacherUserPreClassEnable(
  db: D1Database,
  options: { dryRun?: boolean; now?: Date; withinMs?: number } = {}
): Promise<TeacherUserPreClassEnableResult> {
  const dryRun = Boolean(options.dryRun);
  const withinMs =
    options.withinMs ?? TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS;
  const now = options.now ?? new Date();
  const teacherIds = await listTeacherIdsWithUpcomingClassStart(db, {
    withinMs,
    now,
  });
  const { enabled, skipped } = await enableLinkedTeacherUsers(db, teacherIds, {
    dryRun,
  });

  return {
    dry_run: dryRun,
    within_ms: withinMs,
    teachers_with_upcoming_class: teacherIds,
    enabled,
    skipped,
  };
}

/**
 * 下课（开课+课时）后再过 grace（默认 10 分钟）→ 禁用关联登录账号。
 * 若还有未下课 / 未过宽限的课（含下午下一节）则跳过。
 * Mac launchd 每 10 分钟；与抽完延时禁用互补；排除 admin / user1 / test。
 */
export async function runTeacherUserPostClassDisable(
  db: D1Database,
  options: { dryRun?: boolean; now?: Date; graceMs?: number } = {}
): Promise<TeacherUserPostClassDisableResult> {
  const dryRun = Boolean(options.dryRun);
  const now = options.now ?? new Date();
  const graceMs =
    options.graceMs ?? TEACHER_POST_CLASS_DISABLE_AFTER_MS;
  const teacherIds = await listTeacherIdsDueForPostClassDisable(db, {
    graceMs,
    now,
  });

  const linkedUsers = await listLinkedTeacherUsersForTeacherIds(db, teacherIds);
  const disabled: TeacherUserPostClassDisableHit[] = [];
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
        username: user.username,
        teacher_id: teacherId,
        reason: "excluded_account",
      });
      continue;
    }

    if ((user.disabled ?? 0) !== 0) {
      skipped.push({
        user_id: userId,
        username: user.username,
        teacher_id: teacherId,
        reason: "already_disabled",
      });
      continue;
    }

    if (!dryRun) {
      await db
        .prepare(`UPDATE etr_users SET disabled = 1 WHERE id = ?1`)
        .bind(userId)
        .run();
      await revokeUserSessions(db, userId);
    }

    disabled.push({
      user_id: userId,
      username: user.username,
      teacher_id: teacherId,
    });
  }

  return {
    dry_run: dryRun,
    grace_ms: graceMs,
    teachers_due: teacherIds,
    disabled,
    skipped,
  };
}
