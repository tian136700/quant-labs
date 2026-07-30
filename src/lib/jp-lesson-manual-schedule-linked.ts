import {
  formatLessonContentLines,
  jpLessonProgressSortRank,
} from "@/lib/jp-lesson-shared";

/** 手动日程可关联的教材科目（韩语暂无对应新课列表） */
export type ManualScheduleLinkedLessonSubject = "jp" | "en";

export type ManualScheduleLinkedLesson = {
  subject: ManualScheduleLinkedLessonSubject;
  lesson_id: number;
};

export const MANUAL_SCHEDULE_LINKED_LESSONS_MAX = 2;

export function isManualScheduleLinkedLessonSubject(
  value: unknown
): value is ManualScheduleLinkedLessonSubject {
  return value === "jp" || value === "en";
}

export function linkedLessonKey(link: ManualScheduleLinkedLesson): string {
  return `${link.subject}:${link.lesson_id}`;
}

/** 规范化关联教材：最多 2 条、去重、校验 id */
export function normalizeManualScheduleLinkedLessons(
  raw: unknown
): ManualScheduleLinkedLesson[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ManualScheduleLinkedLesson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!isManualScheduleLinkedLessonSubject(row.subject)) continue;
    const lessonId = Number(row.lesson_id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) continue;
    const link: ManualScheduleLinkedLesson = {
      subject: row.subject,
      lesson_id: lessonId,
    };
    const key = linkedLessonKey(link);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
    if (out.length >= MANUAL_SCHEDULE_LINKED_LESSONS_MAX) break;
  }
  return out;
}

export function serializeManualScheduleLinkedLessons(
  links: ManualScheduleLinkedLesson[]
): string {
  return JSON.stringify(normalizeManualScheduleLinkedLessons(links));
}

export function parseManualScheduleLinkedLessonsJson(
  raw: string | null | undefined
): ManualScheduleLinkedLesson[] {
  if (raw == null) return [];
  const text = String(raw).trim();
  if (!text) return [];
  try {
    return normalizeManualScheduleLinkedLessons(JSON.parse(text));
  } catch {
    return [];
  }
}

export type ManualScheduleLessonOption = {
  subject: ManualScheduleLinkedLessonSubject;
  id: number;
  kind: "word" | "grammar" | "word_grammar";
  content: string;
  title: string | null;
  completed: boolean;
  learning?: boolean;
};

export function formatManualScheduleLessonOptionLabel(
  lesson: ManualScheduleLessonOption
): string {
  const kind =
    lesson.kind === "grammar"
      ? "语法"
      : lesson.kind === "word_grammar"
        ? "单词加语法"
        : "单词";
  const subject =
    lesson.subject === "en" ? "英语" : lesson.subject === "jp" ? "日语" : "";
  const title = (lesson.title || "").trim();
  const preview =
    title || formatLessonContentLines(lesson.content, 4)[0]?.trim() || "（无内容）";
  const prefix = subject ? `${subject} · ` : "";
  return `#${lesson.id} ${prefix}${kind} · ${preview}`;
}

/** 学习中 → 未完成 → 已完成；同档 id 新的在前 */
export function sortManualScheduleLessonOptions(
  lessons: ManualScheduleLessonOption[]
): ManualScheduleLessonOption[] {
  return [...lessons].sort((a, b) => {
    const rank =
      jpLessonProgressSortRank(a) - jpLessonProgressSortRank(b);
    if (rank !== 0) return rank;
    return b.id - a.id;
  });
}
