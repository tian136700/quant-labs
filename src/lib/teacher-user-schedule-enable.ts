import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  getJpLessonProgressStatus,
  parseBeijingDateTime,
  resolveClassDurationMinutes,
} from "@/lib/jp-lesson-shared";
import type { JpLessonRecord } from "@/lib/types";
import {
  EN_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS,
  EN_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
  listEnTeacherIdsWithClassNearNow,
  listEnTeacherIdsWithUpcomingClassStart,
  listLinkedEnTeacherUsersForTeacherIds,
} from "@/lib/teacher-user-en-schedule";
import {
  disableLinkedTeacherUsersForTeacherIds,
  enableLinkedTeacherUsersForTeacherIds,
  listLinkedKoTeacherUsersForTeacherIds,
  listLinkedTeacherUsersForTeacherIds,
} from "@/lib/teacher-user-schedule-enable-internal";
import {
  KO_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS,
  KO_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
  TEACHER_LESSON_LEARNING_AUTO_ENABLE_WITHIN_MS,
  TEACHER_POST_CLASS_DISABLE_AFTER_MS,
  TEACHER_POST_CLASS_DISABLE_CATCHUP_MS,
  TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS,
  TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
  type TeacherUserLearningLessonEnableResult,
  type TeacherUserPostClassDisableResult,
  type TeacherUserPreClassEnableResult,
  type TeacherUserScheduleEnableResult,
} from "@/lib/teacher-user-schedule-enable-types";

export {
  EN_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS,
  EN_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
} from "@/lib/teacher-user-en-schedule";

export {
  isExcludedFromTeacherScheduleAutoEnable,
  KO_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS,
  KO_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
  TEACHER_LESSON_LEARNING_AUTO_ENABLE_WITHIN_MS,
  TEACHER_POST_CLASS_DISABLE_AFTER_MS,
  TEACHER_POST_CLASS_DISABLE_CATCHUP_MS,
  TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS,
  TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
  TEACHER_SCHEDULE_AUTO_ENABLE_EXCLUDED_USERNAMES,
  type TeacherUserEnableHit,
  type TeacherUserEnableSkip,
  type TeacherUserLearningLessonEnableResult,
  type TeacherUserPostClassDisableHit,
  type TeacherUserPostClassDisableResult,
  type TeacherUserPreClassEnableResult,
  type TeacherUserScheduleEnableResult,
} from "@/lib/teacher-user-schedule-enable-types";

async function listTeacherIdsWithClassOnDate(
  db: D1Database,
  dateStr: string
): Promise<number[]> {
  const datePrefix = `${dateStr}%`;
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

async function listKoTeacherClassAtsNearBeijingDates(
  db: D1Database,
  dateStrs: string[]
): Promise<TeacherClassAtRow[]> {
  const prefixes = [...new Set(dateStrs.map((d) => d.trim()).filter(Boolean))];
  if (!prefixes.length) return [];

  const likeClausesMs = prefixes
    .map((_, i) => `ms.class_at LIKE ?${i + 1}`)
    .join(" OR ");
  const binds = prefixes.map((d) => `${d}%`);

  try {
    const result = await db
      .prepare(
        `SELECT kt.id AS teacher_id, ms.class_at AS class_at,
                ms.duration_minutes AS duration_minutes
         FROM ko_lesson_teacher kt
         INNER JOIN jp_lesson_manual_schedule ms
           ON lower(trim(ms.teacher)) = lower(trim(kt.name))
         WHERE ${likeClausesMs}`
      )
      .bind(...binds)
      .all<TeacherClassAtRow>();
    return result.results ?? [];
  } catch {
    return [];
  }
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

/** 开课前启用：尚未开始、且 class_at ∈ [now, now+withinMs] */
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
 * 课进行中（已开课、尚未下课）：开课前任务漏启或课中被误禁时补开。
 */
export async function listTeacherIdsWithOngoingClass(
  db: D1Database,
  options: { now?: Date } = {}
): Promise<number[]> {
  const now = options.now ?? new Date();
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
    const startMs = start.getTime();
    if (nowMs >= startMs && nowMs <= endMs) ids.add(teacherId);
  }
  return [...ids].sort((a, b) => a - b);
}

export async function listKoTeacherIdsWithUpcomingClassStart(
  db: D1Database,
  options: { withinMs?: number; now?: Date } = {}
): Promise<number[]> {
  const now = options.now ?? new Date();
  const withinMs = Math.max(
    0,
    options.withinMs ?? KO_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS
  );
  const nowMs = now.getTime();
  const toMs = nowMs + withinMs;
  const dateStrs = [
    beijingDatePlusDays(now, -1),
    beijingDateString(now),
    beijingDatePlusDays(now, 1),
  ];
  const rows = await listKoTeacherClassAtsNearBeijingDates(db, dateStrs);
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

export async function listKoTeacherIdsWithClassNearNow(
  db: D1Database,
  options: { beforeMs: number; afterMs?: number; now?: Date } = {
    beforeMs: KO_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
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
  const rows = await listKoTeacherClassAtsNearBeijingDates(db, dateStrs);
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

export type TeacherPostClassDue = {
  teacher_id: number;
  latest_disable_at_ms: number;
};

/**
 * 下课 + grace 已过、无后续 blocking 课，且仍在补跑窗口内 → 应禁用。
 * 补跑窗口避免「昨天已下课」把账号整天钉在 due 上、管理员启用后又被禁。
 */
export async function listTeacherIdsDueForPostClassDisable(
  db: D1Database,
  options: {
    graceMs?: number;
    catchupMs?: number;
    now?: Date;
  } = {}
): Promise<number[]> {
  const dues = await listTeacherPostClassDues(db, options);
  return dues.map((d) => d.teacher_id);
}

export async function listTeacherPostClassDues(
  db: D1Database,
  options: {
    graceMs?: number;
    catchupMs?: number;
    now?: Date;
  } = {}
): Promise<TeacherPostClassDue[]> {
  const now = options.now ?? new Date();
  const graceMs = Math.max(0, options.graceMs ?? TEACHER_POST_CLASS_DISABLE_AFTER_MS);
  const catchupMs = Math.max(
    0,
    options.catchupMs ?? TEACHER_POST_CLASS_DISABLE_CATCHUP_MS
  );
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

  const due: TeacherPostClassDue[] = [];
  for (const [teacherId, classRows] of byTeacher) {
    let hasBlocking = false;
    let latestDisableAt = Number.NEGATIVE_INFINITY;
    for (const row of classRows) {
      const endMs = teacherClassEndMs(row);
      if (endMs == null) continue;
      const disableAt = endMs + graceMs;
      if (disableAt > latestDisableAt) latestDisableAt = disableAt;
      if (nowMs < disableAt) {
        hasBlocking = true;
      }
    }
    if (
      !hasBlocking &&
      Number.isFinite(latestDisableAt) &&
      latestDisableAt <= nowMs &&
      nowMs <= latestDisableAt + catchupMs
    ) {
      due.push({ teacher_id: teacherId, latest_disable_at_ms: latestDisableAt });
    }
  }
  return due.sort((a, b) => a.teacher_id - b.teacher_id);
}

/** 关联登录用户中，临近开课的 user_id 集合（供抽完禁用跳过；含日语 + 韩语 + 英语） */
export async function listLinkedUserIdsWithClassNearNow(
  db: D1Database,
  options: { beforeMs: number; afterMs?: number; now?: Date } = {
    beforeMs: TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
    afterMs: TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
  }
): Promise<Set<number>> {
  const now = options.now ?? new Date();
  const teacherIds = await listTeacherIdsWithClassNearNow(db, options);
  const koTeacherIds = await listKoTeacherIdsWithClassNearNow(db, {
    beforeMs: KO_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
    afterMs: KO_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
    now,
  });
  const enTeacherIds = await listEnTeacherIdsWithClassNearNow(db, {
    beforeMs: EN_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
    afterMs: EN_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
    now,
  });
  const userIds = new Set<number>();
  if (teacherIds.length) {
    const linked = await listLinkedTeacherUsersForTeacherIds(db, teacherIds);
    for (const row of linked) {
      const userId = Number(row.user_id);
      if (Number.isInteger(userId) && userId > 0) userIds.add(userId);
    }
  }
  if (koTeacherIds.length) {
    const linked = await listLinkedKoTeacherUsersForTeacherIds(db, koTeacherIds);
    for (const row of linked) {
      const userId = Number(row.user_id);
      if (Number.isInteger(userId) && userId > 0) userIds.add(userId);
    }
  }
  if (enTeacherIds.length) {
    const linked = await listLinkedEnTeacherUsersForTeacherIds(db, enTeacherIds);
    for (const row of linked) {
      const userId = Number(row.user_id);
      if (Number.isInteger(userId) && userId > 0) userIds.add(userId);
    }
  }
  return userIds;
}

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

  const { enabled, skipped } = await enableLinkedTeacherUsersForTeacherIds(
    db,
    teacherIds,
    { dryRun }
  );

  return {
    triggered: true,
    dry_run: dryRun,
    within_ms: withinMs,
    enabled,
    skipped,
  };
}

export async function runTeacherUserScheduleEnable(
  db: D1Database,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<TeacherUserScheduleEnableResult> {
  const dryRun = Boolean(options.dryRun);
  const date = beijingDateString(options.now);
  const teacherIds = await listTeacherIdsWithClassOnDate(db, date);
  const { enabled, skipped } = await enableLinkedTeacherUsersForTeacherIds(
    db,
    teacherIds,
    { dryRun }
  );

  return {
    date,
    dry_run: dryRun,
    teachers_with_class: teacherIds,
    enabled,
    skipped,
  };
}

/**
 * 开课前 / 课中定时启用。
 * - 日语：开课前 2h + 课进行中
 * - 韩语 / 英语：开课前 30min
 */
export async function runTeacherUserPreClassEnable(
  db: D1Database,
  options: {
    dryRun?: boolean;
    now?: Date;
    withinMs?: number;
    koWithinMs?: number;
    enWithinMs?: number;
  } = {}
): Promise<TeacherUserPreClassEnableResult> {
  const dryRun = Boolean(options.dryRun);
  const withinMs =
    options.withinMs ?? TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS;
  const koWithinMs =
    options.koWithinMs ?? KO_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS;
  const enWithinMs =
    options.enWithinMs ?? EN_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS;
  const now = options.now ?? new Date();
  try {
    const { ensureXianyuEnQuizTeacherBound } = await import(
      "@/lib/en-xianyu-quiz-teacher"
    );
    await ensureXianyuEnQuizTeacherBound(db);
  } catch {
    // 绑定失败不阻断开课前启用
  }
  const upcomingIds = await listTeacherIdsWithUpcomingClassStart(db, {
    withinMs,
    now,
  });
  const ongoingIds = await listTeacherIdsWithOngoingClass(db, { now });
  const teacherIds = [
    ...new Set([...upcomingIds, ...ongoingIds]),
  ].sort((a, b) => a - b);
  const koTeacherIds = await listKoTeacherIdsWithUpcomingClassStart(db, {
    withinMs: koWithinMs,
    now,
  });
  const enTeacherIds = await listEnTeacherIdsWithUpcomingClassStart(db, {
    withinMs: enWithinMs,
    now,
  });
  const jpResult = await enableLinkedTeacherUsersForTeacherIds(db, teacherIds, {
    dryRun,
    subject: "jp",
  });
  const koResult = await enableLinkedTeacherUsersForTeacherIds(
    db,
    koTeacherIds,
    { dryRun, subject: "ko" }
  );
  const enResult = await enableLinkedTeacherUsersForTeacherIds(
    db,
    enTeacherIds,
    { dryRun, subject: "en" }
  );

  return {
    dry_run: dryRun,
    within_ms: withinMs,
    teachers_with_upcoming_class: teacherIds,
    enabled: [...jpResult.enabled, ...koResult.enabled, ...enResult.enabled],
    skipped: [...jpResult.skipped, ...koResult.skipped, ...enResult.skipped],
    ko_within_ms: koWithinMs,
    ko_teachers_with_upcoming_class: koTeacherIds,
    en_within_ms: enWithinMs,
    en_teachers_with_upcoming_class: enTeacherIds,
  };
}

export async function runTeacherUserPostClassDisable(
  db: D1Database,
  options: {
    dryRun?: boolean;
    now?: Date;
    graceMs?: number;
    catchupMs?: number;
  } = {}
): Promise<TeacherUserPostClassDisableResult> {
  const dryRun = Boolean(options.dryRun);
  const now = options.now ?? new Date();
  const graceMs = options.graceMs ?? TEACHER_POST_CLASS_DISABLE_AFTER_MS;
  const catchupMs = options.catchupMs ?? TEACHER_POST_CLASS_DISABLE_CATCHUP_MS;
  const dues = await listTeacherPostClassDues(db, {
    graceMs,
    catchupMs,
    now,
  });
  const teacherIds = dues.map((d) => d.teacher_id);
  const latestDisableAtByTeacherId = new Map(
    dues.map((d) => [d.teacher_id, d.latest_disable_at_ms] as const)
  );

  const { disabled, skipped } = await disableLinkedTeacherUsersForTeacherIds(
    db,
    teacherIds,
    { dryRun, latestDisableAtByTeacherId }
  );

  return {
    dry_run: dryRun,
    grace_ms: graceMs,
    teachers_due: teacherIds,
    disabled,
    skipped,
  };
}
