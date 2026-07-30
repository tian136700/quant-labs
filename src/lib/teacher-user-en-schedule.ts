import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  parseBeijingDateTime,
  resolveClassDurationMinutes,
} from "@/lib/jp-lesson-shared";

/** 英语老师：开课前此时长内启用关联登录账号（手动日程姓名匹配 en_lesson_teacher） */
export const EN_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS = 30 * 60 * 1000;

/** 英语抽完禁用：临近课窗口与开课前 30min 启用一致 */
export const EN_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS =
  EN_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS;

type TeacherClassAtRow = {
  teacher_id: number;
  class_at: string;
  duration_minutes: number | null;
};

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

/** 北京日 today / tomorrow 的英语老师手动日程（姓名匹配 en_lesson_teacher） */
export async function listEnTeacherClassAtsNearBeijingDates(
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
        `SELECT et.id AS teacher_id, ms.class_at AS class_at,
                ms.duration_minutes AS duration_minutes
         FROM en_lesson_teacher et
         INNER JOIN jp_lesson_manual_schedule ms
           ON lower(trim(ms.teacher)) = lower(trim(et.name))
         WHERE ${likeClausesMs}`
      )
      .bind(...binds)
      .all<TeacherClassAtRow>();
    return result.results ?? [];
  } catch {
    return [];
  }
}

export async function listEnTeacherIdsWithUpcomingClassStart(
  db: D1Database,
  options: { withinMs?: number; now?: Date } = {}
): Promise<number[]> {
  const now = options.now ?? new Date();
  const withinMs = Math.max(
    0,
    options.withinMs ?? EN_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS
  );
  const nowMs = now.getTime();
  const toMs = nowMs + withinMs;
  const dateStrs = [
    beijingDatePlusDays(now, -1),
    beijingDateString(now),
    beijingDatePlusDays(now, 1),
  ];
  const rows = await listEnTeacherClassAtsNearBeijingDates(db, dateStrs);
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

export async function listEnTeacherIdsWithClassNearNow(
  db: D1Database,
  options: { beforeMs: number; afterMs?: number; now?: Date } = {
    beforeMs: EN_TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
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
  const rows = await listEnTeacherClassAtsNearBeijingDates(db, dateStrs);
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

export type LinkedEnTeacherUser = {
  user_id: number;
  username: string;
  role: string;
  disabled: number;
  never_disable: number;
  teacher_id: number;
};

export async function listLinkedEnTeacherUsersForTeacherIds(
  db: D1Database,
  teacherIds: number[]
): Promise<LinkedEnTeacherUser[]> {
  if (!teacherIds.length) return [];
  try {
    const placeholders = teacherIds.map((_, i) => `?${i + 1}`).join(", ");
    const result = await db
      .prepare(
        `SELECT link.user_id AS user_id, u.username AS username, u.role AS role,
                COALESCE(u.disabled, 0) AS disabled,
                COALESCE(u.never_disable, 0) AS never_disable,
                link.teacher_id AS teacher_id
         FROM etr_user_en_lesson_teacher_link link
         INNER JOIN etr_users u ON u.id = link.user_id
         WHERE link.teacher_id IN (${placeholders})`
      )
      .bind(...teacherIds)
      .all<LinkedEnTeacherUser>();
    return result.results ?? [];
  } catch {
    return [];
  }
}
