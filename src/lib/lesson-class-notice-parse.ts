/**
 * 从「课程签到成功通知」等粘贴文本里拆出任课教师、上课日期与时间。
 * 供 /en-lesson、/jp-lesson「设置上课时间」文字拆解框使用。
 */

export type LessonClassNoticeParseResult = {
  teacherName: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:mm */
  time: string | null;
};

const TEACHER_LABEL_RE =
  /(?:任课教师|上课老师|授课教师|教师|老师)\s*[:：]?\s*([^\s\n\r]+)/u;

const DATETIME_LABEL_RE =
  /(?:上课时间|开课时间|课程时间)\s*[:：]?\s*([^\n\r]+)/u;

const DATE_TIME_INLINE_RE =
  /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s+(\d{1,2})\s*[:：点]\s*(\d{1,2})/;

const DATE_ONLY_RE =
  /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/;

const TIME_ONLY_RE = /(\d{1,2})\s*[:：点]\s*(\d{1,2})/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeDateParts(
  y: string,
  m: string,
  d: string
): string | null {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function normalizeTimeParts(h: string, min: string): string | null {
  const hour = Number(h);
  const minute = Number(min);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return `${pad2(hour)}:${pad2(minute)}`;
}

function cleanTeacherName(raw: string): string | null {
  const name = raw
    .trim()
    .replace(/^[:：\-|｜]+/, "")
    .replace(/[:：\-|｜]+$/, "")
    .trim();
  if (!name) return null;
  // 过滤明显不是姓名的占位
  if (/^(无|暂无|待定|—|-|－)$/u.test(name)) return null;
  return name;
}

function parseDateTimeChunk(chunk: string): {
  date: string | null;
  time: string | null;
} {
  const text = chunk.trim();
  if (!text) return { date: null, time: null };

  const inline = text.match(DATE_TIME_INLINE_RE);
  if (inline) {
    return {
      date: normalizeDateParts(inline[1], inline[2], inline[3]),
      time: normalizeTimeParts(inline[4], inline[5]),
    };
  }

  const dateMatch = text.match(DATE_ONLY_RE);
  const timeMatch = text.match(TIME_ONLY_RE);
  return {
    date: dateMatch
      ? normalizeDateParts(dateMatch[1], dateMatch[2], dateMatch[3])
      : null,
    time: timeMatch ? normalizeTimeParts(timeMatch[1], timeMatch[2]) : null,
  };
}

/** 解析签到通知 / 课表粘贴文本；识别不到的字段为 null。 */
export function parseLessonClassNoticeText(
  raw: string
): LessonClassNoticeParseResult {
  const text = (raw || "").replace(/\u00a0/g, " ").trim();
  if (!text) {
    return { teacherName: null, date: null, time: null };
  }

  let teacherName: string | null = null;
  const teacherMatch = text.match(TEACHER_LABEL_RE);
  if (teacherMatch) {
    teacherName = cleanTeacherName(teacherMatch[1]);
  }

  let date: string | null = null;
  let time: string | null = null;

  const labeled = text.match(DATETIME_LABEL_RE);
  if (labeled) {
    const parsed = parseDateTimeChunk(labeled[1]);
    date = parsed.date;
    time = parsed.time;
  }

  if (!date || !time) {
    const fallback = parseDateTimeChunk(text);
    date = date ?? fallback.date;
    time = time ?? fallback.time;
  }

  return { teacherName, date, time };
}

export type LessonTeacherNameMatch<T extends { id: number; name: string }> = {
  teacher: T | null;
  /** 是否需要在保存时新建 */
  willCreate: boolean;
  query: string;
};

/** 按称呼精确匹配（忽略大小写与空白）；没有则标记 willCreate。 */
export function matchLessonTeacherByNoticeName<
  T extends { id: number; name: string },
>(
  teachers: T[],
  rawName: string | null | undefined
): LessonTeacherNameMatch<T> | null {
  const query = (rawName || "").trim();
  if (!query) return null;

  const key = query.replace(/\s+/g, "").toLowerCase();
  const exact = teachers.filter(
    (t) => t.name.trim().replace(/\s+/g, "").toLowerCase() === key
  );
  if (exact.length === 1) {
    return { teacher: exact[0], willCreate: false, query };
  }
  if (exact.length > 1) {
    // 同名多条：取 id 最小的，仍算已匹配（不新建）
    const sorted = [...exact].sort((a, b) => a.id - b.id);
    return { teacher: sorted[0], willCreate: false, query };
  }
  return { teacher: null, willCreate: true, query };
}
