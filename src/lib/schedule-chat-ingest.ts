import "server-only";

import { createEnLessonTeacher, listEnLessonTeachers } from "@/lib/en-lesson-teacher-db";
import {
  createJpLessonManualSchedule,
  listJpLessonManualSchedules,
} from "@/lib/jp-lesson-manual-schedule-db";
import type { JpLessonManualSchedule } from "@/lib/jp-lesson-manual-schedule";
import {
  detectScheduleTeacherSubjectFromTitle,
  type ScheduleTeacherSubjectFromTitle,
} from "@/lib/jp-lesson-teacher-rate";
import { createJpLessonTeacher, listJpLessonTeachers } from "@/lib/jp-lesson-teacher-db";
import { createKoLessonTeacher, listKoLessonTeachers } from "@/lib/ko-lesson-teacher-db";

export type ScheduleChatIngestInput = {
  class_at: string;
  title: string;
  teacher: string;
  duration_minutes?: number | null;
  note?: string;
  /** 用户从歧义列表点选的老师 id */
  teacher_pick_id?: number | null;
  /** 缺省 true：科目池里没有同名老师时新建 */
  create_if_missing?: boolean;
};

export type ScheduleChatTeacherCandidate = {
  id: number;
  name: string;
  subject: NonNullable<ScheduleTeacherSubjectFromTitle>;
};

export type ScheduleChatIngestResult =
  | {
      ok: true;
      schedule: JpLessonManualSchedule;
      teacher: ScheduleChatTeacherCandidate | null;
      created_teacher: boolean;
    }
  | {
      ok: false;
      error: "teacher_ambiguous";
      candidates: ScheduleChatTeacherCandidate[];
    }
  | {
      ok: false;
      error: "schedule_already_exists";
      schedule: JpLessonManualSchedule;
    }
  | { ok: false; error: string };

type NamedTeacher = { id: number; name: string };

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, "").toLowerCase();
}

function teacherMatchKey(name: string): string {
  let n = normalizeName(name);
  if (n.endsWith("老师") && n !== "机构老师" && n.length > 2) {
    n = n.slice(0, -2);
  }
  return n;
}

function normalizeClassAtKey(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00`;
  }
  return trimmed;
}

function durationsEqual(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  const na = a == null || Number.isNaN(Number(a)) ? null : Number(a);
  const nb = b == null || Number.isNaN(Number(b)) ? null : Number(b);
  return na === nb;
}

function matchTeachers(
  teachers: NamedTeacher[],
  query: string
): NamedTeacher[] {
  const q = normalizeName(query);
  if (!q) return [];

  const exact = teachers.filter((t) => normalizeName(t.name) === q);
  if (exact.length === 1) return exact;
  if (exact.length > 1) return exact;

  const contains = teachers.filter((t) => {
    const n = normalizeName(t.name);
    return n.includes(q) || q.includes(n);
  });
  return contains;
}

async function listTeachersForSubject(
  db: D1Database,
  subject: NonNullable<ScheduleTeacherSubjectFromTitle>
): Promise<NamedTeacher[]> {
  if (subject === "ko") {
    const rows = await listKoLessonTeachers(db);
    return rows.map((t) => ({ id: t.id, name: t.name }));
  }
  if (subject === "en") {
    const rows = await listEnLessonTeachers(db);
    return rows.map((t) => ({ id: t.id, name: t.name }));
  }
  const rows = await listJpLessonTeachers(db);
  return rows.map((t) => ({ id: t.id, name: t.name }));
}

async function createTeacherForSubject(
  db: D1Database,
  subject: NonNullable<ScheduleTeacherSubjectFromTitle>,
  name: string
): Promise<{ ok: true; teacher: NamedTeacher } | { ok: false; error: string }> {
  if (subject === "ko") {
    const result = await createKoLessonTeacher(db, name, 0, null, null);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      teacher: { id: result.teacher.id, name: result.teacher.name },
    };
  }
  if (subject === "en") {
    const result = await createEnLessonTeacher(db, name, 0, null, null);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      teacher: { id: result.teacher.id, name: result.teacher.name },
    };
  }
  const result = await createJpLessonTeacher(db, name, 0, null, null);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    teacher: { id: result.teacher.id, name: result.teacher.name },
  };
}

/**
 * 匹配或新建科目老师，再写入手动日程。
 * 不创建登录账号（create_user）。
 */
export async function ingestScheduleChatDraft(
  db: D1Database,
  input: ScheduleChatIngestInput
): Promise<ScheduleChatIngestResult> {
  const title = (input.title || "").trim();
  const classAt = (input.class_at || "").trim();
  const requestedTeacher = (input.teacher || "").trim();
  const note = (input.note || "").trim();
  const createIfMissing = input.create_if_missing !== false;

  if (!title || !classAt) {
    return { ok: false, error: "draft_invalid" };
  }

  const subject = detectScheduleTeacherSubjectFromTitle(title);
  let resolvedTeacherName = requestedTeacher;
  let createdTeacher = false;
  let teacherMeta: ScheduleChatTeacherCandidate | null = null;

  if (requestedTeacher && subject) {
    const pool = await listTeachersForSubject(db, subject);
    const pickId = Number(input.teacher_pick_id);

    if (Number.isInteger(pickId) && pickId > 0) {
      const picked = pool.find((t) => t.id === pickId);
      if (!picked) {
        return { ok: false, error: "teacher_pick_invalid" };
      }
      resolvedTeacherName = picked.name;
      teacherMeta = { id: picked.id, name: picked.name, subject };
    } else {
      const matches = matchTeachers(pool, requestedTeacher);
      if (matches.length > 1) {
        return {
          ok: false,
          error: "teacher_ambiguous",
          candidates: matches.map((t) => ({
            id: t.id,
            name: t.name,
            subject,
          })),
        };
      }
      if (matches.length === 1) {
        resolvedTeacherName = matches[0].name;
        teacherMeta = {
          id: matches[0].id,
          name: matches[0].name,
          subject,
        };
      } else if (createIfMissing) {
        const created = await createTeacherForSubject(
          db,
          subject,
          requestedTeacher
        );
        if (!created.ok) {
          // 并发重名时再匹配一次
          if (created.error === "name_duplicate") {
            const again = matchTeachers(
              await listTeachersForSubject(db, subject),
              requestedTeacher
            );
            if (again.length === 1) {
              resolvedTeacherName = again[0].name;
              teacherMeta = {
                id: again[0].id,
                name: again[0].name,
                subject,
              };
            } else {
              return { ok: false, error: created.error };
            }
          } else {
            return { ok: false, error: created.error };
          }
        } else {
          resolvedTeacherName = created.teacher.name;
          teacherMeta = {
            id: created.teacher.id,
            name: created.teacher.name,
            subject,
          };
          createdTeacher = true;
        }
      } else {
        return { ok: false, error: "teacher_not_found" };
      }
    }
  }

  const durationMinutes =
    input.duration_minutes === undefined ? null : input.duration_minutes;
  const classAtKey = normalizeClassAtKey(classAt);
  const teacherKey = teacherMatchKey(resolvedTeacherName);
  const titleKey = title.trim();
  const existingManuals = await listJpLessonManualSchedules(db);
  const duplicate = existingManuals.find((row) => {
    if (normalizeClassAtKey(row.class_at) !== classAtKey) return false;
    if (row.title.trim() !== titleKey) return false;
    if (teacherMatchKey(row.teacher) !== teacherKey) return false;
    return durationsEqual(row.duration_minutes, durationMinutes);
  });
  if (duplicate) {
    return {
      ok: false,
      error: "schedule_already_exists",
      schedule: duplicate,
    };
  }

  const scheduleResult = await createJpLessonManualSchedule(db, {
    class_at: classAt,
    title,
    teacher: resolvedTeacherName,
    duration_minutes: durationMinutes,
    note,
  });

  if (!scheduleResult.ok) {
    return { ok: false, error: scheduleResult.error };
  }

  return {
    ok: true,
    schedule: scheduleResult.schedule,
    teacher: teacherMeta,
    created_teacher: createdTeacher,
  };
}
