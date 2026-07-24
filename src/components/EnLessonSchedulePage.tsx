"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { CopyToast } from "@/components/CopyToast";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  JP_LESSON_CACHE_KEY,
  parseEnLessonApi,
  type EnLessonApiPayload,
} from "@/lib/en-api-cache";
import { fetchWithClientCache, readClientCache } from "@/lib/client-swr-cache";
import {
  addBeijingCalendarDays,
  beijingDateOnlyFromClassAt,
  beijingMinutesFromMidnight,
  beijingMonthGridDates,
  beijingTimeHm,
  beijingTodayDateString,
  beijingWeekStartDate,
  beijingRelativeWeekdayLabel,
  flattenEnLessonScheduleEvents,
  formatLessonContentLines,
  formatLessonScheduleDaySummary,
  getEnLessonScheduleEventStatus,
  type EnLessonScheduleEvent,
  type EnLessonScheduleEventStatus,
} from "@/lib/en-lesson-shared";
import { enLessonPath } from "@/lib/locale-path";
import { enVocabRefViewerPath } from "@/lib/en-vocab-ref-shared";
import { SITE_URL } from "@/lib/site";
import type { EnLessonRecord, EnLessonTeacher, EnVocabRef } from "@/lib/types";
import { EnLessonSchedulePageStyles } from "@/components/en-lesson-schedule-page/EnLessonSchedulePageStyles";

type ViewMode = "day" | "week" | "month";

const TIMELINE_MINUTES = 24 * 60;
const SLOT_MINUTES = 30;
const SLOT_COUNT = TIMELINE_MINUTES / SLOT_MINUTES;

type DayScheduleEvent = EnLessonScheduleEvent & {
  lesson: EnLessonRecord;
  teachers: string;
};

function formatSlotTime(slotIndex: number): string {
  const totalMinutes = slotIndex * SLOT_MINUTES;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function slotIndexFromMinutes(minutes: number): number {
  return Math.min(SLOT_COUNT - 1, Math.max(0, Math.floor(minutes / SLOT_MINUTES)));
}

function eventOccupiesSlot(event: DayScheduleEvent, slotIndex: number): boolean {
  const slotStart = slotIndex * SLOT_MINUTES;
  const slotEnd = slotStart + SLOT_MINUTES;
  const eventStart = beijingMinutesFromMidnight(event.start);
  const eventEnd = beijingMinutesFromMidnight(event.end);
  return eventStart < slotEnd && eventEnd > slotStart;
}

function findEventForSlot(events: DayScheduleEvent[], slotIndex: number): DayScheduleEvent | null {
  return events.find((event) => eventOccupiesSlot(event, slotIndex)) ?? null;
}

function isFirstSlotForEvent(event: DayScheduleEvent, slotIndex: number): boolean {
  return slotIndexFromMinutes(beijingMinutesFromMidnight(event.start)) === slotIndex;
}

/** 从起始格起，该节课连续占用的半小时格数（如 55 分钟 ≈ 2 格） */
function getEventSlotSpan(event: DayScheduleEvent, fromSlotIndex: number): number {
  let span = 0;
  for (let slotIndex = fromSlotIndex; slotIndex < SLOT_COUNT; slotIndex += 1) {
    if (!eventOccupiesSlot(event, slotIndex)) break;
    span += 1;
  }
  return Math.max(1, span);
}

/** 时间轴只渲染每节课的首格；后续半小时格合并进首格展示 */
function shouldRenderTimelineSlot(events: DayScheduleEvent[], slotIndex: number): boolean {
  const event = findEventForSlot(events, slotIndex);
  if (!event) return true;
  return isFirstSlotForEvent(event, slotIndex);
}

function getDayBusySlotRange(dayEvents: DayScheduleEvent[]): { start: number; end: number } | null {
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
function buildDayTimelineSlotIndices(
  busyRange: { start: number; end: number } | null
): number[] {
  if (!busyRange) return [];
  const indices: number[] = [];
  for (let slotIndex = busyRange.start; slotIndex <= busyRange.end; slotIndex += 1) {
    indices.push(slotIndex);
  }
  return indices;
}

function eventTimelinePrimaryLabel(status: EnLessonScheduleEventStatus): string {
  switch (status) {
    case "past":
      return "✓ 已结束";
    case "ongoing":
      return "进行中";
    default:
      return "要上课";
  }
}

function eventTimelineEncourageLabel(status: EnLessonScheduleEventStatus): string | null {
  return status === "past" ? "已上完课了，真棒" : null;
}

function readLessonCache(): EnLessonApiPayload | null {
  return readClientCache<EnLessonApiPayload>(JP_LESSON_CACHE_KEY);
}

function formatLessonTeacherNames(
  lesson: EnLessonRecord,
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

function formatContentPreview(content: string, maxItems = 3): string {
  const lines = formatLessonContentLines(content, 3);
  const first = lines[0] ?? "";
  if (lines.length <= 1 && first.length <= 48) return first;
  const trimmed = first.length > 48 ? `${first.slice(0, 45)}…` : first;
  return lines.length > 1 ? `${trimmed}…` : trimmed;
}

function eventStatusLabel(status: EnLessonScheduleEventStatus): string {
  switch (status) {
    case "past":
      return "已结束";
    case "ongoing":
      return "进行中";
    default:
      return "待上课";
  }
}

function weekStartDate(dateStr: string): string {
  return beijingWeekStartDate(dateStr);
}

function monthGrid(dateStr: string): string[] {
  return beijingMonthGridDates(dateStr);
}

function exportScheduleText(
  events: Array<EnLessonScheduleEvent & { lesson: EnLessonRecord; teachers: string }>,
  rangeLabel: string
): string {
  const lines = [`英语新课日程 · ${rangeLabel}`, ""];
  for (const event of events) {
    lines.push(
      `${event.classAt.slice(0, 16)} - ${beijingTimeHm(event.end)} · ${event.teachers}`,
      formatLessonContentLines(event.lesson.content, 4).join("\n"),
      ""
    );
  }
  return lines.join("\n").trim();
}

export function EnLessonSchedulePage() {
  const { locale } = useI18n();
  const { isAdmin, checking } = useEtrAuth();

  const [lessons, setLessons] = useState<EnLessonRecord[]>(() => readLessonCache()?.lessons ?? []);
  const [refs, setRefs] = useState<Record<string, EnVocabRef>>(() => readLessonCache()?.refs ?? {});
  const [teachers, setTeachers] = useState<EnLessonTeacher[]>(
    () => readLessonCache()?.teachers ?? []
  );
  const [loading, setLoading] = useState(() => readLessonCache() == null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(() => beijingTodayDateString());
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const sidebarPanelsRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = "日程管理 · 英语新课";
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadLessons = useCallback(async () => {
    const hasCache = readLessonCache() != null;
    if (!hasCache) setLoading(true);
    setError("");
    try {
      const payload = await fetchWithClientCache(
        JP_LESSON_CACHE_KEY,
        "/api/en-lesson",
        parseEnLessonApi,
        {
          onCached: (cached) => {
            setLessons(cached.lessons);
            setRefs(cached.refs);
            if (cached.teachers) setTeachers(cached.teachers);
          },
        }
      );
      setLessons(payload.lessons);
      setRefs(payload.refs);
      if (payload.teachers) setTeachers(payload.teachers);
    } catch (err) {
      if (!hasCache) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!checking && isAdmin) void loadLessons();
  }, [checking, isAdmin, loadLessons]);

  const teacherNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const teacher of teachers) {
      map.set(teacher.id, teacher.name);
    }
    return map;
  }, [teachers]);

  const lessonById = useMemo(() => {
    const map = new Map<number, EnLessonRecord>();
    for (const lesson of lessons) {
      map.set(lesson.id, lesson);
    }
    return map;
  }, [lessons]);

  const allEvents = useMemo(() => {
    return flattenEnLessonScheduleEvents(lessons).flatMap((event) => {
      const lesson = lessonById.get(event.lessonId);
      if (!lesson) return [];
      return [
        {
          ...event,
          lesson,
          teachers: formatLessonTeacherNames(lesson, teacherNameById),
        },
      ];
    });
  }, [lessons, lessonById, teacherNameById]);

  const weekDates = useMemo(() => {
    const start = weekStartDate(selectedDate);
    return Array.from({ length: 7 }, (_, index) => addBeijingCalendarDays(start, index));
  }, [selectedDate]);

  const eventsForDate = useCallback(
    (dateStr: string) =>
      allEvents.filter((event) => beijingDateOnlyFromClassAt(event.classAt) === dateStr),
    [allEvents]
  );

  const dayEvents = useMemo(() => eventsForDate(selectedDate), [eventsForDate, selectedDate]);
  const dayBusyRange = useMemo(() => getDayBusySlotRange(dayEvents), [dayEvents]);

  useEffect(() => {
    if (viewMode !== "day") {
      if (calendarRef.current) calendarRef.current.style.height = "";
      return;
    }

    const panels = sidebarPanelsRef.current;
    const calendar = calendarRef.current;
    if (!panels || !calendar) return;

    const mq = window.matchMedia("(max-width: 767px)");

    const syncCalendarHeight = () => {
      if (mq.matches) {
        calendar.style.height = "";
        return;
      }
      calendar.style.height = `${panels.offsetHeight}px`;
    };

    syncCalendarHeight();
    const observer = new ResizeObserver(syncCalendarHeight);
    observer.observe(panels);
    mq.addEventListener("change", syncCalendarHeight);
    window.addEventListener("resize", syncCalendarHeight);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", syncCalendarHeight);
      window.removeEventListener("resize", syncCalendarHeight);
      calendar.style.height = "";
    };
  }, [viewMode, selectedEventKey, dayEvents.length, dayBusyRange, loading]);

  const weekEvents = useMemo(() => {
    const set = new Set(weekDates);
    return allEvents.filter((event) => {
      const date = beijingDateOnlyFromClassAt(event.classAt);
      return date != null && set.has(date);
    });
  }, [allEvents, weekDates]);

  const monthDays = useMemo(() => monthGrid(selectedDate), [selectedDate]);
  const monthEvents = useMemo(() => {
    const set = new Set(monthDays);
    return allEvents.filter((event) => {
      const date = beijingDateOnlyFromClassAt(event.classAt);
      return date != null && set.has(date);
    });
  }, [allEvents, monthDays]);

  const visibleEvents =
    viewMode === "day" ? dayEvents : viewMode === "week" ? weekEvents : monthEvents;

  useEffect(() => {
    const pool =
      viewMode === "day"
        ? dayEvents
        : viewMode === "week"
          ? weekEvents
          : eventsForDate(selectedDate);
    if (!pool.length) {
      setSelectedEventKey(null);
      return;
    }
    if (selectedEventKey && pool.some((event) => event.key === selectedEventKey)) {
      return;
    }
    const todayStr = beijingTodayDateString(now);
    const preferred =
      pool.find(
        (event) =>
          beijingDateOnlyFromClassAt(event.classAt) === todayStr &&
          getEnLessonScheduleEventStatus(event, now) !== "past"
      ) ?? pool[0];
    setSelectedEventKey(preferred.key);
  }, [dayEvents, weekEvents, eventsForDate, selectedDate, selectedEventKey, viewMode, now]);

  const selectedEvent = useMemo(
    () => allEvents.find((event) => event.key === selectedEventKey) ?? null,
    [allEvents, selectedEventKey]
  );

  const selectedViewUrl = useMemo(() => {
    if (!selectedEvent?.lesson.ref_key) return null;
    const ref = refs[selectedEvent.lesson.ref_key];
    return enVocabRefViewerPath(selectedEvent.lesson.ref_key, ref?.updated_at);
  }, [selectedEvent, refs]);

  const todayStr = beijingTodayDateString(now);
  const selectedDateRelativeLabel = useMemo(
    () => beijingRelativeWeekdayLabel(selectedDate, now),
    [selectedDate, now]
  );
  const nowMinutes = beijingMinutesFromMidnight(now);
  const nowSlotIndex = slotIndexFromMinutes(nowMinutes);
  const showNowLine =
    viewMode === "day" &&
    selectedDate === todayStr &&
    dayBusyRange != null &&
    nowSlotIndex >= dayBusyRange.start &&
    nowSlotIndex <= dayBusyRange.end;

  const dayTimelineSlotIndices = useMemo(() => {
    if (viewMode !== "day") return [];
    return buildDayTimelineSlotIndices(dayBusyRange);
  }, [dayBusyRange, viewMode]);

  const dayTimelineRowCount = dayTimelineSlotIndices.length;
  const nowTopPct =
    dayTimelineRowCount > 0 && dayBusyRange
      ? ((nowSlotIndex - dayBusyRange.start +
          (nowMinutes % SLOT_MINUTES) / SLOT_MINUTES) /
          dayTimelineRowCount) *
        100
      : 0;

  const rangeLabel =
    viewMode === "day"
      ? selectedDate
      : viewMode === "week"
        ? `${weekDates[0]} ~ ${weekDates[6]}`
        : selectedDate.slice(0, 7);

  const showCopySuccess = () => {
    setCopyToast(locale === "zh" ? "复制成功" : "Copied");
  };

  const handleExport = async () => {
    const text = exportScheduleText(visibleEvents, rangeLabel);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1500);
      showCopySuccess();
    } catch {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `jp-lesson-schedule-${rangeLabel.replace(/\s+/g, "_")}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  };

  const copyLessonLink = async () => {
    if (!selectedViewUrl) return;
    try {
      await navigator.clipboard.writeText(`${SITE_URL}${selectedViewUrl}`);
      showCopySuccess();
    } catch {
      /* ignore */
    }
  };

  if (checking || !isAdmin) {
    return (
      <AdminAuthGate
        title="日程管理"
        required="需要管理员权限"
        login="登录"
        registered={!checking && isAdmin}
      />
    );
  }

  return (
    <main className="page-wrap jp-lesson-schedule-page">
      <header className="jpls-header">
        <div>
          <h1>日程管理</h1>
          <p className="jpls-sub">查看今日及未来的英语新课预约时间（北京时间）</p>
        </div>
        <a className="jpls-back-btn" href={enLessonPath()}>
          ← 返回英语新课
        </a>
      </header>

      <div className="jpls-toolbar">
        <div className="jpls-toolbar-controls">
          <div className="jpls-view-tabs" role="tablist" aria-label="视图切换">
            {(
              [
                ["day", "日视图"],
                ["week", "周视图"],
                ["month", "月视图"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={viewMode === mode}
                className={`jpls-view-tab${viewMode === mode ? " is-active" : ""}`}
                onClick={() => setViewMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="jpls-date-nav">
            <button
              type="button"
              className="jpls-icon-btn"
              aria-label="上一天"
              onClick={() =>
                setSelectedDate((prev) =>
                  addBeijingCalendarDays(prev, viewMode === "month" ? -28 : viewMode === "week" ? -7 : -1)
                )
              }
            >
              ‹
            </button>
            <div className="jpls-date-nav-center">
              <span className="jpls-date-relative" aria-hidden="true">
                {selectedDateRelativeLabel}
              </span>
              <input
                type="date"
                className="jpls-date-input"
                value={selectedDate}
                aria-label={`选择日期，${selectedDateRelativeLabel}，${formatLessonScheduleDaySummary(dayEvents, {
                  classUnit: "节课",
                  emptyLabel: "0节课（0小时00分）",
                })}`}
                onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
              />
              {viewMode === "day" ? (
                <span className="jpls-date-count">
                  {formatLessonScheduleDaySummary(dayEvents, {
                    classUnit: "节课",
                    emptyLabel: "0节课（0小时00分）",
                  })}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="jpls-icon-btn"
              aria-label="下一天"
              onClick={() =>
                setSelectedDate((prev) =>
                  addBeijingCalendarDays(prev, viewMode === "month" ? 28 : viewMode === "week" ? 7 : 1)
                )
              }
            >
              ›
            </button>
          </div>
        </div>

        <div className="jpls-toolbar-right">
          <span className="jpls-legend">
            <span className="jpls-legend-dot jpls-legend-dot--free" /> 空闲
          </span>
          <span className="jpls-legend">
            <span className="jpls-legend-dot jpls-legend-dot--busy" /> 有课
          </span>
          <button type="button" className="jpls-export-btn" onClick={() => void handleExport()}>
            {copiedLink ? "已复制" : "导出日程"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="jpls-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="jpls-muted">加载中…</p> : null}

      <div className="jpls-layout">
        <section
          ref={calendarRef}
          className={`jpls-calendar section etr-panel${
            viewMode === "day" ? " jpls-calendar--day-sync" : ""
          }`}
          aria-label="日程视图"
        >
          {viewMode === "day" ? (
            <div className="jpls-day-view">
              <div className="jpls-day-title">
                <span className="jpls-day-date">{selectedDate}</span>
                <span className="jpls-day-weekday">{selectedDateRelativeLabel}</span>
              </div>
              {dayBusyRange ? (
                <>
                  <h3 className="jpls-timeline-heading">时间轴</h3>
                  <div className="jpls-slot-grid">
                {dayTimelineSlotIndices
                  .filter((slotIndex) => shouldRenderTimelineSlot(dayEvents, slotIndex))
                  .map((slotIndex) => {
                  const event = findEventForSlot(dayEvents, slotIndex);
                  const isHourSlot = slotIndex % 2 === 0;
                  const status = event ? getEnLessonScheduleEventStatus(event, now) : null;
                  const showDetails = event && isFirstSlotForEvent(event, slotIndex);
                  const eventSlotSpan =
                    event && showDetails ? getEventSlotSpan(event, slotIndex) : 1;
                  const encourageLabel = status ? eventTimelineEncourageLabel(status) : null;
                  return (
                    <div
                      key={slotIndex}
                      className={`jpls-slot-row${isHourSlot ? " is-hour" : ""}${
                        showNowLine && slotIndex === nowSlotIndex ? " has-now" : ""
                      }${event && showDetails ? " is-event-start" : ""}${
                        eventSlotSpan > 1 ? " is-event-span" : ""
                      }`}
                      data-slot-span={eventSlotSpan > 1 ? eventSlotSpan : undefined}
                      style={
                        eventSlotSpan > 1
                          ? ({ "--jpls-slot-span": eventSlotSpan } as CSSProperties)
                          : undefined
                      }
                    >
                      <div className="jpls-slot-time">{formatSlotTime(slotIndex)}</div>
                      <button
                        type="button"
                        className={`jpls-slot-cell${event ? " is-busy" : " is-free"}${
                          event && status ? ` jpls-slot-cell--${status}` : ""
                        }${event && selectedEventKey === event.key ? " is-selected" : ""}`}
                        disabled={!event}
                        onClick={() => event && setSelectedEventKey(event.key)}
                      >
                        {event ? (
                          <>
                            <span
                              className={`jpls-slot-busy-label${
                                status === "past" ? " jpls-slot-busy-label--past" : ""
                              }`}
                            >
                              {status ? eventTimelinePrimaryLabel(status) : "要上课"}
                            </span>
                            {encourageLabel ? (
                              <span className="jpls-slot-busy-encourage">{encourageLabel}</span>
                            ) : null}
                            {showDetails ? (
                              <>
                                <span className="jpls-slot-busy-time">
                                  {beijingTimeHm(event.start)} - {beijingTimeHm(event.end)}
                                </span>
                                <span className="jpls-slot-busy-meta">
                                  {event.teachers} · {formatContentPreview(event.lesson.content, 2)}
                                </span>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <span className="jpls-slot-free-label">空闲</span>
                        )}
                      </button>
                    </div>
                  );
                })}
                {showNowLine && dayTimelineRowCount > 0 ? (
                  <div className="jpls-now-line" style={{ top: `${nowTopPct}%` }}>
                    <span>现在</span>
                  </div>
                ) : null}
                  </div>
                </>
              ) : (
                <p className="jpls-day-empty">这一天没有预约课程。</p>
              )}
            </div>
          ) : null}

          {viewMode === "week" ? (
            <div className="jpls-week-view">
              {weekDates.map((dateStr) => {
                const events = eventsForDate(dateStr);
                const isToday = dateStr === todayStr;
                return (
                  <div
                    key={dateStr}
                    className={`jpls-week-col${isToday ? " is-today" : ""}`}
                  >
                    <button
                      type="button"
                      className="jpls-week-col-head"
                      onClick={() => {
                        setSelectedDate(dateStr);
                        setViewMode("day");
                      }}
                    >
                      <span>{dateStr.slice(5)}</span>
                      <span>{beijingRelativeWeekdayLabel(dateStr, now)}</span>
                      <span className="jpls-week-count">
                        {formatLessonScheduleDaySummary(events)}
                      </span>
                    </button>
                    <div className="jpls-week-list">
                      {events.length ? (
                        events.map((event) => (
                          <button
                            key={event.key}
                            type="button"
                            className={`jpls-week-item${
                              selectedEventKey === event.key ? " is-selected" : ""
                            }`}
                            onClick={() => setSelectedEventKey(event.key)}
                          >
                            <span>{beijingTimeHm(event.start)}</span>
                            <span>{formatContentPreview(event.lesson.content, 2)}</span>
                          </button>
                        ))
                      ) : (
                        <p className="jpls-week-empty">无课</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {viewMode === "month" ? (
            <div className="jpls-month-view">
              <div className="jpls-month-head">{selectedDate.slice(0, 7)}</div>
              <div className="jpls-month-weekdays">
                {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="jpls-month-grid">
                {monthDays.map((dateStr) => {
                  const events = eventsForDate(dateStr);
                  const inMonth = dateStr.slice(0, 7) === selectedDate.slice(0, 7);
                  const isToday = dateStr === todayStr;
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      className={`jpls-month-cell${inMonth ? "" : " is-outside"}${
                        isToday ? " is-today" : ""
                      }${selectedDate === dateStr ? " is-selected" : ""}`}
                      onClick={() => {
                        setSelectedDate(dateStr);
                        setViewMode("day");
                      }}
                    >
                      <span className="jpls-month-day">{Number(dateStr.slice(8, 10))}</span>
                      {events.length ? (
                        <span className="jpls-month-dots">
                          {events.slice(0, 3).map((event) => (
                            <span key={event.key} className="jpls-month-dot" />
                          ))}
                          {events.length > 3 ? (
                            <span className="jpls-month-more">+{events.length - 3}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="jpls-sidebar">
          <div className="jpls-sidebar-panels" ref={sidebarPanelsRef}>
          <section className="section etr-panel jpls-detail">
            <h2>课程详情</h2>
            {selectedEvent ? (
              <>
                <dl className="jpls-detail-list">
                  <div>
                    <dt>上课时间</dt>
                    <dd>
                      {selectedEvent.classAt.slice(0, 16)} - {beijingTimeHm(selectedEvent.end)}
                    </dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>
                      <span
                        className={`jpls-status-badge jpls-status-badge--${getEnLessonScheduleEventStatus(selectedEvent, now)}`}
                      >
                        {eventStatusLabel(getEnLessonScheduleEventStatus(selectedEvent, now))}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>课程内容</dt>
                    <dd>
                      {formatLessonContentLines(selectedEvent.lesson.content, 4).map((line) => (
                        <span key={line} className="jpls-content-line">
                          {line}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt>老师</dt>
                    <dd>{selectedEvent.teachers}</dd>
                  </div>
                  <div>
                    <dt>时长</dt>
                    <dd>{selectedEvent.durationMinutes} 分钟</dd>
                  </div>
                  {selectedViewUrl ? (
                    <div>
                      <dt>课程链接</dt>
                      <dd className="jpls-link-row">
                        <a href={selectedViewUrl} target="_blank" rel="noreferrer">
                          打开教案
                        </a>
                        <button type="button" onClick={() => void copyLessonLink()}>
                          复制链接
                        </button>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </>
            ) : (
              <p className="jpls-muted">当前日期暂无课程，可在英语新课列表中设置「下次上课时间」。</p>
            )}
          </section>

          <section className="section etr-panel jpls-today-list">
            <h2>
              {selectedDate === todayStr ? "今日课程" : `${selectedDate} 课程`} ({dayEvents.length})
            </h2>
            {dayEvents.length ? (
              <ul>
                {dayEvents.map((event) => {
                  const status = getEnLessonScheduleEventStatus(event, now);
                  return (
                    <li key={event.key}>
                      <button
                        type="button"
                        className={`jpls-today-item${
                          selectedEventKey === event.key ? " is-selected" : ""
                        }${status === "past" ? " jpls-today-item--past" : ""}`}
                        onClick={() => setSelectedEventKey(event.key)}
                      >
                        <span className="jpls-today-time">
                          {beijingTimeHm(event.start)} - {beijingTimeHm(event.end)}
                        </span>
                        <span className="jpls-today-meta">
                          {event.teachers} ·{" "}
                          {status === "past" ? "✓ 已结束 · 已上完课了，真棒" : eventStatusLabel(status)}
                        </span>
                        <span className="jpls-today-content">
                          {formatContentPreview(event.lesson.content, 2)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="jpls-muted">这一天没有预约课程。</p>
            )}
          </section>
          </div>

          <p className="jpls-tip">提示：点击课程块查看详情；有教案时可一键复制链接发给老师。</p>
        </aside>
      </div>

      <CopyToast message={copyToast} onDismiss={() => setCopyToast(null)} />
      <EnLessonSchedulePageStyles />
    </main>
  );
}
