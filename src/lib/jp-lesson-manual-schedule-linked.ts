import {
  formatLessonContentLines,
  jpLessonProgressSortRank,
  normalizeClassAtForCompare,
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
  /** 合传教材名（如「标日23课」/「托业词汇」）；展示优先于 title */
  course_label: string | null;
  uploaded_at: string;
  completed: boolean;
  learning?: boolean;
};

/** 弹窗列表用：教材显示名（course_label → title → 内容首词） */
export function manualScheduleLessonDisplayName(
  lesson: Pick<ManualScheduleLessonOption, "course_label" | "title" | "content" | "id">
): string {
  const label = (lesson.course_label || "").trim();
  if (label) return label;
  const title = (lesson.title || "").trim();
  if (title) return title;
  const first = formatLessonContentLines(lesson.content, 4)[0]?.trim();
  return first || `教材 #${lesson.id}`;
}

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
  const preview = manualScheduleLessonDisplayName(lesson);
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

/** 新课日程槽（去重前亦可）：用于判断手动关联教材是否已同堂出现 */
export type ManualScheduleLinkedLessonSlot = {
  subject: ManualScheduleLinkedLessonSubject;
  lessonId: number;
  classAt: string;
};

/**
 * 手动日程已选教材，且该教材已在同一上课时间出现在新课日程里 →
 * 网页/CalDAV 不应再单独画一条「手动」（关联同步会写入新课时间，否则同堂两条）。
 */
export function manualScheduleHasLinkedLessonOnSameSlot(
  manual: {
    class_at: string;
    linked_lessons?: ManualScheduleLinkedLesson[] | null;
  },
  lessonSlots: ManualScheduleLinkedLessonSlot[]
): boolean {
  const links = normalizeManualScheduleLinkedLessons(manual.linked_lessons);
  if (!links.length || !lessonSlots.length) return false;
  const manualAt = normalizeClassAtForCompare(manual.class_at);
  for (const link of links) {
    for (const slot of lessonSlots) {
      if (slot.subject !== link.subject) continue;
      if (slot.lessonId !== link.lesson_id) continue;
      if (normalizeClassAtForCompare(slot.classAt) === manualAt) return true;
    }
  }
  return false;
}

/**
 * 在已合并的新课事件里，找到应对接该手动日程的那条（同科目 + 同开始时间）。
 * 用去重前的 slot 判定覆盖，再用去重后事件承接 manualId（单词+语法合并后 lessonId 可能只剩其一）。
 */
export function findDedupedLessonEventForManualLinkedCover<
  T extends { subject: string; classAt: string },
>(
  dedupedLessonEvents: T[],
  manual: {
    class_at: string;
    linked_lessons?: ManualScheduleLinkedLesson[] | null;
  },
  lessonSlots: ManualScheduleLinkedLessonSlot[]
): T | null {
  if (!manualScheduleHasLinkedLessonOnSameSlot(manual, lessonSlots)) return null;
  const links = normalizeManualScheduleLinkedLessons(manual.linked_lessons);
  const manualAt = normalizeClassAtForCompare(manual.class_at);
  const subjects = new Set(
    lessonSlots
      .filter(
        (slot) =>
          normalizeClassAtForCompare(slot.classAt) === manualAt &&
          links.some(
            (link) =>
              link.subject === slot.subject && link.lesson_id === slot.lessonId
          )
      )
      .map((slot) => slot.subject)
  );
  for (const event of dedupedLessonEvents) {
    if (!subjects.has(event.subject as ManualScheduleLinkedLessonSubject)) {
      continue;
    }
    if (normalizeClassAtForCompare(event.classAt) === manualAt) return event;
  }
  return null;
}

const PLACEHOLDER_TEACHER_NAMES = new Set(["未指定", "手动日程"]);

/**
 * 日程页老师展示常带费率后缀：`玉老师 · 60 / 1h`（formatTeacherLessonDisplayLabel）。
 * 同堂比对只认称呼，剥掉 ` · …` 后缀，否则手动「玉老师」对新课展示名永远匹配不上。
 */
export function stripScheduleTeacherDisplayExtras(token: string): string {
  const text = token.trim();
  if (!text) return "";
  const cut = text.indexOf(" · ");
  if (cut <= 0) return text;
  return text.slice(0, cut).trim();
}

/**
 * 老师展示名规范化（顿号/逗号拆分、去空白、剥费率后缀），用于同堂比对。
 * 禁止用空名或「未指定」参与匹配。
 */
export function normalizeScheduleTeacherNamesForCompare(
  teachers: string
): string[] {
  const names = teachers
    .split(/[、,，]/)
    .map((token) => stripScheduleTeacherDisplayExtras(token))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh"));
  if (!names.length) return [];
  if (names.every((name) => PLACEHOLDER_TEACHER_NAMES.has(name))) return [];
  return names;
}

export function scheduleTeacherNamesEqual(a: string, b: string): boolean {
  const left = normalizeScheduleTeacherNamesForCompare(a);
  const right = normalizeScheduleTeacherNamesForCompare(b);
  if (!left.length || !right.length) return false;
  if (left.length !== right.length) return false;
  return left.every((name, index) => name === right[index]);
}

/**
 * 手动条与新课同老师 + 同一开始时间 + 同一时长 → 只保留新课同步条，丢弃手动展示。
 * （不要求已关联教材；关联同堂仍优先走 linked cover。）
 */
export function findDedupedLessonEventForManualTeacherSlotCover<
  T extends { classAt: string; durationMinutes: number; teachers: string },
>(
  dedupedLessonEvents: T[],
  manual: {
    class_at: string;
    teacher: string;
    /** 已按标题解析后的时长（与网页/CalDAV 展示一致） */
    durationMinutes: number;
  }
): T | null {
  const manualTeacher = (manual.teacher ?? "").trim();
  if (!manualTeacher) return null;
  const manualAt = normalizeClassAtForCompare(manual.class_at);
  const duration = Math.round(Number(manual.durationMinutes));
  if (!Number.isFinite(duration) || duration <= 0) return null;

  for (const event of dedupedLessonEvents) {
    if (normalizeClassAtForCompare(event.classAt) !== manualAt) continue;
    if (Math.round(Number(event.durationMinutes)) !== duration) continue;
    if (!scheduleTeacherNamesEqual(event.teachers, manualTeacher)) continue;
    return event;
  }
  return null;
}

export function manualScheduleCoveredByLessonTeacherSlot(
  manual: {
    class_at: string;
    teacher: string;
    durationMinutes: number;
  },
  lessonEvents: Array<{
    classAt: string;
    durationMinutes: number;
    teachers: string;
  }>
): boolean {
  return (
    findDedupedLessonEventForManualTeacherSlotCover(lessonEvents, manual) !=
    null
  );
}
