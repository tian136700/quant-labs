"use client";

import { addBeijingCalendarDays, formatLessonScheduleDaySummary, formatLessonScheduleDurationLabel } from "@/lib/jp-lesson-shared";
import { enLessonPath, jpLessonPath } from "@/lib/locale-path";
import type { DayScheduleEvent, ViewMode } from "@/components/jp-lesson-schedule-page/jp-lesson-schedule-page-helpers";

export type JpLessonScheduleToolbarProps = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedDate: string;
  setSelectedDate: (updater: string | ((prev: string) => string)) => void;
  selectedDateRelativeLabel: string;
  dayEvents: DayScheduleEvent[];
  historicalDurationTotals: { jpMinutes: number; enMinutes: number; koMinutes: number; totalMinutes: number };
  openManualModal: () => void;
};

export function JpLessonScheduleToolbar(props: JpLessonScheduleToolbarProps) {
  const {
    viewMode, setViewMode, selectedDate, setSelectedDate, selectedDateRelativeLabel,
    dayEvents, historicalDurationTotals, openManualModal,
  } = props;
  return (
    <>
      <header className="jpls-header">
        <div>
          <h1>日程管理</h1>
          <p className="jpls-sub">
            统一查看日语新课、英语新课与手动添加的预约时间（北京时间），手动日程仅在本页可见、各端同步
          </p>
        </div>
        <div className="jpls-header-links">
          <a className="jpls-back-btn" href={jpLessonPath()}>
            ← 日语新课
          </a>
          <a className="jpls-back-btn" href={enLessonPath()}>
            ← 英语新课
          </a>
        </div>
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
              aria-label={viewMode === "week" ? "上一周" : viewMode === "month" ? "上一月" : "上一天"}
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
              aria-label={viewMode === "week" ? "下一周" : viewMode === "month" ? "下一月" : "下一天"}
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
          <div
            className="jpls-duration-totals"
            aria-label={`历史总计上课时间：日语${formatLessonScheduleDurationLabel(historicalDurationTotals.jpMinutes)}，英语${formatLessonScheduleDurationLabel(historicalDurationTotals.enMinutes)}，韩语${formatLessonScheduleDurationLabel(historicalDurationTotals.koMinutes)}，总计${formatLessonScheduleDurationLabel(historicalDurationTotals.totalMinutes)}`}
          >
            <span className="jpls-legend jpls-duration-total">
              <span className="jpls-legend-dot jpls-legend-dot--jp" />
              日语{" "}
              <strong>{formatLessonScheduleDurationLabel(historicalDurationTotals.jpMinutes)}</strong>
            </span>
            <span className="jpls-legend jpls-duration-total">
              <span className="jpls-legend-dot jpls-legend-dot--en" />
              英语{" "}
              <strong>{formatLessonScheduleDurationLabel(historicalDurationTotals.enMinutes)}</strong>
            </span>
            <span className="jpls-legend jpls-duration-total">
              <span className="jpls-legend-dot jpls-legend-dot--ko" />
              韩语{" "}
              <strong>{formatLessonScheduleDurationLabel(historicalDurationTotals.koMinutes)}</strong>
            </span>
            <span className="jpls-legend jpls-duration-total jpls-duration-total--sum">
              总计{" "}
              <strong>
                {formatLessonScheduleDurationLabel(historicalDurationTotals.totalMinutes)}
              </strong>
            </span>
          </div>
          <button
            type="button"
            className="jpls-manual-add-btn"
            onClick={() => openManualModal()}
          >
            手动添加日程
          </button>
        </div>
      </div>
    </>
  );
}
