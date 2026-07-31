"use client";

import { type CSSProperties, type RefObject } from "react";
import {
  JpLessonScheduleManualTeacherLinks,
  eventContentPreview,
  eventStatusLabel,
  eventTimelineEncourageLabel,
  eventTimelinePrimaryLabel,
  findEventForSlot,
  formatSlotTime,
  getEventSlotSpan,
  isFirstSlotForEvent,
  scheduleSubjectCssClass,
  scheduleSubjectLabel,
  shouldRenderTimelineSlot,
  type DayScheduleEvent,
  type ViewMode,
} from "@/components/jp-lesson-schedule-page/jp-lesson-schedule-page-helpers";
import { JpLessonTeacherDisplay } from "@/components/JpLessonTeacherDisplay";
import {
  beijingRelativeWeekdayLabel,
  beijingTimeHm,
  formatLessonContentLines,
  formatLessonScheduleDaySummary,
  getJpLessonScheduleEventStatus,
} from "@/lib/jp-lesson-shared";
import type { Locale } from "@/i18n/messages";
import type { JpLessonManualSchedule } from "@/lib/jp-lesson-manual-schedule";
import { MANUAL_SCHEDULE_LINKED_LESSONS_MAX } from "@/lib/jp-lesson-manual-schedule-linked";
import { detectScheduleTeacherSubjectFromTitle } from "@/lib/jp-lesson-teacher-rate";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import {
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
} from "@/lib/jp-vocab-save-progress";
import type {
  EnLessonRecord,
  EnLessonTeacher,
  JpLessonRecord,
  JpLessonTeacher,
} from "@/lib/types";

export type ManualScheduleLinkedLessonDisplay = {
  key: string;
  label: string;
  /** 教案查看页；无 ref_key 时仅展示文案 */
  href: string | null;
};

export type JpLessonScheduleLayoutProps = {
  calendarRef: RefObject<HTMLElement | null>;
  sidebarPanelsRef: RefObject<HTMLDivElement | null>;
  viewMode: ViewMode;
  selectedDate: string;
  selectedDateRelativeLabel: string;
  dayBusyRange: { start: number; end: number } | null;
  dayTimelineSlotIndices: number[];
  dayTimelineRowCount: number;
  dayEvents: DayScheduleEvent[];
  weekDates: string[];
  monthDays: string[];
  eventsForDate: (dateStr: string) => DayScheduleEvent[];
  now: Date;
  nowSlotIndex: number;
  nowTopPct: number;
  showNowLine: boolean;
  selectedEventKey: string | null;
  setSelectedEventKey: (key: string | null) => void;
  setSelectedDate: (date: string) => void;
  setViewMode: (mode: ViewMode) => void;
  selectedEvent: DayScheduleEvent | null;
  selectedViewUrl: string | null;
  selectedJpLesson: JpLessonRecord | null;
  selectedEnLesson: EnLessonRecord | null;
  selectedTeacherHref: (teacherId: number) => string;
  selectedManualSchedule: JpLessonManualSchedule | null;
  selectedManualLinkedLessons: ManualScheduleLinkedLessonDisplay[];
  teachersById: Map<number, JpLessonTeacher>;
  enTeachersById: Map<number, EnLessonTeacher>;
  teachers: JpLessonTeacher[];
  locale: Locale;
  todayStr: string;
  copyLessonLink: () => void | Promise<void>;
  copyTeacherMessageTemplate: () => void | Promise<void>;
  openLessonReschedule: () => void;
  openManualModal: (manual?: JpLessonManualSchedule | null, mode?: "full" | "time") => void;
  openLinkLessonPick: () => void;
  handleDeleteManualSchedule: () => void;
  linkingManualLesson?: boolean;
  linkLessonProgressPercent?: number | null;
};

export function JpLessonScheduleLayout({
  calendarRef,
  sidebarPanelsRef,
  viewMode,
  selectedDate,
  selectedDateRelativeLabel,
  dayBusyRange,
  dayTimelineSlotIndices,
  dayTimelineRowCount,
  dayEvents,
  weekDates,
  monthDays,
  eventsForDate,
  now,
  nowSlotIndex,
  nowTopPct,
  showNowLine,
  selectedEventKey,
  setSelectedEventKey,
  setSelectedDate,
  setViewMode,
  selectedEvent,
  selectedViewUrl,
  selectedJpLesson,
  selectedEnLesson,
  selectedTeacherHref,
  selectedManualSchedule,
  selectedManualLinkedLessons,
  teachersById,
  enTeachersById,
  teachers,
  locale,
  todayStr,
  copyLessonLink,
  copyTeacherMessageTemplate,
  openLessonReschedule,
  openManualModal,
  openLinkLessonPick,
  handleDeleteManualSchedule,
  linkingManualLesson = false,
  linkLessonProgressPercent = null,
}: JpLessonScheduleLayoutProps) {
  return (
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
                      const status = event ? getJpLessonScheduleEventStatus(event, now) : null;
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
                            }${event?.subject ? ` jpls-slot-cell--${scheduleSubjectCssClass(event.subject)}` : ""}${
                              event && selectedEventKey === event.key ? " is-selected" : ""
                            }`}
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
                                  {status
                                    ? event.subject === "manual" && status !== "past"
                                      ? "手动日程"
                                      : event.subject !== "manual" && status !== "past"
                                        ? `${scheduleSubjectLabel(event.subject)}课`
                                        : eventTimelinePrimaryLabel(status)
                                    : "要上课"}
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
                                      {event.teachers} · {eventContentPreview(event, 2)}
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
                  <div className="jpls-week-range" aria-hidden="true">
                    {weekDates[0]} ~ {weekDates[6]}
                  </div>
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
                          <span className="jpls-week-col-main">
                            <span className="jpls-week-col-weekday">
                              {beijingRelativeWeekdayLabel(dateStr, now)}
                            </span>
                            <span className="jpls-week-col-date">{dateStr.slice(5)}</span>
                          </span>
                          <span className="jpls-week-count">
                            {formatLessonScheduleDaySummary(events)}
                          </span>
                        </button>
                        <div className="jpls-week-list">
                          {events.length ? (
                            events.map((event) => {
                              const status = getJpLessonScheduleEventStatus(event, now);
                              return (
                                <button
                                  key={event.key}
                                  type="button"
                                  className={`jpls-week-item${
                                    selectedEventKey === event.key ? " is-selected" : ""
                                  }${status ? ` jpls-week-item--${status}` : ""}${
                                    event.subject ? ` jpls-week-item--${scheduleSubjectCssClass(event.subject)}` : ""
                                  }`}
                                  onClick={() => setSelectedEventKey(event.key)}
                                >
                                  {status === "past" ? (
                                    <span className="jpls-week-item-done">✓ 已结束</span>
                                  ) : (
                                    <span
                                      className={`jpls-week-item-subject jpls-week-item-subject--${scheduleSubjectCssClass(event.subject)}`}
                                    >
                                      {scheduleSubjectLabel(event.subject)}
                                    </span>
                                  )}
                                  <span className="jpls-week-item-time">
                                    {beijingTimeHm(event.start)} - {beijingTimeHm(event.end)}
                                  </span>
                                  <span className="jpls-week-item-meta">{event.teachers}</span>
                                  <span className="jpls-week-item-content">
                                    {eventContentPreview(event, 2)}
                                  </span>
                                </button>
                              );
                            })
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
                <h2>
                  {selectedEvent?.subject === "manual"
                    ? "手动日程详情"
                    : `${scheduleSubjectLabel(selectedEvent?.subject ?? "jp")}课程详情`}
                </h2>
                {selectedEvent ? (
                  <>
                    <dl className="jpls-detail-list">
                      <div>
                        <dt>类型</dt>
                        <dd>
                          <span
                            className={`jpls-status-badge jpls-status-badge--${scheduleSubjectCssClass(selectedEvent.subject)}`}
                          >
                            {selectedEvent.subject === "manual"
                              ? "手动日程 · 不同步到新课列表"
                              : `${scheduleSubjectLabel(selectedEvent.subject)}新课`}
                          </span>
                        </dd>
                      </div>
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
                            className={`jpls-status-badge jpls-status-badge--${getJpLessonScheduleEventStatus(selectedEvent, now)}`}
                          >
                            {eventStatusLabel(getJpLessonScheduleEventStatus(selectedEvent, now))}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>{selectedEvent.source === "manual" ? "标题" : "课程内容"}</dt>
                        <dd>
                          {formatLessonContentLines(selectedEvent.displayContent, 4).map((line) => (
                            <span key={line} className="jpls-content-line">
                              {line}
                            </span>
                          ))}
                        </dd>
                      </div>
                      <div>
                        <dt>老师</dt>
                        <dd>
                          {selectedJpLesson ? (
                            <JpLessonTeacherDisplay
                              lesson={selectedJpLesson}
                              teachersById={teachersById}
                              locale={locale}
                              teacherHref={selectedTeacherHref}
                            />
                          ) : selectedEnLesson ? (
                            <JpLessonTeacherDisplay
                              lesson={selectedEnLesson}
                              teachersById={enTeachersById}
                              locale={locale}
                              teacherHref={selectedTeacherHref}
                            />
                          ) : (
                            <JpLessonScheduleManualTeacherLinks
                              text={selectedEvent.teachers}
                              teachers={teachers}
                              locale={locale}
                            />
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>时长</dt>
                        <dd>{selectedEvent.durationMinutes} 分钟</dd>
                      </div>
                      {selectedEvent.manualNote ? (
                        <div>
                          <dt>备注</dt>
                          <dd>{selectedEvent.manualNote}</dd>
                        </div>
                      ) : null}
                      {selectedManualSchedule &&
                      (selectedEvent.source === "manual" ||
                        selectedManualLinkedLessons.length > 0) ? (
                        <div>
                          <dt>教材</dt>
                          <dd className="jpls-manual-linked-lessons">
                            {selectedManualLinkedLessons.length > 0 ? (
                              selectedManualLinkedLessons.map((item) =>
                                item.href ? (
                                  <a
                                    key={item.key}
                                    className="jpls-manual-linked-lesson"
                                    href={item.href}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {item.label}
                                  </a>
                                ) : (
                                  <span key={item.key} className="jpls-manual-linked-lesson">
                                    {item.label}
                                  </span>
                                )
                              )
                            ) : (
                              <span className="jpls-muted">未关联</span>
                            )}
                          </dd>
                        </div>
                      ) : null}
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
                    {linkingManualLesson ? (
                      <div className="jpls-detail-link-progress">
                        <JpVocabSaveProgressBar
                          label={
                            linkLessonProgressPercent != null &&
                            linkLessonProgressPercent <= 12
                              ? jpVocabSaveProgressLabel("save", { queued: true })
                              : "正在关联教材并同步到新课…"
                          }
                          percent={
                            linkLessonProgressPercent != null
                              ? linkLessonProgressPercent
                              : jpVocabSaveProgressDisplayPercent(null)
                          }
                          fullWidth
                        />
                      </div>
                    ) : null}
                    <div className="jpls-detail-actions">
                      {selectedManualSchedule ? (
                        <>
                          {selectedEvent.source === "manual" ? (
                            <>
                              <button
                                type="button"
                                disabled={linkingManualLesson}
                                onClick={() => openManualModal(selectedManualSchedule, "full")}
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                disabled={linkingManualLesson}
                                onClick={() => openManualModal(selectedManualSchedule, "time")}
                              >
                                改时
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={linkingManualLesson}
                              onClick={openLessonReschedule}
                            >
                              改时
                            </button>
                          )}
                          <button
                            type="button"
                            className="jpls-link-lesson-btn"
                            disabled={
                              linkingManualLesson ||
                              (selectedManualSchedule.linked_lessons?.length ?? 0) >=
                                MANUAL_SCHEDULE_LINKED_LESSONS_MAX ||
                              detectScheduleTeacherSubjectFromTitle(
                                selectedManualSchedule.title
                              ) === "ko"
                            }
                            title={
                              (selectedManualSchedule.linked_lessons?.length ?? 0) >=
                              MANUAL_SCHEDULE_LINKED_LESSONS_MAX
                                ? "已关联 2 本教材"
                                : detectScheduleTeacherSubjectFromTitle(
                                      selectedManualSchedule.title
                                    ) === "ko"
                                  ? "韩语暂无新课教材可关联"
                                  : "直接选择教材关联，无需打开编辑"
                            }
                            onClick={openLinkLessonPick}
                          >
                            关联教材
                          </button>
                          <button
                            type="button"
                            className="jpls-copy-template-btn"
                            disabled={linkingManualLesson}
                            title="复制含时间与教案链接的文字，可直接发给老师"
                            onClick={() => void copyTeacherMessageTemplate()}
                          >
                            复制文字模板
                          </button>
                          {selectedEvent.source === "manual" ? (
                            <button
                              type="button"
                              className="jpls-manual-delete-btn"
                              disabled={linkingManualLesson}
                              onClick={handleDeleteManualSchedule}
                            >
                              删除
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={openLessonReschedule}>
                            改时
                          </button>
                          <button
                            type="button"
                            className="jpls-copy-template-btn"
                            title="复制含时间与教案链接的文字，可直接发给老师"
                            onClick={() => void copyTeacherMessageTemplate()}
                          >
                            复制文字模板
                          </button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="jpls-muted">
                    当前日期暂无课程，可在日语/英语新课列表中设置「下次上课时间」，或点击「手动添加日程」。
                  </p>
                )}
              </section>

              <section className="section etr-panel jpls-today-list">
                <h2>
                  {selectedDate === todayStr ? "今日课程" : `${selectedDate} 课程`} ({dayEvents.length})
                </h2>
                {dayEvents.length ? (
                  <ul>
                    {dayEvents.map((event) => {
                      const status = getJpLessonScheduleEventStatus(event, now);
                      return (
                        <li key={event.key}>
                          <button
                            type="button"
                            className={`jpls-today-item${
                              selectedEventKey === event.key ? " is-selected" : ""
                            }${status === "past" ? " jpls-today-item--past" : ""}${
                              event.subject ? ` jpls-today-item--${scheduleSubjectCssClass(event.subject)}` : ""
                            }`}
                            onClick={() => setSelectedEventKey(event.key)}
                          >
                            <span className="jpls-today-time">
                              {beijingTimeHm(event.start)} - {beijingTimeHm(event.end)}
                            </span>
                            <span className="jpls-today-meta">
                              {scheduleSubjectLabel(event.subject)} · {event.teachers} ·{" "}
                              {status === "past" ? "✓ 已结束 · 已上完课了，真棒" : eventStatusLabel(status)}
                            </span>
                            <span className="jpls-today-content">
                              {eventContentPreview(event, 2)}
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

              <p className="jpls-tip">
                提示：点击课程块查看详情；可「关联教材」「复制文字模板」直接发给老师上课。
              </p>
            </aside>
          </div>
  );
}
