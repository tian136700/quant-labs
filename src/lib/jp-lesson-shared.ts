/** 将上传时的 content 拆成单个单词/语法项（与后端入库逻辑一致） */
export function parseLessonContent(raw: string): string[] {
  return (raw || "")
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
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

function beijingDateStringFromDate(date: Date): string {
  const { y, m, d } = beijingDateParts(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseBeijingDateTime(raw: string): Date | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}+08:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function beijingTimeHm(date: Date): string {
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
  return match[2] === "30" ? `${hour} 点半` : `${hour} 点`;
}

/** 将任意 HH:mm 吸附到最近的整点/半点 */
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
  return {
    date: match[1],
    time: snapNextClassTimeToHalfHour(match[2]),
  };
}

export function nextClassAtFromDatetimeLocalValue(local: string): string | null {
  const trimmed = local.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return null;
  const time = snapNextClassTimeToHalfHour(match[2]);
  return `${match[1]} ${time}:00`;
}
