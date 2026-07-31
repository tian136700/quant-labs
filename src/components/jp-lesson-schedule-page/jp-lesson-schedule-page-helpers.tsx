"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  JP_LESSON_CACHE_KEY as EN_LESSON_CACHE_KEY,
  parseEnLessonApi,
  type EnLessonApiPayload,
} from "@/lib/en-api-cache";
import {
  JP_LESSON_CACHE_KEY,
  JP_LESSON_REFRESH_TTL_MS,
  parseJpLessonApi,
  type JpLessonApiPayload,
} from "@/lib/jp-api-cache";
import {
  fetchWithClientCache,
  readClientCache,
  readClientCacheAge,
  writeClientCache,
} from "@/lib/client-swr-cache";
import {
  addBeijingCalendarDays,
  beijingDateOnlyFromClassAt,
  beijingMinutesFromMidnight,
  beijingMonthGridDates,
  beijingTimeHm,
  beijingTodayDateString,
  beijingWeekStartDate,
  beijingRelativeWeekdayLabel,
  flattenJpLessonScheduleEvents,
  formatLessonContentLines,
  formatLessonScheduleDaySummary,
  formatLessonScheduleDurationLabel,
  getJpLessonScheduleEventStatus,
  normalizeClassAtForCompare,
  normalizeClassDurationMinutes,
  parseLessonContent,
  type JpLessonScheduleEventStatus,
} from "@/lib/jp-lesson-shared";
import {
  createJpLessonManualSchedule,
  deleteJpLessonManualSchedule,
  flattenManualSchedulePageEvents,
  loadJpLessonManualSchedulesWithLegacyMigration,
  updateJpLessonManualSchedule,
  type JpLessonManualSchedule,
  type JpLessonSchedulePageEvent,
  type LessonScheduleSubject,
} from "@/lib/jp-lesson-manual-schedule";
import { jpLessonPath, enLessonPath, adminJpLessonTeachersPath } from "@/lib/locale-path";
import {
  detectScheduleTeacherSubjectFromTitle,
  formatTeacherLessonDisplayLabel,
  resolveLessonTeacherRateFields,
  sortJpLessonTeachersByLessonCount,
} from "@/lib/jp-lesson-teacher-rate";
import type {
  EnLessonClassScheduleInput,
  EnLessonRecord,
  EnLessonTeacher,
  EnVocabRef,
  JpLessonClassScheduleInput,
  JpLessonRecord,
  JpLessonTeacher,
  JpVocabRef,
  KoLessonTeacher,
} from "@/lib/types";

export type ViewMode = "day" | "week" | "month";

export const TIMELINE_MINUTES = 24 * 60;
export const SLOT_MINUTES = 30;
export const SLOT_COUNT = TIMELINE_MINUTES / SLOT_MINUTES;

export type DayScheduleEvent = JpLessonSchedulePageEvent;

export function formatSlotTime(slotIndex: number): string {
  const totalMinutes = slotIndex * SLOT_MINUTES;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function slotIndexFromMinutes(minutes: number): number {
  return Math.min(SLOT_COUNT - 1, Math.max(0, Math.floor(minutes / SLOT_MINUTES)));
}

export function eventOccupiesSlot(event: DayScheduleEvent, slotIndex: number): boolean {
  const slotStart = slotIndex * SLOT_MINUTES;
  const slotEnd = slotStart + SLOT_MINUTES;
  const eventStart = beijingMinutesFromMidnight(event.start);
  const eventEnd = beijingMinutesFromMidnight(event.end);
  return eventStart < slotEnd && eventEnd > slotStart;
}

export function findEventForSlot(events: DayScheduleEvent[], slotIndex: number): DayScheduleEvent | null {
  return events.find((event) => eventOccupiesSlot(event, slotIndex)) ?? null;
}

export function isFirstSlotForEvent(event: DayScheduleEvent, slotIndex: number): boolean {
  return slotIndexFromMinutes(beijingMinutesFromMidnight(event.start)) === slotIndex;
}

/** 从起始格起，该节课连续占用的半小时格数（如 55 分钟 ≈ 2 格） */
export function getEventSlotSpan(event: DayScheduleEvent, fromSlotIndex: number): number {
  let span = 0;
  for (let slotIndex = fromSlotIndex; slotIndex < SLOT_COUNT; slotIndex += 1) {
    if (!eventOccupiesSlot(event, slotIndex)) break;
    span += 1;
  }
  return Math.max(1, span);
}

/** 时间轴只渲染每节课的首格；后续半小时格合并进首格展示 */
export function shouldRenderTimelineSlot(events: DayScheduleEvent[], slotIndex: number): boolean {
  const event = findEventForSlot(events, slotIndex);
  if (!event) return true;
  return isFirstSlotForEvent(event, slotIndex);
}

export function getDayBusySlotRange(dayEvents: DayScheduleEvent[]): { start: number; end: number } | null {
  if (!dayEvents.length) return null;
  let start = SLOT_COUNT;
  let end = 0;
  for (const event of dayEvents) {
    for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
      if (!eventOccupiesSlot(event, slotIndex)) continue;
      start = Math.min(start, slotIndex);
      end = Math.max(end, slotIndex);
    }
  }
  if (start > end) return null;
  return { start, end };
}

/** 首末节课之间的全部半小时格（含空闲），默认全部展开 */
export function buildDayTimelineSlotIndices(
  busyRange: { start: number; end: number } | null
): number[] {
  if (!busyRange) return [];
  const indices: number[] = [];
  for (let slotIndex = busyRange.start; slotIndex <= busyRange.end; slotIndex += 1) {
    indices.push(slotIndex);
  }
  return indices;
}

export function eventTimelinePrimaryLabel(status: JpLessonScheduleEventStatus): string {
  switch (status) {
    case "past":
      return "✓ 已结束";
    case "ongoing":
      return "进行中";
    default:
      return "要上课";
  }
}

export function eventTimelineEncourageLabel(status: JpLessonScheduleEventStatus): string | null {
  return status === "past" ? "已上完课了，真棒" : null;
}

export function readLessonCache(): JpLessonApiPayload | null {
  return readClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY);
}

export function scheduleSubjectLabel(subject: LessonScheduleSubject): string {
  if (subject === "jp") return "日语";
  if (subject === "en") return "英语";
  return "手动";
}

export function scheduleSubjectCssClass(subject: LessonScheduleSubject): string {
  if (subject === "manual") return "manual";
  return subject;
}

export function formatLessonTeacherNames(
  lesson: JpLessonRecord | EnLessonRecord,
  teacherNameById: Map<number, string>
): string {
  const names = (lesson.teacher_ids ?? [])
    .map((id) => teacherNameById.get(id))
    .filter((name): name is string => Boolean(name));
  if (lesson.teacher_other?.trim()) {
    names.push(lesson.teacher_other.trim());
  }
  return names.length ? names.join("、") : "未指定";
}

export function formatContentPreview(content: string, maxItems = 3): string {
  const lines = formatLessonContentLines(content, 3);
  const first = lines[0] ?? "";
  if (lines.length <= 1 && first.length <= 48) return first;
  const trimmed = first.length > 48 ? `${first.slice(0, 45)}…` : first;
  return lines.length > 1 ? `${trimmed}…` : trimmed;
}

export function eventStatusLabel(status: JpLessonScheduleEventStatus): string {
  switch (status) {
    case "past":
      return "已结束";
    case "ongoing":
      return "进行中";
    default:
      return "待上课";
  }
}

export function weekStartDate(dateStr: string): string {
  return beijingWeekStartDate(dateStr);
}

export function monthGrid(dateStr: string): string[] {
  return beijingMonthGridDates(dateStr);
}

export function exportScheduleText(events: DayScheduleEvent[], rangeLabel: string): string {
  const lines = [`课程日程 · ${rangeLabel}`, ""];
  for (const event of events) {
    const prefix =
      event.subject === "manual"
        ? "[手动] "
        : event.subject === "en"
          ? "[英语] "
          : "[日语] ";
    lines.push(
      `${prefix}${event.classAt.slice(0, 16)} - ${beijingTimeHm(event.end)} · ${event.teachers}`,
      formatLessonContentLines(event.displayContent, 4).join("\n")
    );
    if (event.manualNote) lines.push(`备注：${event.manualNote}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function eventContentPreview(event: DayScheduleEvent, maxItems = 3): string {
  return formatContentPreview(event.displayContent, maxItems);
}

export function parseTeacherNameToken(token: string): string {
  const trimmed = token.trim();
  const dotIndex = trimmed.indexOf(" · ");
  return dotIndex >= 0 ? trimmed.slice(0, dotIndex).trim() : trimmed;
}

export function JpLessonScheduleManualTeacherLinks({
  text,
  teachers,
  locale,
}: {
  text: string;
  teachers: JpLessonTeacher[];
  locale: "zh" | "en";
}) {
  const nameToId = useMemo(() => {
    const map = new Map<string, number>();
    for (const teacher of teachers) {
      const resolved = resolveLessonTeacherRateFields(teacher);
      map.set(resolved.name, teacher.id);
      map.set(teacher.name.trim(), teacher.id);
    }
    return map;
  }, [teachers]);

  const tokens = text
    .split(/[、,，]/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (!tokens.length) {
    return <>—</>;
  }

  return (
    <>
      {tokens.map((token, index) => {
        const name = parseTeacherNameToken(token);
        const teacherId = nameToId.get(name) ?? null;
        const href = teacherId ? adminJpLessonTeachersPath(locale, teacherId) : null;
        const suffix = token.length > name.length ? token.slice(name.length) : "";
        return (
          <span key={`${token}-${index}`}>
            {index > 0 ? "、" : null}
            {href ? (
              <a href={href} className="jpls-teacher-link">
                {name}
              </a>
            ) : (
              name
            )}
            {suffix}
          </span>
        );
      })}
    </>
  );
}

/**
 * 日程去重键：同科目、同老师、同一开始时间 → 合并为一条（多教案同堂）。
 * 用 teacher_ids / teacher_other，禁止用老师显示名（未加载时多为「未指定」会误合并）。
 */
export function buildLessonEventDedupKey(
  event: DayScheduleEvent,
  lesson: { teacher_ids?: number[]; teacher_other?: string | null } | null
): string {
  if (event.source === "manual" && event.manualId != null) {
    return `manual|${event.manualId}`;
  }
  if (event.lessonId != null) {
    const teacherIds = [...(lesson?.teacher_ids ?? [])].sort((a, b) => a - b).join(",");
    const teacherOther = (lesson?.teacher_other ?? "").trim();
    return `${event.subject}|slot|${teacherIds}|${teacherOther}|${normalizeClassAtForCompare(event.classAt)}`;
  }
  return event.key;
}

/**
 * 选中键匹配：关联教材后手动条并入新课，key 从 `manual-*` 变为 `jp-`/`en-`，
 * 仍用 manualId 续选，避免详情栏跳到别的课。
 */
export function scheduleEventMatchesSelectionKey(
  event: DayScheduleEvent,
  selectedEventKey: string | null
): boolean {
  if (!selectedEventKey) return false;
  if (event.key === selectedEventKey) return true;
  if (!selectedEventKey.startsWith("manual-") || event.manualId == null) return false;
  const manualId = Number(selectedEventKey.slice("manual-".length));
  return Number.isInteger(manualId) && manualId > 0 && event.manualId === manualId;
}

/** 合并同堂多教案的词条展示（去重保序） */
export function mergeLessonDisplayContents(a: string, b: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...parseLessonContent(a), ...parseLessonContent(b)]) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out.length ? out.join(", ") : a.trim() || b.trim();
}

export function lessonPayloadNeedsTeacherRefresh(
  payload: { lessons: Array<{ teacher_ids?: number[] }>; teachers?: unknown[] } | null
): boolean {
  if (!payload) return true;
  const hasTeacherIds = payload.lessons.some((lesson) => (lesson.teacher_ids?.length ?? 0) > 0);
  if (!hasTeacherIds) return false;
  return !Array.isArray(payload.teachers) || payload.teachers.length === 0;
}

export function readEnLessonCache(): EnLessonApiPayload | null {
  return readClientCache<EnLessonApiPayload>(EN_LESSON_CACHE_KEY);
}

