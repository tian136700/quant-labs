import "server-only";

import { listEnLessons } from "@/lib/en-lesson-db";
import { flattenEnLessonScheduleEvents } from "@/lib/en-lesson-shared";
import { listEnLessonTeachers } from "@/lib/en-lesson-teacher-db";
import { listJpLessons } from "@/lib/jp-lesson-db";
import {
  flattenJpLessonScheduleEvents,
  formatLessonContentLines,
  resolveClassDurationMinutes,
} from "@/lib/jp-lesson-shared";
import { listJpLessonManualSchedules } from "@/lib/jp-lesson-manual-schedule-db";
import { listJpLessonTeachers } from "@/lib/jp-lesson-teacher-db";

export const SCHEDULE_CALDAV_UID_DOMAIN = "info-quests.schedule";

export type ScheduleCalDavEventSubject = "jp" | "en" | "manual";

export type ScheduleCalDavEvent = {
  uid: string;
  subject: ScheduleCalDavEventSubject;
  summary: string;
  description: string;
  class_at: string;
  duration_minutes: number;
  teachers: string;
  title: string;
  lesson_id?: number;
  schedule_id?: number;
  manual_id?: number;
  note?: string;
};

function teacherNameMap(
  teachers: Array<{ id: number; name: string }>
): Map<number, string> {
  const map = new Map<number, string>();
  for (const teacher of teachers) {
    map.set(teacher.id, teacher.name);
  }
  return map;
}

function formatLessonTeachers(
  lesson: {
    teacher_ids?: number[];
    teacher_other?: string | null;
  },
  nameById: Map<number, string>
): string {
  const names = (lesson.teacher_ids ?? [])
    .map((id) => nameById.get(id))
    .filter((name): name is string => Boolean(name));
  if (lesson.teacher_other?.trim()) {
    names.push(lesson.teacher_other.trim());
  }
  return names.length ? names.join("、") : "未指定";
}

function contentPreview(content: string, maxLen = 40): string {
  const first = formatLessonContentLines(content, 3)[0] ?? content.trim();
  if (first.length <= maxLen) return first;
  return `${first.slice(0, maxLen - 1)}…`;
}

function buildDescription(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

export async function listScheduleCalDavEvents(
  db: D1Database
): Promise<ScheduleCalDavEvent[]> {
  const [jpLessons, enLessons, manuals, jpTeachers, enTeachers] =
    await Promise.all([
      listJpLessons(db),
      listEnLessons(db),
      listJpLessonManualSchedules(db),
      listJpLessonTeachers(db),
      listEnLessonTeachers(db),
    ]);

  const jpNameById = teacherNameMap(jpTeachers);
  const enNameById = teacherNameMap(enTeachers);
  const jpLessonById = new Map(jpLessons.map((lesson) => [lesson.id, lesson]));
  const enLessonById = new Map(enLessons.map((lesson) => [lesson.id, lesson]));

  const events: ScheduleCalDavEvent[] = [];

  for (const event of flattenJpLessonScheduleEvents(jpLessons)) {
    const lesson = jpLessonById.get(event.lessonId);
    if (!lesson) continue;
    const teachers = formatLessonTeachers(lesson, jpNameById);
    const title = lesson.content.trim() || `日语课 #${lesson.id}`;
    const preview = contentPreview(title);
    events.push({
      uid: `jp-lesson-${event.lessonId}-${event.scheduleId}@${SCHEDULE_CALDAV_UID_DOMAIN}`,
      subject: "jp",
      summary: `日语课 · ${preview}`,
      description: buildDescription([
        `老师：${teachers}`,
        title,
        lesson.teacher_other ? `其他：${lesson.teacher_other}` : null,
      ]),
      class_at: event.classAt,
      duration_minutes: event.durationMinutes,
      teachers,
      title,
      lesson_id: event.lessonId,
      schedule_id: event.scheduleId,
    });
  }

  for (const event of flattenEnLessonScheduleEvents(enLessons)) {
    const lesson = enLessonById.get(event.lessonId);
    if (!lesson) continue;
    const teachers = formatLessonTeachers(lesson, enNameById);
    const title = lesson.content.trim() || `英语课 #${lesson.id}`;
    const preview = contentPreview(title);
    events.push({
      uid: `en-lesson-${event.lessonId}-${event.scheduleId}@${SCHEDULE_CALDAV_UID_DOMAIN}`,
      subject: "en",
      summary: `英语课 · ${preview}`,
      description: buildDescription([
        `老师：${teachers}`,
        title,
        lesson.teacher_other ? `其他：${lesson.teacher_other}` : null,
      ]),
      class_at: event.classAt,
      duration_minutes: event.durationMinutes,
      teachers,
      title,
      lesson_id: event.lessonId,
      schedule_id: event.scheduleId,
    });
  }

  for (const manual of manuals) {
    const title = manual.title.trim() || `手动日程 #${manual.id}`;
    const teachers = manual.teacher.trim() || "手动日程";
    events.push({
      uid: `manual-${manual.id}@${SCHEDULE_CALDAV_UID_DOMAIN}`,
      subject: "manual",
      summary: title,
      description: buildDescription([
        `老师/对象：${teachers}`,
        manual.note.trim() || null,
      ]),
      class_at: manual.class_at,
      duration_minutes: resolveClassDurationMinutes(manual.duration_minutes),
      teachers,
      title,
      manual_id: manual.id,
      note: manual.note.trim() || undefined,
    });
  }

  events.sort((a, b) => a.class_at.localeCompare(b.class_at));
  return events;
}

function icalEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldIcalLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return chunks.join("\r\n");
}

function classAtToIcalLocal(classAt: string): string | null {
  const match = classAt
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s = "00"] = match;
  return `${y}${mo}${d}T${h}${mi}${s}`;
}

function addMinutesToClassAt(classAt: string, minutes: number): string | null {
  const match = classAt
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s = "00"] = match;
  const start = new Date(
    Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s)
    )
  );
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + minutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${end.getUTCFullYear()}${pad(end.getUTCMonth() + 1)}${pad(end.getUTCDate())}T${pad(end.getUTCHours())}${pad(end.getUTCMinutes())}${pad(end.getUTCSeconds())}`;
}

/** Apple 日历订阅用 ICS。
 * 使用「浮动北京墙钟」（无 TZID）：手机即使设泰国时区，格子上也显示与网站相同的 13:00/14:00，
 * 不做当地换算（带 TZID=Asia/Shanghai 时，泰国手机会把 15:00 北京显示成 14:00）。
 */
export function buildScheduleIcs(
  events: ScheduleCalDavEvent[],
  options?: { calendarName?: string }
): string {
  const calendarName = options?.calendarName ?? "Info Quests 日程（北京时间）";
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//info-quests//schedule-ics//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldIcalLine(`X-WR-CALNAME:${icalEscape(calendarName)}`),
    "X-WR-CALDESC:时间均为北京时间（与网站日程一致，不按手机时区换算）",
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
  ];

  for (const event of events) {
    const start = classAtToIcalLocal(event.class_at);
    const end = addMinutesToClassAt(event.class_at, event.duration_minutes);
    if (!start || !end) continue;
    // UID 加 .bj 后缀，迫使已订阅的日历把旧时区事件换成墙钟事件
    const uid = event.uid.includes("@")
      ? event.uid.replace(/@info-quests\.schedule$/, "@info-quests.schedule.bj")
      : `${event.uid}@info-quests.schedule.bj`;
    const summary = event.summary;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      "SEQUENCE:3",
      `DTSTART:${start}`,
      `DTEND:${end}`,
      foldIcalLine(`SUMMARY:${icalEscape(summary)}`)
    );
    const description = [
      "时间：北京时间（与网站一致）",
      event.description.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    if (description) {
      lines.push(foldIcalLine(`DESCRIPTION:${icalEscape(description)}`));
    }
    lines.push(
      "CATEGORIES:info-quests-schedule",
      "TRANSP:OPAQUE",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:上课提醒（北京时间）",
      // 开课前 10 分钟（例如北京 14:00 开课 → 13:50 提醒）
      "TRIGGER:-PT10M",
      "END:VALARM",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR", "");
  return lines.join("\r\n");
}
