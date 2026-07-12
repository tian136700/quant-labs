import {
  parseBeijingDateTime,
  resolveClassDurationMinutes,
} from "@/lib/jp-lesson-shared";

export const JP_LESSON_MANUAL_SCHEDULE_STORAGE_KEY = "jp-lesson-manual-schedules";

export type JpLessonManualSchedule = {
  id: number;
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

type LegacyJpLessonManualSchedule = {
  id: string;
  class_at: string;
  duration_minutes: number | null;
  title: string;
  teacher: string;
  note: string;
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

export async function fetchJpLessonManualSchedules(): Promise<JpLessonManualSchedule[]> {
  const res = await fetch("/api/jp-lesson/manual-schedules", {
    credentials: "include",
  });
  const data = await parseManualScheduleResponse(res);
  const schedules = data.schedules;
  if (!Array.isArray(schedules)) return [];
  return schedules as JpLessonManualSchedule[];
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
  const schedule = data.schedule;
  if (!schedule || typeof schedule !== "object") return null;
  return schedule as JpLessonManualSchedule;
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
  const schedule = data.schedule;
  if (!schedule || typeof schedule !== "object") return null;
  return schedule as JpLessonManualSchedule;
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
