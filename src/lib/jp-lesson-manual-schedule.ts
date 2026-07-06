import {
  parseBeijingDateTime,
  resolveClassDurationMinutes,
} from "@/lib/jp-lesson-shared";

export const JP_LESSON_MANUAL_SCHEDULE_STORAGE_KEY = "jp-lesson-manual-schedules";

export type JpLessonManualSchedule = {
  id: string;
  class_at: string;
  duration_minutes: number | null;
  title: string;
  teacher: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export type JpLessonManualScheduleDraft = {
  class_at: string;
  duration_minutes: number | null;
  title: string;
  teacher: string;
  note: string;
};

function createManualScheduleId(): string {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeDraft(draft: JpLessonManualScheduleDraft): JpLessonManualScheduleDraft | null {
  const title = draft.title.trim();
  const classAt = draft.class_at.trim();
  if (!title || !classAt || !parseBeijingDateTime(classAt)) return null;
  return {
    title,
    class_at: classAt,
    duration_minutes: draft.duration_minutes,
    teacher: draft.teacher.trim(),
    note: draft.note.trim(),
  };
}

export function readJpLessonManualSchedules(): JpLessonManualSchedule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(JP_LESSON_MANUAL_SCHEDULE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is JpLessonManualSchedule => {
        if (!item || typeof item !== "object") return false;
        const row = item as Partial<JpLessonManualSchedule>;
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

export function writeJpLessonManualSchedules(schedules: JpLessonManualSchedule[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(JP_LESSON_MANUAL_SCHEDULE_STORAGE_KEY, JSON.stringify(schedules));
}

export function addJpLessonManualSchedule(
  draft: JpLessonManualScheduleDraft
): JpLessonManualSchedule | null {
  const normalized = normalizeDraft(draft);
  if (!normalized) return null;
  const ts = nowIso();
  const next: JpLessonManualSchedule = {
    id: createManualScheduleId(),
    ...normalized,
    created_at: ts,
    updated_at: ts,
  };
  const schedules = readJpLessonManualSchedules();
  schedules.push(next);
  writeJpLessonManualSchedules(schedules);
  return next;
}

export function updateJpLessonManualSchedule(
  id: string,
  draft: JpLessonManualScheduleDraft
): JpLessonManualSchedule | null {
  const normalized = normalizeDraft(draft);
  if (!normalized) return null;
  const schedules = readJpLessonManualSchedules();
  const index = schedules.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const updated: JpLessonManualSchedule = {
    ...schedules[index],
    ...normalized,
    updated_at: nowIso(),
  };
  schedules[index] = updated;
  writeJpLessonManualSchedules(schedules);
  return updated;
}

export function deleteJpLessonManualSchedule(id: string): boolean {
  const schedules = readJpLessonManualSchedules();
  const next = schedules.filter((item) => item.id !== id);
  if (next.length === schedules.length) return false;
  writeJpLessonManualSchedules(next);
  return true;
}

export type JpLessonSchedulePageEvent = {
  key: string;
  classAt: string;
  start: Date;
  end: Date;
  durationMinutes: number;
  teachers: string;
  displayContent: string;
  source: "lesson" | "manual";
  lessonId?: number;
  scheduleId?: number;
  lesson?: {
    id: number;
    content: string;
    ref_key: string | null;
  };
  manualId?: string;
  manualNote?: string;
};

export function manualScheduleToPageEvent(
  manual: JpLessonManualSchedule
): JpLessonSchedulePageEvent | null {
  const start = parseBeijingDateTime(manual.class_at);
  if (!start) return null;
  const durationMinutes = resolveClassDurationMinutes(manual.duration_minutes);
  return {
    key: `manual-${manual.id}`,
    classAt: manual.class_at,
    start,
    end: new Date(start.getTime() + durationMinutes * 60_000),
    durationMinutes,
    teachers: manual.teacher.trim() || "手动日程",
    displayContent: manual.title,
    source: "manual",
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
