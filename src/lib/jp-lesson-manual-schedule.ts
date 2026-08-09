import { resolveEnClassDurationMinutes } from "@/lib/en-lesson-shared";
import {
  parseBeijingDateTime,
  resolveClassDurationMinutes,
} from "@/lib/jp-lesson-shared";
import {
  normalizeManualScheduleLinkedLessons,
  type ManualScheduleLinkedLesson,
} from "@/lib/jp-lesson-manual-schedule-linked";
import { detectScheduleTeacherSubjectFromTitle } from "@/lib/jp-lesson-teacher-rate";
import type { JpLessonManualScheduleRecurringMeta } from "@/lib/jp-lesson-manual-schedule-recurring";

export const JP_LESSON_MANUAL_SCHEDULE_STORAGE_KEY = "jp-lesson-manual-schedules";

export type { ManualScheduleLinkedLesson };
export type { JpLessonManualScheduleRecurringMeta };

export type JpLessonManualSchedule = {
  id: number;
  class_at: string;
  duration_minutes: number | null;
  title: string;
  teacher: string;
  note: string;
  /** 关联日语/英语新课教材，最多 2 条（可选） */
  linked_lessons: ManualScheduleLinkedLesson[];
  /** 长期固定规则 id；一次性课为 null */
  recurring_id: number | null;
  /** 列表附带的规则摘要（可选） */
  recurring?: JpLessonManualScheduleRecurringMeta | null;
  created_at: string;
  updated_at: string;
};

export type JpLessonManualScheduleDraft = {
  class_at: string;
  duration_minutes: number | null;
  title: string;
  teacher: string;
  note: string;
  linked_lessons?: ManualScheduleLinkedLesson[];
  /** 新建时：是否长期固定（每周同一星期几+时间）；默认 false */
  recurring?: boolean;
};

type LegacyJpLessonManualSchedule = {
  id: string;
  class_at: string;
  duration_minutes: number | null;
  title: string;
  teacher: string;
  note: string;
  linked_lessons?: ManualScheduleLinkedLesson[];
  created_at: string;
  updated_at: string;
};

function manualScheduleDedupeKey(item: {
  class_at: string;
  title: string;
}): string {
  return `${item.class_at.trim()}|${item.title.trim()}`;
}

function readLegacyJpLessonManualSchedulesFromLocalStorage(): LegacyJpLessonManualSchedule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(JP_LESSON_MANUAL_SCHEDULE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is LegacyJpLessonManualSchedule => {
        if (!item || typeof item !== "object") return false;
        const row = item as Partial<LegacyJpLessonManualSchedule>;
        return (
          typeof row.id === "string" &&
          typeof row.class_at === "string" &&
          typeof row.title === "string" &&
          typeof row.teacher === "string" &&
          typeof row.note === "string" &&
          typeof row.created_at === "string" &&
          typeof row.updated_at === "string" &&
          (row.duration_minutes == null || typeof row.duration_minutes === "number")
        );
      })
      .sort((a, b) => a.class_at.localeCompare(b.class_at));
  } catch {
    return [];
  }
}

function clearLegacyJpLessonManualSchedulesFromLocalStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(JP_LESSON_MANUAL_SCHEDULE_STORAGE_KEY);
}

async function parseManualScheduleResponse(
  res: Response
): Promise<Record<string, unknown>> {
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    const error =
      typeof data.error === "string" ? data.error : `request_failed_${res.status}`;
    throw new Error(error);
  }
  return data;
}

function coerceJpLessonManualSchedule(
  raw: unknown
): JpLessonManualSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const recurringIdRaw = row.recurring_id;
  const recurringId =
    recurringIdRaw == null || recurringIdRaw === ""
      ? null
      : Number(recurringIdRaw);
  let recurring: JpLessonManualScheduleRecurringMeta | null | undefined;
  if (row.recurring && typeof row.recurring === "object") {
    const meta = row.recurring as Partial<JpLessonManualScheduleRecurringMeta>;
    const mid = Number(meta.id);
    const weekday = Number(meta.weekday);
    if (
      Number.isInteger(mid) &&
      mid > 0 &&
      Number.isInteger(weekday) &&
      weekday >= 0 &&
      weekday <= 6
    ) {
      recurring = {
        id: mid,
        weekday: weekday as JpLessonManualScheduleRecurringMeta["weekday"],
        time_hm: String(meta.time_hm ?? ""),
        active: meta.active !== false,
      };
    }
  }
  return {
    id,
    class_at: String(row.class_at ?? ""),
    duration_minutes:
      row.duration_minutes == null ? null : Number(row.duration_minutes),
    title: String(row.title ?? ""),
    teacher: String(row.teacher ?? ""),
    note: String(row.note ?? ""),
    linked_lessons: normalizeManualScheduleLinkedLessons(row.linked_lessons),
    recurring_id:
      recurringId != null && Number.isInteger(recurringId) && recurringId > 0
        ? recurringId
        : null,
    recurring: recurring ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function fetchJpLessonManualSchedules(): Promise<JpLessonManualSchedule[]> {
  const res = await fetch("/api/jp-lesson/manual-schedules", {
    credentials: "include",
  });
  const data = await parseManualScheduleResponse(res);
  const schedules = data.schedules;
  if (!Array.isArray(schedules)) return [];
  return schedules
    .map((item) => coerceJpLessonManualSchedule(item))
    .filter((item): item is JpLessonManualSchedule => item != null);
}

export async function createJpLessonManualSchedule(
  draft: JpLessonManualScheduleDraft
): Promise<JpLessonManualSchedule | null> {
  const res = await fetch("/api/jp-lesson/manual-schedules", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  const data = await parseManualScheduleResponse(res);
  return coerceJpLessonManualSchedule(data.schedule);
}

export async function updateJpLessonManualSchedule(
  id: number,
  draft: JpLessonManualScheduleDraft
): Promise<JpLessonManualSchedule | null> {
  const res = await fetch("/api/jp-lesson/manual-schedules", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update", id, ...draft }),
  });
  const data = await parseManualScheduleResponse(res);
  return coerceJpLessonManualSchedule(data.schedule);
}

export async function deleteJpLessonManualSchedule(id: number): Promise<boolean> {
  const res = await fetch(`/api/jp-lesson/manual-schedules?id=${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  await parseManualScheduleResponse(res);
  return true;
}

/** 从服务端加载，并把旧版 localStorage 数据一次性迁入数据库。 */
export async function loadJpLessonManualSchedulesWithLegacyMigration(): Promise<
  JpLessonManualSchedule[]
> {
  let schedules = await fetchJpLessonManualSchedules();
  const legacy = readLegacyJpLessonManualSchedulesFromLocalStorage();
  if (!legacy.length) return schedules;

  const existing = new Set(schedules.map((item) => manualScheduleDedupeKey(item)));
  for (const item of legacy) {
    const draft: JpLessonManualScheduleDraft = {
      class_at: item.class_at,
      duration_minutes: item.duration_minutes,
      title: item.title,
      teacher: item.teacher,
      note: item.note,
      linked_lessons: normalizeManualScheduleLinkedLessons(item.linked_lessons),
    };
    if (existing.has(manualScheduleDedupeKey(draft))) continue;
    const created = await createJpLessonManualSchedule(draft);
    if (created) {
      schedules.push(created);
      existing.add(manualScheduleDedupeKey(created));
    }
  }

  clearLegacyJpLessonManualSchedulesFromLocalStorage();
  schedules.sort((a, b) => a.class_at.localeCompare(b.class_at));
  return schedules;
}

/** 统一日程：日语新课 / 英语新课 / 手动添加 */
export type LessonScheduleSubject = "jp" | "en" | "manual";

export type JpLessonSchedulePageEvent = {
  key: string;
  classAt: string;
  start: Date;
  end: Date;
  durationMinutes: number;
  teachers: string;
  displayContent: string;
  source: "lesson" | "manual";
  subject: LessonScheduleSubject;
  lessonId?: number;
  scheduleId?: number;
  lesson?: {
    id: number;
    content: string;
    ref_key: string | null;
  };
  manualId?: number;
  manualNote?: string;
};

/**
 * 手动日程未填时长时的默认：标题含英语 → 25 分钟；其余 → 日语默认 55。
 * 网页日程与 CalDAV/ICS 须共用，避免英语手动课被当成 55。
 */
export function resolveManualScheduleDurationMinutes(
  title: string,
  durationMinutes: number | null | undefined
): number {
  if (detectScheduleTeacherSubjectFromTitle(title) === "en") {
    return resolveEnClassDurationMinutes(durationMinutes);
  }
  return resolveClassDurationMinutes(durationMinutes);
}

export function manualScheduleToPageEvent(
  manual: JpLessonManualSchedule
): JpLessonSchedulePageEvent | null {
  const start = parseBeijingDateTime(manual.class_at);
  if (!start) return null;
  const durationMinutes = resolveManualScheduleDurationMinutes(
    manual.title,
    manual.duration_minutes
  );
  return {
    key: `manual-${manual.id}`,
    classAt: manual.class_at,
    start,
    end: new Date(start.getTime() + durationMinutes * 60_000),
    durationMinutes,
    teachers: manual.teacher.trim() || "手动日程",
    displayContent: manual.title,
    source: "manual",
    subject: "manual",
    manualId: manual.id,
    manualNote: manual.note.trim() || undefined,
  };
}

export function flattenManualSchedulePageEvents(
  manuals: JpLessonManualSchedule[]
): JpLessonSchedulePageEvent[] {
  return manuals
    .map((manual) => manualScheduleToPageEvent(manual))
    .filter((event): event is JpLessonSchedulePageEvent => event != null)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
