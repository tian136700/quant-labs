import {
  formatJpVocabExampleGlossLine,
  parseJpVocabExampleSentenceItems,
  serializeJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";
import type { JpLessonKind, JpVocabKind } from "@/lib/types";

/** 将上传时的 content 拆成单个单词/语法项（与后端入库逻辑一致） */
export function parseLessonContent(raw: string): string[] {
  return (raw || "")
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 规范化日语新课 kind（含单词加语法） */
export function normalizeJpLessonKind(raw?: string | null): JpLessonKind {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[+／/]/g, "_");
  if (v === "grammar") return "grammar";
  if (
    v === "word_grammar" ||
    v === "wordgrammar" ||
    v === "mixed" ||
    v === "both"
  ) {
    return "word_grammar";
  }
  return "word";
}

/** 列表「类型」文案：单词 / 语法 / 单词加语法 */
export function jpLessonKindLabel(kind: JpLessonKind | string | null | undefined): string {
  const k = normalizeJpLessonKind(kind);
  if (k === "grammar") return "语法";
  if (k === "word_grammar") return "单词加语法";
  return "单词";
}

/** 桌面窄列短标：词 / 法 / 词+法 */
export function jpLessonKindShortLabel(
  kind: JpLessonKind | string | null | undefined
): string {
  const k = normalizeJpLessonKind(kind);
  if (k === "grammar") return "法";
  if (k === "word_grammar") return "词+法";
  return "词";
}

/** 教案分页裁切：单词加语法按语法切段（常有序号方块） */
export function jpLessonCropKind(
  kind: JpLessonKind | string | null | undefined
): "word" | "grammar" {
  return normalizeJpLessonKind(kind) === "word" ? "word" : "grammar";
}

/**
 * 按课次 kind + grammar_item_count，给 content 每一项标 word/grammar。
 * word_grammar：末尾 grammar_item_count 项为语法，前面为单词。
 */
export function resolveJpLessonItemKinds(
  kind: JpLessonKind | string | null | undefined,
  itemCount: number,
  grammarItemCount: number | null | undefined
): JpVocabKind[] {
  const n = Math.max(0, Math.floor(itemCount) || 0);
  if (n <= 0) return [];
  const k = normalizeJpLessonKind(kind);
  if (k === "grammar") return Array.from({ length: n }, () => "grammar" as const);
  if (k === "word") return Array.from({ length: n }, () => "word" as const);
  const g = Math.max(0, Math.min(Math.floor(Number(grammarItemCount) || 0), n));
  const w = n - g;
  return [
    ...Array.from({ length: w }, () => "word" as const),
    ...Array.from({ length: g }, () => "grammar" as const),
  ];
}

/** 将上传时的 meanings 拆成与 content 一一对应的释义（用 | 分隔，避免释义内含逗号） */
export function parseLessonMeanings(raw: string | null | undefined): string[] {
  const text = (raw || "").trim();
  if (!text) return [];
  return text.split("|").map((s) => s.trim());
}

/**
 * 新课例句字段：与 content 各项用 `|||` 分隔（例句正文可含换行与「译文：」）。
 * 单项内部格式与日语抽问一致，例如：
 * 日语句
 * 译文：中文
 * 日语句
 * 译文：中文
 */
export const JP_LESSON_EXAMPLE_ITEM_SEP = "|||";

/** 每个单词/语法最多保留的日语例句条数（用户自定，上限 10） */
export const JP_LESSON_EXAMPLE_MAX_PER_ITEM = 10;

/** 将上传时的 example_sentences 拆成与 content 一一对应的例句块 */
export function parseLessonExampleSentenceBlocks(
  raw: string | null | undefined
): string[] {
  const text = (raw || "").trim();
  if (!text) return [];
  return text.split(JP_LESSON_EXAMPLE_ITEM_SEP).map((s) => s.trim());
}

/** 按 content 项数对齐例句块；缺失项为 null */
export function alignLessonItemExampleSentences(
  content: string,
  examplesRaw: string | null | undefined
): (string | null)[] {
  const items = parseLessonContent(content);
  const blocks = parseLessonExampleSentenceBlocks(examplesRaw);
  return items.map((_, index) => {
    const block = blocks[index];
    return block && block.trim() ? block.trim() : null;
  });
}

function normalizeOneLessonExampleBlock(raw: string): string | null {
  const items = parseJpVocabExampleSentenceItems(raw).slice(
    0,
    JP_LESSON_EXAMPLE_MAX_PER_ITEM
  );
  if (!items.length) return null;
  return serializeJpVocabExampleSentenceItems(items) || null;
}

/** 入库前规范化例句字符串（与 content 项数对齐，用 ||| 连接，单项最多 10 条） */
export function normalizeLessonExampleSentencesForStorage(
  content: string,
  examplesRaw: string | null | undefined
): string | null {
  const aligned = alignLessonItemExampleSentences(content, examplesRaw).map((block) =>
    block ? normalizeOneLessonExampleBlock(block) : null
  );
  if (!aligned.some(Boolean)) return null;
  return aligned.map((item) => item ?? "").join(JP_LESSON_EXAMPLE_ITEM_SEP);
}

/** 列表展示：把各词的例句压成可读摘要（多项用 · 分隔） */
export function formatLessonExampleSentencesSummary(
  content: string,
  examplesRaw: string | null | undefined
): string {
  const aligned = alignLessonItemExampleSentences(content, examplesRaw);
  if (!aligned.some(Boolean)) return "—";

  return (
    aligned
      .map((block, index) => {
        if (!block) return null;
        const parts = parseJpVocabExampleSentenceItems(block).map((item, i) => {
          const gloss = item.glossLines[0]
            ? formatJpVocabExampleGlossLine(item.glossLines[0])
            : "";
          return gloss ? `${i + 1}. ${item.text} / ${gloss}` : `${i + 1}. ${item.text}`;
        });
        if (!parts.length) return null;
        const label = parseLessonContent(content)[index] || `#${index + 1}`;
        return `${label}：${parts.join("；")}`;
      })
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

/** 按 content 项数对齐释义；缺失项为 null */
export function alignLessonItemMeanings(
  content: string,
  meaningsRaw: string | null | undefined
): (string | null)[] {
  const items = parseLessonContent(content);
  const meanings = parseLessonMeanings(meaningsRaw);
  return items.map((_, index) => {
    const meaning = meanings[index];
    return meaning && meaning.trim() ? meaning.trim() : null;
  });
}

/** 入库前规范化 meanings 字符串（与 content 项数对齐，用 | 连接） */
export function normalizeLessonMeaningsForStorage(
  content: string,
  meaningsRaw: string | null | undefined
): string | null {
  const aligned = alignLessonItemMeanings(content, meaningsRaw);
  if (!aligned.some(Boolean)) return null;
  return aligned.map((item) => item ?? "").join("|");
}

/** 将释义按每行若干项拆成多行（默认每行 3 个，与学习内容对齐） */
export function formatLessonMeaningsLines(
  content: string,
  meaningsRaw: string | null | undefined,
  perLine = 3
): string[] {
  const aligned = alignLessonItemMeanings(content, meaningsRaw);
  if (!aligned.some(Boolean)) return ["—"];
  const lines: string[] = [];
  for (let i = 0; i < aligned.length; i += perLine) {
    const chunk = aligned
      .slice(i, i + perLine)
      .map((item) => item || "—")
      .join(", ");
    lines.push(chunk);
  }
  return lines;
}

/** 将学习内容按每行若干项拆成多行（默认每行 3 个） */
export function formatLessonContentLines(raw: string, perLine = 3): string[] {
  const items = parseLessonContent(raw);
  if (!items.length) return raw.trim() ? [raw.trim()] : [""];
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += perLine) {
    lines.push(items.slice(i, i + perLine).join(", "));
  }
  return lines;
}

export type JpLessonProgressStatus = "pending" | "learning" | "completed";

export function getJpLessonProgressStatus(lesson: {
  completed: boolean;
  learning?: boolean;
}): JpLessonProgressStatus {
  if (lesson.completed) return "completed";
  if (lesson.learning) return "learning";
  return "pending";
}

export function jpLessonProgressToFields(
  status: JpLessonProgressStatus
): { completed: boolean; learning: boolean } {
  switch (status) {
    case "completed":
      return { completed: true, learning: false };
    case "learning":
      return { completed: false, learning: true };
    default:
      return { completed: false, learning: false };
  }
}

export function isJpLessonSyncedToVocab(lesson: {
  completed: boolean;
}): boolean {
  return lesson.completed;
}

/** 列表排序：学习中 → 未完成 → 已完成 */
export function jpLessonProgressSortRank(lesson: {
  completed: boolean;
  learning?: boolean;
}): number {
  const status = getJpLessonProgressStatus(lesson);
  switch (status) {
    case "learning":
      return 0;
    case "pending":
      return 1;
    case "completed":
      return 2;
  }
}

export function jpLessonRecentOperationAt(lesson: {
  status_updated_at?: string | null;
  uploaded_at: string;
}): string {
  return lesson.status_updated_at ?? lesson.uploaded_at;
}

export function compareJpLessonsByRecentOperation(
  a: { status_updated_at?: string | null; uploaded_at: string; id: number },
  b: { status_updated_at?: string | null; uploaded_at: string; id: number }
): number {
  const dateCmp = jpLessonRecentOperationAt(b).localeCompare(jpLessonRecentOperationAt(a));
  if (dateCmp !== 0) return dateCmp;
  return b.id - a.id;
}

/** 列表内排序：最近操作升序；无最近操作记录时回退到上传时间 */
export function compareJpLessonsByRecentOperationAsc(
  a: { status_updated_at?: string | null; uploaded_at: string; id: number },
  b: { status_updated_at?: string | null; uploaded_at: string; id: number }
): number {
  const dateCmp = jpLessonRecentOperationAt(a).localeCompare(jpLessonRecentOperationAt(b));
  if (dateCmp !== 0) return dateCmp;
  return a.id - b.id;
}

export type JpLessonRecentOperationSortOrder = "asc" | "desc";

export function compareJpLessonsByRecentOperationOrder(
  order: JpLessonRecentOperationSortOrder
): typeof compareJpLessonsByRecentOperation {
  return order === "desc"
    ? compareJpLessonsByRecentOperation
    : compareJpLessonsByRecentOperationAsc;
}

export function compareJpLessonsByProgress(
  a: {
    completed: boolean;
    learning?: boolean;
    status_updated_at?: string | null;
    uploaded_at: string;
    id: number;
  },
  b: {
    completed: boolean;
    learning?: boolean;
    status_updated_at?: string | null;
    uploaded_at: string;
    id: number;
  }
): number {
  const rankCmp = jpLessonProgressSortRank(a) - jpLessonProgressSortRank(b);
  if (rankCmp !== 0) return rankCmp;
  return compareJpLessonsByRecentOperation(a, b);
}

type JpLessonClassScheduleLike = {
  class_schedules?: Array<{
    id: number;
    class_at: string;
    duration_minutes: number | null;
  }>;
  next_class_at?: string | null;
  class_duration_minutes?: number | null;
};

/** 将上课时间规范化为 YYYY-MM-DD HH:mm:00，便于排序与合并比对（保留真实分钟，勿半点吸附） */
export function normalizeClassAtForCompare(classAt: string): string {
  const parsed = parseBeijingDateTime(classAt);
  if (!parsed) return classAt.trim();
  const dateStr = beijingDateStringFromDate(parsed);
  const timeStr =
    normalizeNextClassTimeHm(beijingTimeHm(parsed)) ?? beijingTimeHm(parsed);
  return `${dateStr} ${timeStr}:00`;
}

/** 取课程最早一条预约上课时间（用于列表排序与合并） */
export function getLessonEarliestClassAt(lesson: JpLessonClassScheduleLike): string | null {
  const primary = getLessonPrimaryClassSchedule(lesson);
  return primary?.class_at ?? null;
}

/** 取课程最早一条预约时段（用于列表排序与合并） */
export function getLessonPrimaryClassSchedule(lesson: JpLessonClassScheduleLike): {
  id: number;
  class_at: string;
  duration_minutes: number | null;
} | null {
  const schedules = getLessonClassSchedules(lesson);
  if (!schedules.length) return null;
  let primary = schedules[0];
  for (let i = 1; i < schedules.length; i += 1) {
    if (schedules[i].class_at < primary.class_at) primary = schedules[i];
  }
  return primary;
}

/** 列表内排序：上课时间升序；未设置时间的排到最后 */
export function compareJpLessonsByClassTime(
  a: {
    class_schedules?: Array<{
      class_at: string;
      duration_minutes: number | null;
      id: number;
    }>;
    next_class_at?: string | null;
    class_duration_minutes?: number | null;
    status_updated_at?: string | null;
    uploaded_at: string;
    id: number;
  },
  b: {
    class_schedules?: Array<{
      class_at: string;
      duration_minutes: number | null;
      id: number;
    }>;
    next_class_at?: string | null;
    class_duration_minutes?: number | null;
    status_updated_at?: string | null;
    uploaded_at: string;
    id: number;
  }
): number {
  const aAt = getLessonEarliestClassAt(a);
  const bAt = getLessonEarliestClassAt(b);
  if (!aAt && !bAt) return compareJpLessonsByRecentOperation(a, b);
  if (!aAt) return 1;
  if (!bAt) return -1;
  const cmp = normalizeClassAtForCompare(aAt).localeCompare(normalizeClassAtForCompare(bAt));
  if (cmp !== 0) return cmp;
  return compareJpLessonsByRecentOperation(a, b);
}

/** 列表内排序：上课时间降序；未设置时间的仍排最后 */
export function compareJpLessonsByClassTimeDesc(
  a: Parameters<typeof compareJpLessonsByClassTime>[0],
  b: Parameters<typeof compareJpLessonsByClassTime>[1]
): number {
  const aAt = getLessonEarliestClassAt(a);
  const bAt = getLessonEarliestClassAt(b);
  if (!aAt && !bAt) return compareJpLessonsByRecentOperation(a, b);
  if (!aAt) return 1;
  if (!bAt) return -1;
  const cmp = normalizeClassAtForCompare(bAt).localeCompare(normalizeClassAtForCompare(aAt));
  if (cmp !== 0) return cmp;
  return compareJpLessonsByRecentOperation(a, b);
}

export type JpLessonClassTimeSortOrder = "asc" | "desc";

export function compareJpLessonsByClassTimeOrder(
  order: JpLessonClassTimeSortOrder
): typeof compareJpLessonsByClassTime {
  return order === "asc" ? compareJpLessonsByClassTime : compareJpLessonsByClassTimeDesc;
}

/** 同一老师、同一开始时间可合并展示（同一小时内的多个教材） */
export function buildLessonClassSlotMergeKey(lesson: {
  teacher_ids?: number[];
  teacher_other?: string | null;
  class_schedules?: Array<{
    class_at: string;
    duration_minutes: number | null;
    id: number;
  }>;
  next_class_at?: string | null;
  class_duration_minutes?: number | null;
}): string | null {
  const primary = getLessonPrimaryClassSchedule(lesson);
  if (!primary) return null;
  const teacherIds = [...(lesson.teacher_ids ?? [])].sort((a, b) => a - b).join(",");
  const teacherOther = (lesson.teacher_other ?? "").trim();
  return `${teacherIds}|${teacherOther}|${normalizeClassAtForCompare(primary.class_at)}`;
}

export type JpLessonDisplayGroup<T extends { id: number }> = {
  key: string;
  mergeKey: string | null;
  lessons: T[];
};

type JpLessonDisplayGroupLesson = {
  id: number;
  teacher_ids?: number[];
  teacher_other?: string | null;
  class_schedules?: Array<{
    class_at: string;
    duration_minutes: number | null;
    id: number;
  }>;
  next_class_at?: string | null;
  class_duration_minutes?: number | null;
};

function groupSortedJpLessonsIntoDisplayGroups<T extends JpLessonDisplayGroupLesson>(
  sorted: T[]
): JpLessonDisplayGroup<T>[] {
  const groups: JpLessonDisplayGroup<T>[] = [];
  const mergeIndexByKey = new Map<string, number>();

  for (const lesson of sorted) {
    const mergeKey = buildLessonClassSlotMergeKey(lesson);
    if (mergeKey != null) {
      const existingIdx = mergeIndexByKey.get(mergeKey);
      if (existingIdx != null) {
        groups[existingIdx].lessons.push(lesson);
        continue;
      }
    }
    const group: JpLessonDisplayGroup<T> = {
      key: mergeKey ?? `solo-${lesson.id}`,
      mergeKey,
      lessons: [lesson],
    };
    groups.push(group);
    if (mergeKey != null) {
      mergeIndexByKey.set(mergeKey, groups.length - 1);
    }
  }

  return groups;
}

/** 按上课时间排序，并将同老师同档期的多条新课合并为一组 */
export function buildJpLessonDisplayGroups<T extends JpLessonDisplayGroupLesson & {
  status_updated_at?: string | null;
  uploaded_at: string;
}>(lessons: T[], sortOrder: JpLessonClassTimeSortOrder = "asc"): JpLessonDisplayGroup<T>[] {
  const sorted = [...lessons].sort(compareJpLessonsByClassTimeOrder(sortOrder));
  return groupSortedJpLessonsIntoDisplayGroups(sorted);
}

/** 按最近操作时间排序，并将同老师同档期的多条新课合并为一组 */
export function buildJpLessonDisplayGroupsByRecentOperation<T extends JpLessonDisplayGroupLesson & {
  status_updated_at?: string | null;
  uploaded_at: string;
}>(
  lessons: T[],
  sortOrder: JpLessonRecentOperationSortOrder = "desc"
): JpLessonDisplayGroup<T>[] {
  const sorted = [...lessons].sort(compareJpLessonsByRecentOperationOrder(sortOrder));
  return groupSortedJpLessonsIntoDisplayGroups(sorted);
}

/** 列表内排序：ID 升序（未完成区：先上传的基础课优先） */
export function compareJpLessonsByIdAsc(
  a: { id: number },
  b: { id: number }
): number {
  return a.id - b.id;
}

/**
 * 按 ID 升序分组展示。同老师同档期仍合并为一行；
 * 组与组之间、组内课次均按最小 / 各自 ID 从小到大（未完成区专用）。
 */
export function buildJpLessonDisplayGroupsById<T extends JpLessonDisplayGroupLesson>(
  lessons: T[]
): JpLessonDisplayGroup<T>[] {
  const sorted = [...lessons].sort(compareJpLessonsByIdAsc);
  const groups = groupSortedJpLessonsIntoDisplayGroups(sorted);
  for (const group of groups) {
    group.lessons.sort(compareJpLessonsByIdAsc);
  }
  // 再按组内最小 ID 排一次，避免合并后组序被打乱
  groups.sort((a, b) => a.lessons[0].id - b.lessons[0].id);
  return groups;
}

/** 「学习中」列表按上课日区分背景色时的色阶数量 */
export const JP_LESSON_LEARNING_DAY_TONE_COUNT = 6;

/** 取课程最早一条预约的上课日期（北京时间 YYYY-MM-DD） */
export function getLessonClassDate(lesson: JpLessonClassScheduleLike): string | null {
  const classAt = getLessonEarliestClassAt(lesson);
  if (!classAt) return null;
  const parsed = parseBeijingDateTime(classAt);
  if (parsed) return beijingDateStringFromDate(parsed);
  return beijingDateOnlyFromClassAt(classAt);
}

/** 为「学习中」各上课日分配色阶（按日期从早到晚循环，同一天同色） */
export function buildLearningClassDayToneMap<T extends JpLessonClassScheduleLike>(
  groups: Array<{ lessons: T[] }>
): Map<string, number> {
  const dates = new Set<string>();
  for (const group of groups) {
    const date = getLessonClassDate(group.lessons[0]);
    if (date) dates.add(date);
  }
  const map = new Map<string, number>();
  [...dates].sort().forEach((date, index) => {
    map.set(date, index % JP_LESSON_LEARNING_DAY_TONE_COUNT);
  });
  return map;
}

const BEIJING_TZ = "Asia/Shanghai";
const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"] as const;

function beijingDateParts(date: Date): { y: number; m: number; d: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BEIJING_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const weekdayRaw = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    weekday: weekdayMap[weekdayRaw] ?? 0,
  };
}

export function beijingDateStringFromDate(date: Date): string {
  const { y, m, d } = beijingDateParts(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function beijingTodayDateString(now = new Date()): string {
  return beijingDateStringFromDate(now);
}

export function beijingDateOnlyFromClassAt(classAt: string): string | null {
  const match = classAt.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function parseBeijingDateTime(raw: string): Date | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}+08:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function beijingTimeHm(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

function beijingMonthDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TZ,
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}月${get("day")}日`;
}

function addBeijingDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** 北京时间周一 00:00 对应的 UTC 时间戳（用于比较周） */
function beijingWeekStartUtcMs(date: Date): number {
  const { weekday } = beijingDateParts(date);
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = addBeijingDays(date, mondayOffset);
  const dateStr = beijingDateStringFromDate(monday);
  const parsed = parseBeijingDateTime(`${dateStr} 00:00:00`);
  return parsed?.getTime() ?? date.getTime();
}

/** 读取课程的预约上课时间（兼容旧单条 next_class_at 字段） */
export function getLessonClassSchedules(lesson: {
  class_schedules?: Array<{
    id: number;
    class_at: string;
    duration_minutes: number | null;
  }>;
  next_class_at?: string | null;
  class_duration_minutes?: number | null;
}): Array<{ id: number; class_at: string; duration_minutes: number | null }> {
  if (lesson.class_schedules?.length) return lesson.class_schedules;
  if (lesson.next_class_at?.trim()) {
    return [
      {
        id: 0,
        class_at: lesson.next_class_at.trim(),
        duration_minutes: lesson.class_duration_minutes ?? null,
      },
    ];
  }
  return [];
}

/** 将存储的下次上课时间格式化为列表展示文案 */
export function formatNextClassAtLabel(
  nextClassAt: string | null | undefined,
  progressStatus: JpLessonProgressStatus,
  now = new Date()
): string {
  if (progressStatus === "completed") return "已上完课";
  if (!nextClassAt?.trim()) return "未定义";

  const target = parseBeijingDateTime(nextClassAt);
  if (!target) return "未定义";

  const timeStr = beijingTimeHm(target);
  const todayStr = beijingDateStringFromDate(now);
  const targetStr = beijingDateStringFromDate(target);

  if (targetStr === todayStr) return `今天 ${timeStr}`;

  const yesterdayStr = beijingDateStringFromDate(addBeijingDays(now, -1));
  if (targetStr === yesterdayStr) return `昨天 ${timeStr}`;

  const tomorrowStr = beijingDateStringFromDate(addBeijingDays(now, 1));
  if (targetStr === tomorrowStr) return `明天 ${timeStr}`;

  const weekStartNow = beijingWeekStartUtcMs(now);
  const weekStartTarget = beijingWeekStartUtcMs(target);
  const weekDiff = Math.round((weekStartTarget - weekStartNow) / (7 * 86_400_000));
  const weekdayShort = WEEKDAY_SHORT[beijingDateParts(target).weekday];

  if (weekDiff === 0) return `本周${weekdayShort} ${timeStr}`;
  if (weekDiff === 1) return `下周${weekdayShort} ${timeStr}`;

  return `${beijingMonthDay(target)} ${timeStr}`;
}

/** 移动端紧凑格式：MM-DD H:mm（纯数字，无「今天/本周」等相对文案） */
export function formatNextClassAtLabelCompact(
  nextClassAt: string | null | undefined,
  progressStatus: JpLessonProgressStatus
): string {
  if (progressStatus === "completed") return "已上完课";
  if (!nextClassAt?.trim()) return "—";

  const target = parseBeijingDateTime(nextClassAt);
  if (!target) return "—";

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TZ,
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(target);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** datetime-local 输入值 ↔ 数据库存储（北京时间 YYYY-MM-DD HH:mm:ss） */
export function nextClassAtToDatetimeLocalValue(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const match = raw.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : "";
}

/** 上课时间可选刻度：整点 / 半点（共 48 项） */
export function listNextClassHalfHourTimes(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    const hh = String(h).padStart(2, "0");
    slots.push(`${hh}:00`, `${hh}:30`);
  }
  return slots;
}

export function formatNextClassHalfHourLabel(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;
  const hour = Number(match[1]);
  return `${hour}:${match[2]}`;
}

/** 校验并补零 HH:mm（0–23 / 0–59）；非法返回 null。不要做半点吸附。 */
export function normalizeNextClassTimeHm(time: string): string | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * 将任意 HH:mm 吸附到最近的整点/半点。
 * 仅保留兼容；保存 / 回显 / 比对请用 normalizeNextClassTimeHm，禁止再吸附。
 */
export function snapNextClassTimeToHalfHour(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "09:00";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute < 15) return `${String(hour).padStart(2, "0")}:00`;
  if (minute < 45) return `${String(hour).padStart(2, "0")}:30`;
  const nextHour = (hour + 1) % 24;
  return `${String(nextHour).padStart(2, "0")}:00`;
}

export function splitNextClassAtLocalValue(
  local: string
): { date: string; time: string } | null {
  const trimmed = local.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return null;
  const time = normalizeNextClassTimeHm(match[2]);
  if (!time) return null;
  return {
    date: match[1],
    time,
  };
}

export function nextClassAtFromDatetimeLocalValue(local: string): string | null {
  const trimmed = local.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return null;
  const time = normalizeNextClassTimeHm(match[2]);
  if (!time) return null;
  return `${match[1]} ${time}:00`;
}

export const JP_LESSON_CLASS_DURATION_MINUTES = [20, 25, 30, 45, 55, 60] as const;

export type JpLessonClassDurationMinutes =
  (typeof JP_LESSON_CLASS_DURATION_MINUTES)[number];

export function normalizeClassDurationMinutes(
  raw: number | null | undefined
): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return JP_LESSON_CLASS_DURATION_MINUTES.includes(n as JpLessonClassDurationMinutes)
    ? n
    : null;
}

export function formatClassDurationLabel(
  minutes: number | null | undefined
): string | null {
  const normalized = normalizeClassDurationMinutes(minutes);
  if (normalized == null) return null;
  return `时长：${normalized}min`;
}

export function formatClassDurationLabelCompact(
  minutes: number | null | undefined
): string | null {
  const normalized = normalizeClassDurationMinutes(minutes);
  if (normalized == null) return null;
  return `${normalized}min`;
}

/** 日程视图未填写时长时的默认分钟数 */
export const DEFAULT_JP_LESSON_CLASS_DURATION_MINUTES = 55;

export type JpLessonScheduleEvent = {
  key: string;
  lessonId: number;
  scheduleId: number;
  classAt: string;
  start: Date;
  end: Date;
  durationMinutes: number;
};

export function resolveClassDurationMinutes(
  minutes: number | null | undefined
): number {
  return normalizeClassDurationMinutes(minutes) ?? DEFAULT_JP_LESSON_CLASS_DURATION_MINUTES;
}

export function formatLessonScheduleDurationLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}小时${String(minutes).padStart(2, "0")}分`;
}

export function formatLessonScheduleDaySummary(
  events: Array<{ durationMinutes: number }>,
  options?: { classUnit?: "节" | "节课"; emptyLabel?: string }
): string {
  const classUnit = options?.classUnit ?? "节";
  const emptyLabel = options?.emptyLabel ?? "无课";
  if (!events.length) return emptyLabel;
  const totalMinutes = events.reduce((sum, event) => sum + event.durationMinutes, 0);
  return `${events.length}${classUnit}（${formatLessonScheduleDurationLabel(totalMinutes)}）`;
}

/** 日程 / ICS：学习中 + 已完成进日程；未上课不同步（上完课仍应留在当天列） */
export function jpLessonProgressAppearsOnSchedule(lesson: {
  completed?: boolean;
  learning?: boolean;
}): boolean {
  const status = getJpLessonProgressStatus({
    completed: Boolean(lesson.completed),
    learning: Boolean(lesson.learning),
  });
  return status === "learning" || status === "completed";
}

export function buildJpLessonScheduleEvents(lesson: {
  id: number;
  /** 学习中 + 已完成进入日程 / ICS；未上课不同步 */
  completed?: boolean;
  learning?: boolean;
  class_schedules?: Array<{
    id: number;
    class_at: string;
    duration_minutes: number | null;
  }>;
  next_class_at?: string | null;
  class_duration_minutes?: number | null;
}): JpLessonScheduleEvent[] {
  if (!jpLessonProgressAppearsOnSchedule(lesson)) {
    return [];
  }
  const events: JpLessonScheduleEvent[] = [];
  for (const schedule of getLessonClassSchedules(lesson)) {
    const start = parseBeijingDateTime(schedule.class_at);
    if (!start) continue;
    const durationMinutes = resolveClassDurationMinutes(schedule.duration_minutes);
    events.push({
      key: `${lesson.id}-${schedule.id}-${schedule.class_at}`,
      lessonId: lesson.id,
      scheduleId: schedule.id,
      classAt: schedule.class_at,
      start,
      end: new Date(start.getTime() + durationMinutes * 60_000),
      durationMinutes,
    });
  }
  return events;
}

/**
 * 「上课中」可标记 / 展示窗口：相对开课时刻前后各这么多分钟。
 * 例：10:00 开课 → 09:50～10:10 都算上课中。
 */
export const JP_LESSON_IN_CLASS_MARK_WINDOW_MINUTES = 10;

/**
 * 「上课中」：用日程的开课时刻（`class_at`）；北京时间 now 落在
 * [开课前 N 分钟, 开课后 N 分钟]（N=`JP_LESSON_IN_CLASS_MARK_WINDOW_MINUTES`）即算。
 * 不限定老师；未上课（pending）不同步日程，自然不会命中。
 */
export function isJpLessonCurrentlyInClass(
  lesson: Parameters<typeof buildJpLessonScheduleEvents>[0],
  now: Date = new Date()
): boolean {
  const t = now.getTime();
  const windowMs = JP_LESSON_IN_CLASS_MARK_WINDOW_MINUTES * 60_000;
  return buildJpLessonScheduleEvents(lesson).some((event) => {
    const startMs = event.start.getTime();
    return startMs - windowMs <= t && t <= startMs + windowMs;
  });
}

export function flattenJpLessonScheduleEvents(
  lessons: Array<Parameters<typeof buildJpLessonScheduleEvents>[0]>
): JpLessonScheduleEvent[] {
  return lessons
    .flatMap((lesson) => buildJpLessonScheduleEvents(lesson))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function beijingMinutesFromMidnight(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BEIJING_TZ,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function addBeijingCalendarDays(dateStr: string, days: number): string {
  const parsed = parseBeijingDateTime(`${dateStr} 12:00:00`);
  if (!parsed) return dateStr;
  return beijingDateStringFromDate(addBeijingDays(parsed, days));
}

export function beijingWeekStartDate(dateStr: string): string {
  const parsed = parseBeijingDateTime(`${dateStr} 12:00:00`);
  if (!parsed) return dateStr;
  const { weekday } = beijingDateParts(parsed);
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return addBeijingCalendarDays(dateStr, mondayOffset);
}

export function beijingMonthGridDates(dateStr: string): string[] {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const firstStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const parsed = parseBeijingDateTime(`${firstStr} 12:00:00`);
  if (!parsed) return [];
  const { weekday } = beijingDateParts(parsed);
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const gridStart = addBeijingCalendarDays(firstStr, mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addBeijingCalendarDays(gridStart, index));
}

export function beijingWeekdayLabel(dateStr: string): string {
  const parsed = parseBeijingDateTime(`${dateStr} 12:00:00`);
  if (!parsed) return "";
  return `周${WEEKDAY_SHORT[beijingDateParts(parsed).weekday]}`;
}

/** 日程导航用：今天/明天/本周X/下周X，其余仅显示周几 */
export function beijingRelativeWeekdayLabel(dateStr: string, now = new Date()): string {
  const parsed = parseBeijingDateTime(`${dateStr} 12:00:00`);
  if (!parsed) return beijingWeekdayLabel(dateStr);

  const todayStr = beijingDateStringFromDate(now);
  const targetStr = beijingDateStringFromDate(parsed);

  if (targetStr === todayStr) return "今天";

  const yesterdayStr = beijingDateStringFromDate(addBeijingDays(now, -1));
  if (targetStr === yesterdayStr) return "昨天";

  const tomorrowStr = beijingDateStringFromDate(addBeijingDays(now, 1));
  if (targetStr === tomorrowStr) return "明天";

  const weekStartNow = beijingWeekStartUtcMs(now);
  const weekStartTarget = beijingWeekStartUtcMs(parsed);
  const weekDiff = Math.round((weekStartTarget - weekStartNow) / (7 * 86_400_000));
  const weekdayShort = WEEKDAY_SHORT[beijingDateParts(parsed).weekday];

  if (weekDiff === 0) return `本周${weekdayShort}`;
  if (weekDiff === 1) return `下周${weekdayShort}`;
  return `周${weekdayShort}`;
}

export type JpLessonScheduleEventStatus = "past" | "ongoing" | "upcoming";

export function getJpLessonScheduleEventStatus(
  event: { start: Date; end: Date },
  now = new Date()
): JpLessonScheduleEventStatus {
  const ts = now.getTime();
  if (ts >= event.end.getTime()) return "past";
  if (ts >= event.start.getTime()) return "ongoing";
  return "upcoming";
}
