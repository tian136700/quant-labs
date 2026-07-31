import "server-only";

import { listEnLessons } from "@/lib/en-lesson-db";
import {
  flattenEnLessonScheduleEvents,
  normalizeClassAtForCompare as normalizeEnClassAtForCompare,
} from "@/lib/en-lesson-shared";
import { listEnLessonTeachers } from "@/lib/en-lesson-teacher-db";
import { listJpLessons } from "@/lib/jp-lesson-db";
import {
  flattenJpLessonScheduleEvents,
  normalizeClassAtForCompare,
} from "@/lib/jp-lesson-shared";
import { resolveManualScheduleDurationMinutes } from "@/lib/jp-lesson-manual-schedule";
import { listJpLessonManualSchedules } from "@/lib/jp-lesson-manual-schedule-db";
import { manualScheduleHasLinkedLessonOnSameSlot } from "@/lib/jp-lesson-manual-schedule-linked";
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

type LessonKind = "word" | "grammar";

type RawLessonSlotEvent = {
  subject: "jp" | "en";
  class_at: string;
  duration_minutes: number;
  teachers: string;
  teacher_ids: number[];
  teacher_other: string;
  kind: LessonKind;
  content: string;
  title: string | null;
  lesson_id: number;
  schedule_id: number;
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

function normalizeLessonKind(kind: string | null | undefined): LessonKind {
  if (kind === "grammar") return "grammar";
  // word_grammar 在合并标题时当作两者都有，见 formatScheduleKindLabel
  return "word";
}

/** 单词 / 语法 / 单词和语法（有两者时合并文案，与网站同堂展示一致） */
export function formatScheduleKindLabel(
  kinds: Iterable<LessonKind | string | null | undefined>
): string {
  let hasWord = false;
  let hasGrammar = false;
  for (const kind of kinds) {
    if (kind === "word_grammar") {
      hasWord = true;
      hasGrammar = true;
    } else if (kind === "grammar") {
      hasGrammar = true;
    } else {
      hasWord = true;
    }
  }
  if (hasWord && hasGrammar) return "单词和语法";
  if (hasGrammar) return "语法";
  return "单词";
}

function lessonSummary(
  subjectLabel: string,
  teachers: string,
  kindLabel: string
): string {
  return `${subjectLabel} · ${teachers} · ${kindLabel}`;
}

function buildDescription(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * 与网站统一日程同堂去重一致：同科目 + 同老师(ids/other) + 同一开始时间 → 一条。
 * 禁止用老师显示名（未加载时全是「未指定」会误合并）。
 */
export function buildScheduleCalDavSlotMergeKey(event: {
  subject: "jp" | "en";
  teacher_ids?: number[];
  teacher_other?: string | null;
  class_at: string;
}): string {
  const teacherIds = [...(event.teacher_ids ?? [])]
    .sort((a, b) => a - b)
    .join(",");
  const teacherOther = (event.teacher_other ?? "").trim();
  const classAt =
    event.subject === "en"
      ? normalizeEnClassAtForCompare(event.class_at)
      : normalizeClassAtForCompare(event.class_at);
  return `${event.subject}|slot|${teacherIds}|${teacherOther}|${classAt}`;
}

/** 稳定 UID：同堂合并后旧的 jp-lesson-{id}-{sid} 会被 CalDAV 同步删掉 */
export function buildScheduleCalDavSlotUid(mergeKey: string): string {
  let hash = 2166136261;
  for (let i = 0; i < mergeKey.length; i += 1) {
    hash ^= mergeKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  const at =
    mergeKey.split("|").pop()?.replace(/[^0-9]/g, "").slice(0, 14) || "0";
  const subject = mergeKey.startsWith("en|") ? "en" : "jp";
  return `${subject}-slot-${hex}-${at}@${SCHEDULE_CALDAV_UID_DOMAIN}`;
}

function mergeContentLines(parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const text = part.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.join("\n");
}

function mergeTitleLines(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const text = (part ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.join("；");
}

/** 同堂多教案合并为单条日历事件（单词+语法 →「单词和语法」） */
export function mergeRawLessonSlotEvents(
  rawEvents: RawLessonSlotEvent[]
): ScheduleCalDavEvent[] {
  const groups = new Map<
    string,
    {
      mergeKey: string;
      events: RawLessonSlotEvent[];
    }
  >();

  for (const event of rawEvents) {
    const mergeKey = buildScheduleCalDavSlotMergeKey(event);
    const existing = groups.get(mergeKey);
    if (existing) {
      existing.events.push(event);
    } else {
      groups.set(mergeKey, { mergeKey, events: [event] });
    }
  }

  const merged: ScheduleCalDavEvent[] = [];
  for (const group of groups.values()) {
    const sorted = [...group.events].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "word" ? -1 : 1;
      return a.lesson_id - b.lesson_id;
    });
    const first = sorted[0];
    const subjectLabel = first.subject === "en" ? "英语课" : "日语课";
    const kindLabel = formatScheduleKindLabel(sorted.map((e) => e.kind));
    const contentBlocks = sorted.map((event) => {
      const tag = event.kind === "grammar" ? "语法" : "单词";
      return `【${tag}】${event.content.trim() || `${subjectLabel} #${event.lesson_id}`}`;
    });
    const content = mergeContentLines(contentBlocks);
    const titles = mergeTitleLines(sorted.map((e) => e.title));
    const duration = Math.max(...sorted.map((e) => e.duration_minutes));

    merged.push({
      uid: buildScheduleCalDavSlotUid(group.mergeKey),
      subject: first.subject,
      summary: lessonSummary(subjectLabel, first.teachers, kindLabel),
      description: buildDescription([
        "时间：北京时间（与网站一致）",
        `类型：${kindLabel}`,
        `老师：${first.teachers}`,
        `学习内容：\n${content}`,
        titles ? `教案标题：${titles}` : null,
      ]),
      class_at: first.class_at,
      duration_minutes: duration,
      teachers: first.teachers,
      title: content,
      lesson_id: first.lesson_id,
      schedule_id: first.schedule_id,
    });
  }

  return merged;
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

  const rawLessonEvents: RawLessonSlotEvent[] = [];

  for (const event of flattenJpLessonScheduleEvents(jpLessons)) {
    const lesson = jpLessonById.get(event.lessonId);
    if (!lesson) continue;
    const teachers = formatLessonTeachers(lesson, jpNameById);
    const content = lesson.content.trim() || `日语课 #${lesson.id}`;
    rawLessonEvents.push({
      subject: "jp",
      class_at: event.classAt,
      duration_minutes: event.durationMinutes,
      teachers,
      teacher_ids: [...(lesson.teacher_ids ?? [])],
      teacher_other: (lesson.teacher_other ?? "").trim(),
      kind: normalizeLessonKind(lesson.kind),
      content,
      title: lesson.title?.trim() || null,
      lesson_id: event.lessonId,
      schedule_id: event.scheduleId,
    });
  }

  for (const event of flattenEnLessonScheduleEvents(enLessons)) {
    const lesson = enLessonById.get(event.lessonId);
    if (!lesson) continue;
    const teachers = formatLessonTeachers(lesson, enNameById);
    const content = lesson.content.trim() || `英语课 #${lesson.id}`;
    rawLessonEvents.push({
      subject: "en",
      class_at: event.classAt,
      duration_minutes: event.durationMinutes,
      teachers,
      teacher_ids: [...(lesson.teacher_ids ?? [])],
      teacher_other: (lesson.teacher_other ?? "").trim(),
      kind: normalizeLessonKind(lesson.kind),
      content,
      title: lesson.title?.trim() || null,
      lesson_id: event.lessonId,
      schedule_id: event.scheduleId,
    });
  }

  const events: ScheduleCalDavEvent[] = mergeRawLessonSlotEvents(rawLessonEvents);

  const lessonSlots = rawLessonEvents.map((event) => ({
    subject: event.subject,
    lessonId: event.lesson_id,
    classAt: event.class_at,
  }));

  for (const manual of manuals) {
    // 关联教材已同步进新课同堂 → 日历只保留新课合并事件，勿再推一条「手动」
    if (manualScheduleHasLinkedLessonOnSameSlot(manual, lessonSlots)) {
      continue;
    }
    const title = manual.title.trim() || `手动日程 #${manual.id}`;
    const teachers = manual.teacher.trim() || "未指定";
    events.push({
      uid: `manual-${manual.id}@${SCHEDULE_CALDAV_UID_DOMAIN}`,
      subject: "manual",
      summary: `手动 · ${teachers} · ${title}`,
      description: buildDescription([
        "时间：北京时间（与网站一致）",
        `老师/对象：${teachers}`,
        `标题：${title}`,
        manual.note.trim() || null,
      ]),
      class_at: manual.class_at,
      duration_minutes: resolveManualScheduleDurationMinutes(
        manual.title,
        manual.duration_minutes
      ),
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
    // UID 加 .bj3 后缀：同堂合并 + 标题「单词和语法」后迫使已订阅日历刷新
    const uid = event.uid.includes("@")
      ? event.uid.replace(
          /@info-quests\.schedule(\.bj\d*)?$/,
          "@info-quests.schedule.bj3"
        )
      : `${event.uid}@info-quests.schedule.bj3`;
    const summary = event.summary;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      "SEQUENCE:5",
      `DTSTART:${start}`,
      `DTEND:${end}`,
      foldIcalLine(`SUMMARY:${icalEscape(summary)}`)
    );
    if (event.description.trim()) {
      lines.push(
        foldIcalLine(`DESCRIPTION:${icalEscape(event.description)}`)
      );
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
