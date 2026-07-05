"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminAuthGate } from "@/components/AdminAuthGate";
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
  getEnLessonScheduleEventStatus,
  type EnLessonScheduleEvent,
  type EnLessonScheduleEventStatus,
} from "@/lib/en-lesson-shared";
import { enLessonPath } from "@/lib/locale-path";
import { enVocabRefViewerPath } from "@/lib/en-vocab-ref-shared";
import { SITE_URL } from "@/lib/site";
import type { EnLessonRecord, EnLessonTeacher, EnVocabRef } from "@/lib/types";

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

  const handleExport = async () => {
    const text = exportScheduleText(visibleEvents, rangeLabel);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1500);
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
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1500);
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
                aria-label={`选择日期，${selectedDateRelativeLabel}`}
                onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
              />
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
                <span className="jpls-day-count">{dayEvents.length} 节课</span>
              </div>
              {dayBusyRange ? (
                <>
                  <h3 className="jpls-timeline-heading">时间轴</h3>
                  <div className="jpls-slot-grid">
                {dayTimelineSlotIndices.map((slotIndex) => {
                  const event = findEventForSlot(dayEvents, slotIndex);
                  const isHourSlot = slotIndex % 2 === 0;
                  const status = event ? getEnLessonScheduleEventStatus(event, now) : null;
                  const showDetails = event && isFirstSlotForEvent(event, slotIndex);
                  const encourageLabel = status ? eventTimelineEncourageLabel(status) : null;
                  return (
                    <div
                      key={slotIndex}
                      className={`jpls-slot-row${isHourSlot ? " is-hour" : ""}${
                        showNowLine && slotIndex === nowSlotIndex ? " has-now" : ""
                      }${event && showDetails ? " is-event-start" : ""}`}
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
                      <span className="jpls-week-count">{events.length}</span>
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

      <style jsx>{`
        :global(.page-wrap:has(.jp-lesson-schedule-page)) {
          max-width: min(1480px, 96vw);
        }
        .jp-lesson-schedule-page {
          padding-top: 1.25rem;
          padding-bottom: 2rem;
        }
        .jpls-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .jpls-header h1 {
          margin: 0 0 0.25rem;
          font-size: 1.5rem;
        }
        .jpls-sub {
          margin: 0;
          color: var(--muted);
          font-size: 0.875rem;
        }
        .jpls-back-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          padding: 0.45rem 0.85rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          text-decoration: none;
          font-size: 0.875rem;
        }
        .jpls-back-btn:hover {
          border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
        }
        .jpls-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .jpls-toolbar-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.625rem 0.75rem;
          flex: 1 1 24rem;
          min-width: 0;
        }
        .jpls-date-nav {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex: 1 1 15rem;
          min-width: 0;
        }
        .jpls-date-nav-center {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 0.5rem;
          min-width: 0;
          flex: 1 1 auto;
        }
        .jpls-date-relative {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
          line-height: 1.2;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .jpls-icon-btn,
        .jpls-export-btn,
        .jpls-view-tab {
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.8125rem;
        }
        .jpls-icon-btn {
          width: 2.25rem;
          height: 2.25rem;
          padding: 0;
          font-size: 1.1rem;
          line-height: 1;
          flex-shrink: 0;
        }
        .jpls-date-input {
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          border-radius: 8px;
          padding: 0.35rem 0.55rem;
          font-size: 0.875rem;
          min-height: 2.25rem;
          width: auto;
          flex: 1 1 9rem;
          min-width: 0;
        }
        .jpls-export-btn {
          padding: 0.35rem 0.75rem;
          min-height: 2.25rem;
        }
        .jpls-view-tabs {
          display: inline-flex;
          flex-shrink: 0;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }
        .jpls-view-tab {
          border: none;
          border-right: 1px solid var(--border);
          border-radius: 0;
          padding: 0.35rem 0.85rem;
          min-height: 2.25rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .jpls-view-tab:last-child {
          border-right: none;
        }
        .jpls-view-tab.is-active {
          background: color-mix(in srgb, var(--accent) 18%, var(--panel));
          color: var(--accent);
        }
        .jpls-toolbar-right {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          flex: 0 1 auto;
        }
        @media (max-width: 1100px) {
          .jpls-toolbar-right {
            width: 100%;
            margin-left: 0;
            justify-content: flex-start;
          }
        }
        @media (max-width: 920px) {
          .jpls-toolbar-controls {
            flex: 1 1 100%;
            flex-direction: column;
            align-items: stretch;
          }
          .jpls-view-tabs {
            width: 100%;
          }
          .jpls-view-tab {
            flex: 1 1 0;
          }
          .jpls-date-nav {
            width: 100%;
          }
        }
        .jpls-legend {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jpls-legend-dot {
          width: 0.65rem;
          height: 0.65rem;
          border-radius: 999px;
        }
        .jpls-legend-dot--free {
          background: color-mix(in srgb, var(--fall) 55%, transparent);
        }
        .jpls-legend-dot--busy {
          background: color-mix(in srgb, var(--rise) 70%, transparent);
        }
        .jpls-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
          gap: 1rem;
          align-items: stretch;
        }
        .jpls-calendar {
          min-height: 0;
          padding: 1rem;
          height: 100%;
        }
        .jpls-calendar--day-sync {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .jpls-day-view {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          height: 100%;
        }
        .jpls-calendar--day-sync .jpls-slot-grid {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .jpls-calendar--day-sync .jpls-slot-row {
          flex: 1 1 0;
          min-height: 1.5rem;
        }
        .jpls-calendar--day-sync .jpls-slot-row.is-event-start {
          flex: 1.35 1 0;
          min-height: 2rem;
        }
        .jpls-sidebar-panels {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .jpls-day-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
          font-weight: 600;
        }
        .jpls-day-weekday {
          color: var(--accent);
        }
        .jpls-timeline-heading {
          display: none;
          margin: 0 0 0.75rem;
          font-size: 1rem;
          font-weight: 600;
        }
        .jpls-day-count {
          font-size: 0.8125rem;
          color: var(--muted);
          font-weight: 400;
        }
        .jpls-day-empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          min-height: 12rem;
          color: var(--muted);
          font-size: 0.875rem;
          border: 1px dashed color-mix(in srgb, var(--border) 85%, transparent);
          border-radius: 10px;
        }
        .jpls-slot-grid {
          position: relative;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
        }
        .jpls-slot-row {
          display: grid;
          grid-template-columns: 3.5rem minmax(0, 1fr);
          min-height: 1.75rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
        }
        .jpls-slot-row.is-event-start {
          min-height: 2.35rem;
        }
        .jpls-slot-row.is-hour {
          border-bottom-color: color-mix(in srgb, var(--border) 100%, transparent);
        }
        .jpls-slot-row:last-child {
          border-bottom: none;
        }
        .jpls-slot-time {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 0.15rem 0.45rem 0.15rem 0;
          font-size: 0.6875rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
          border-right: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
          background: color-mix(in srgb, var(--panel) 90%, transparent);
        }
        .jpls-slot-row.is-hour .jpls-slot-time {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text);
        }
        .jpls-slot-cell {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
          width: 100%;
          min-height: 1.75rem;
          padding: 0.15rem 0.55rem;
          border: none;
          text-align: left;
          cursor: default;
        }
        .jpls-slot-row.is-event-start .jpls-slot-cell {
          min-height: 2.35rem;
        }
        .jpls-slot-cell.is-free {
          background: color-mix(in srgb, var(--fall) 10%, var(--panel));
        }
        .jpls-slot-cell.is-busy {
          background: var(--rise);
          color: #fff;
          cursor: pointer;
        }
        .jpls-slot-cell.is-busy.jpls-slot-cell--past {
          background: color-mix(in srgb, var(--fall) 22%, var(--panel));
          color: var(--text);
          opacity: 1;
          border-left: 3px solid color-mix(in srgb, var(--fall) 70%, transparent);
        }
        .jpls-slot-cell.is-busy.jpls-slot-cell--ongoing {
          background: color-mix(in srgb, var(--accent) 78%, var(--panel));
          color: #fff;
        }
        .jpls-slot-cell.is-busy:hover {
          background: color-mix(in srgb, var(--rise) 88%, #fff);
        }
        .jpls-slot-cell.is-busy.jpls-slot-cell--past:hover {
          background: color-mix(in srgb, var(--fall) 28%, var(--panel));
        }
        .jpls-slot-cell.is-selected {
          box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 75%, #fff);
        }
        .jpls-slot-cell--past {
          opacity: 1;
        }
        .jpls-slot-cell--ongoing {
          box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 65%, #fff);
        }
        .jpls-slot-free-label {
          font-size: 0.6875rem;
          color: color-mix(in srgb, var(--fall) 70%, var(--muted));
        }
        .jpls-slot-busy-label {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }
        .jpls-slot-busy-label--past {
          color: color-mix(in srgb, var(--fall) 82%, var(--text));
        }
        .jpls-slot-busy-encourage {
          font-size: 0.6875rem;
          color: color-mix(in srgb, var(--fall) 75%, var(--muted));
          flex-shrink: 0;
        }
        .jpls-slot-busy-time {
          font-size: 0.75rem;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .jpls-slot-busy-meta {
          font-size: 0.6875rem;
          opacity: 0.92;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: min(100%, 28rem);
        }
        .jpls-now-line {
          position: absolute;
          left: 3.5rem;
          right: 0;
          height: 2px;
          background: var(--accent);
          z-index: 3;
          pointer-events: none;
        }
        .jpls-now-line span {
          position: absolute;
          right: 0.5rem;
          top: -1rem;
          font-size: 0.6875rem;
          color: var(--accent);
          background: var(--panel);
          padding: 0 0.25rem;
        }
        .jpls-week-view {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 0.5rem;
          min-height: 520px;
        }
        .jpls-week-col {
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
          background: color-mix(in srgb, var(--fall) 8%, var(--panel));
        }
        .jpls-week-col.is-today {
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
        }
        .jpls-week-col-head {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          padding: 0.55rem;
          border: none;
          background: color-mix(in srgb, var(--panel) 80%, transparent);
          cursor: pointer;
          font-size: 0.8125rem;
        }
        .jpls-week-count {
          color: var(--muted);
          font-size: 0.75rem;
        }
        .jpls-week-list {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 0.45rem;
        }
        .jpls-week-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.1rem;
          padding: 0.45rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 16%, var(--panel));
          cursor: pointer;
          font-size: 0.75rem;
          text-align: left;
        }
        .jpls-week-item.is-selected {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
        }
        .jpls-week-empty {
          margin: 0;
          padding: 0.5rem;
          color: var(--muted);
          font-size: 0.8125rem;
        }
        .jpls-month-head {
          font-weight: 600;
          margin-bottom: 0.75rem;
        }
        .jpls-month-weekdays,
        .jpls-month-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 0.35rem;
        }
        .jpls-month-weekdays span {
          text-align: center;
          font-size: 0.75rem;
          color: var(--muted);
          padding-bottom: 0.25rem;
        }
        .jpls-month-cell {
          min-height: 4.5rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--fall) 8%, var(--panel));
          padding: 0.35rem;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
        }
        .jpls-month-cell.is-outside {
          opacity: 0.45;
        }
        .jpls-month-cell.is-today {
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
        }
        .jpls-month-cell.is-selected {
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
        }
        .jpls-month-day {
          font-size: 0.8125rem;
          font-weight: 600;
        }
        .jpls-month-dots {
          display: flex;
          align-items: center;
          gap: 0.2rem;
          flex-wrap: wrap;
        }
        .jpls-month-dot {
          width: 0.45rem;
          height: 0.45rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--rise) 70%, transparent);
        }
        .jpls-month-more {
          font-size: 0.6875rem;
          color: var(--muted);
        }
        .jpls-sidebar {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          position: sticky;
          top: 1rem;
        }
        .jpls-detail,
        .jpls-today-list {
          padding: 1rem;
        }
        .jpls-detail h2,
        .jpls-today-list h2 {
          margin: 0 0 0.75rem;
          font-size: 1rem;
        }
        .jpls-detail-list {
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .jpls-detail-list dt {
          font-size: 0.75rem;
          color: var(--muted);
          margin-bottom: 0.15rem;
        }
        .jpls-detail-list dd {
          margin: 0;
          font-size: 0.875rem;
          line-height: 1.45;
        }
        .jpls-content-line {
          display: block;
        }
        .jpls-link-row {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .jpls-link-row a {
          color: var(--accent);
        }
        .jpls-link-row button {
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          border-radius: 6px;
          padding: 0.2rem 0.55rem;
          font-size: 0.75rem;
          cursor: pointer;
        }
        .jpls-status-badge {
          display: inline-flex;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          font-size: 0.75rem;
        }
        .jpls-status-badge--past {
          background: color-mix(in srgb, var(--muted) 18%, transparent);
          color: var(--muted);
        }
        .jpls-status-badge--ongoing {
          background: color-mix(in srgb, var(--accent) 18%, transparent);
          color: var(--accent);
        }
        .jpls-status-badge--upcoming {
          background: color-mix(in srgb, var(--rise) 16%, transparent);
          color: var(--rise);
        }
        .jpls-today-list ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .jpls-today-item {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.15rem;
          padding: 0.65rem 0.75rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--panel);
          cursor: pointer;
          text-align: left;
        }
        .jpls-today-item.is-selected {
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }
        .jpls-today-item--past {
          border-color: color-mix(in srgb, var(--fall) 35%, var(--border));
          background: color-mix(in srgb, var(--fall) 8%, var(--panel));
        }
        .jpls-today-time {
          font-size: 0.8125rem;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .jpls-today-meta {
          font-size: 0.75rem;
          color: var(--muted);
        }
        .jpls-today-content {
          font-size: 0.8125rem;
          line-height: 1.4;
        }
        .jpls-tip {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.45;
        }
        .jpls-muted {
          margin: 0;
          color: var(--muted);
          font-size: 0.875rem;
        }
        .jpls-error {
          color: var(--rise);
          margin: 0 0 0.75rem;
        }
        @media (max-width: 767px) {
          .jpls-layout {
            grid-template-columns: minmax(0, 1fr);
          }
          .jpls-sidebar {
            display: contents;
          }
          .jpls-sidebar-panels {
            order: 1;
            width: 100%;
          }
          .jpls-calendar {
            order: 2;
            width: 100%;
            height: auto;
            min-height: 0;
          }
          .jpls-tip {
            order: 3;
            width: 100%;
          }
          .jpls-calendar--day-sync {
            display: block;
            overflow: visible;
            height: auto;
          }
          .jpls-day-view {
            flex: none;
            height: auto;
            min-height: 0;
            overflow: visible;
          }
          .jpls-calendar--day-sync .jpls-slot-grid {
            flex: none;
            min-height: 0;
            overflow: visible;
          }
          .jpls-calendar--day-sync .jpls-slot-row {
            flex: none;
          }
        }
        @media (min-width: 768px) and (max-width: 960px) {
          .jpls-layout {
            grid-template-columns: 1fr;
          }
          .jpls-week-view {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 560px) and (min-width: 768px) {
          .jpls-header {
            flex-direction: column;
          }
          .jpls-toolbar-right {
            margin-left: 0;
          }
          .jpls-week-view {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
