"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { JpLessonHalfHourTimeGridPicker } from "@/components/JpLessonHalfHourTimeGridPicker";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import {
  beijingTodayDateString,
  formatNextClassHalfHourLabel,
  getLessonClassSchedules,
  JP_LESSON_CLASS_DURATION_MINUTES,
  listNextClassHalfHourTimes,
  nextClassAtFromDatetimeLocalValue,
  nextClassAtToDatetimeLocalValue,
  splitNextClassAtLocalValue,
} from "@/lib/jp-lesson-shared";
import {
  formatJpLessonDefaultDurationFormValue,
  resolveJpLessonDefaultDurationFromTeachers,
} from "@/lib/jp-lesson-teacher-default-duration";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import {
  findDuplicateLessonScheduleRowKeys,
  hasDuplicateLessonScheduleRows,
  LESSON_SCHEDULE_DUPLICATE_MESSAGE,
} from "@/lib/lesson-class-schedule-form";
import type {
  JpLessonClassScheduleInput,
  JpLessonRecord,
  JpLessonTeacher,
} from "@/lib/types";

type Props = {
  open: boolean;
  lesson: JpLessonRecord | null;
  teachers?: JpLessonTeacher[];
  saving?: boolean;
  onClose: () => void;
  onSave: (schedules: JpLessonClassScheduleInput[]) => void;
  onEditTeachers?: () => void;
};

type ScheduleRow = {
  key: string;
  date: string;
  time: string;
  duration: string;
};

const HALF_HOUR_OPTIONS = listNextClassHalfHourTimes();
const DURATION_OPTIONS = JP_LESSON_CLASS_DURATION_MINUTES.map((minutes) => ({
  value: String(minutes),
  label: minutes === 60 ? "1小时" : `${minutes}分钟`,
}));

function createRowKey(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyRow(defaultDuration = ""): ScheduleRow {
  return {
    key: createRowKey(),
    date: beijingTodayDateString(),
    time: "",
    duration: defaultDuration,
  };
}

function rowsFromLesson(
  lesson: JpLessonRecord,
  defaultDuration: string
): ScheduleRow[] {
  const schedules = getLessonClassSchedules(lesson);
  if (!schedules.length) return [emptyRow(defaultDuration)];

  return schedules.map((schedule) => {
    const local = nextClassAtToDatetimeLocalValue(schedule.class_at);
    const parts = local ? splitNextClassAtLocalValue(local) : null;
    return {
      key: createRowKey(),
      date: parts?.date ?? "",
      time: parts?.time ?? "",
      duration:
        schedule.duration_minutes != null
          ? String(schedule.duration_minutes)
          : defaultDuration,
    };
  });
}

export function JpLessonNextClassEditModal({
  open,
  lesson,
  teachers = [],
  saving = false,
  onClose,
  onSave,
  onEditTeachers,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<ScheduleRow[]>([emptyRow()]);
  const saveProgress = useSaveProgressBar(saving);

  const selectedTeachers = useMemo(() => {
    if (!lesson) return [] as JpLessonTeacher[];
    return (lesson.teacher_ids ?? [])
      .map((id) => teachers.find((teacher) => teacher.id === id))
      .filter((teacher): teacher is JpLessonTeacher => teacher != null);
  }, [lesson, teachers]);

  const defaultDuration = useMemo(
    () =>
      formatJpLessonDefaultDurationFormValue(
        resolveJpLessonDefaultDurationFromTeachers(selectedTeachers)
      ),
    [selectedTeachers]
  );

  const teacherJumpLabel = useMemo(() => {
    if (!selectedTeachers.length) return "去设置老师";
    const names = selectedTeachers.map((teacher) => teacher.name.trim()).filter(Boolean);
    if (!names.length) return "去设置老师";
    return `上课老师：${names.join("、")}（点击更改）`;
  }, [selectedTeachers]);

  const timeOptions = useMemo(
    () =>
      HALF_HOUR_OPTIONS.map((value) => ({
        value,
        label: formatNextClassHalfHourLabel(value),
      })),
    []
  );

  const duplicateRowKeys = useMemo(
    () => findDuplicateLessonScheduleRowKeys(rows),
    [rows]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !lesson) return;
    setRows(rowsFromLesson(lesson, defaultDuration));
    // 仅在打开/切换课程时灌草稿；老师列表晚到用下面 effect 补空时长
    // eslint-disable-next-line react-hooks/exhaustive-deps -- teachers/defaultDuration snapshot at open
  }, [open, lesson?.id]);

  // 老师列表异步到达后，只填仍为空的时长，不覆盖用户已选
  useEffect(() => {
    if (!open || !defaultDuration) return;
    setRows((prev) =>
      prev.map((row) =>
        row.duration.trim() ? row : { ...row, duration: defaultDuration }
      )
    );
  }, [open, defaultDuration]);

  const updateRow = (key: string, patch: Partial<Omit<ScheduleRow, "key">>) => {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(defaultDuration)]);
  };

  const removeRow = (key: string) => {
    if (!window.confirm("确定删除这条预约吗？")) return;
    setRows((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.length ? next : [emptyRow(defaultDuration)];
    });
  };

  const handleSave = () => {
    if (hasDuplicateLessonScheduleRows(rows)) {
      return;
    }

    const schedules: JpLessonClassScheduleInput[] = [];

    for (const row of rows) {
      const hasDate = row.date.trim();
      const hasTime = row.time.trim();
      if (!hasDate && !hasTime) continue;
      if (!hasDate || !hasTime) continue;

      const classAt = nextClassAtFromDatetimeLocalValue(`${row.date}T${row.time}`);
      if (!classAt) continue;

      schedules.push({
        class_at: classAt,
        duration_minutes: row.duration ? Number(row.duration) : null,
      });
    }

    onSave(schedules);
  };

  const handleClear = () => {
    setRows([emptyRow(defaultDuration)]);
  };

  if (!open || !mounted || !lesson) return null;

  return createPortal(
    <div
      className="jp-lesson-next-class-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="jp-lesson-next-class-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-lesson-next-class-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-lesson-next-class-header">
          <div>
            <h2 id="jp-lesson-next-class-modal-title">设置上课时间</h2>
            <p className="jp-lesson-next-class-modal-lesson">
              课程 #{lesson.id} · {lesson.content}
            </p>
          </div>
          <button
            type="button"
            className="jp-lesson-next-class-close"
            aria-label="关闭"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {onEditTeachers ? (
          <div className="jp-lesson-next-class-teacher-jump">
            <button
              type="button"
              className="jp-lesson-next-class-teacher-jump-btn"
              disabled={saving}
              onClick={onEditTeachers}
            >
              {teacherJumpLabel}
            </button>
            {defaultDuration ? (
              <p className="jp-lesson-next-class-teacher-duration-hint">
                新预约默认时长：
                {defaultDuration === "60" ? "1小时" : `${defaultDuration}分钟`}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="jp-lesson-next-class-body">
          <fieldset className="jp-lesson-next-class-fieldset" disabled={saving}>
            <legend>上课时间（北京时间，整点 / 半点）</legend>
            <div className="jp-lesson-next-class-rows">
              {rows.map((row, index) => (
                <div
                  key={row.key}
                  className={`jp-lesson-next-class-row${
                    duplicateRowKeys.has(row.key) ? " is-duplicate" : ""
                  }`}
                >
                  <div className="jp-lesson-next-class-row-head">
                    <span className="jp-lesson-next-class-row-title">
                      预约 {index + 1}
                    </span>
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        className="jp-lesson-next-class-row-remove"
                        aria-label={`删除预约 ${index + 1}`}
                        onClick={() => removeRow(row.key)}
                      >
                        删除
                      </button>
                    ) : null}
                  </div>
                  <div className="jp-lesson-next-class-fields">
                    <label className="jp-lesson-next-class-field">
                      <span>日期</span>
                      <input
                        type="date"
                        className="jp-lesson-next-class-input"
                        value={row.date}
                        onChange={(e) => updateRow(row.key, { date: e.target.value })}
                      />
                    </label>
                    <div className="jp-lesson-next-class-field">
                      <span>时间</span>
                      <JpLessonHalfHourTimeGridPicker
                        value={row.time}
                        options={timeOptions}
                        disabled={saving}
                        onChange={(time) => updateRow(row.key, { time })}
                      />
                    </div>
                    <label className="jp-lesson-next-class-field">
                      <span>时长</span>
                      <select
                        className="jp-lesson-next-class-input jp-lesson-next-class-time-select"
                        value={row.duration}
                        onChange={(e) =>
                          updateRow(row.key, { duration: e.target.value })
                        }
                      >
                        <option value="">请选择</option>
                        {DURATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {duplicateRowKeys.has(row.key) ? (
                    <p className="jp-lesson-next-class-row-dup" role="alert">
                      {LESSON_SCHEDULE_DUPLICATE_MESSAGE}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="jp-lesson-next-class-add"
              disabled={saving}
              onClick={addRow}
            >
              + 添加预约
            </button>
            <p className="jp-lesson-next-class-hint">
              点击时间后在方块网格中选择整点或半点（如 13:00、13:30）；可添加多条预约；全部留空表示未定义。
            </p>
          </fieldset>

          {saveProgress.visible ? (
            <JpVocabSaveProgressBar
              label={jpVocabSaveProgressLabel("save")}
              percent={saveProgress.percent}
              fullWidth
            />
          ) : null}
        </div>

        <div className="jp-lesson-next-class-actions">
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={saving}
            onClick={handleClear}
          >
            清除
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn jp-lesson-action-btn--primary"
            disabled={saving || duplicateRowKeys.size > 0}
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>

      <style jsx>{`
        .jp-lesson-next-class-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-lesson-next-class-modal {
          display: flex;
          flex-direction: column;
          width: min(720px, 100%);
          max-height: min(94vh, 900px);
          overflow: hidden;
          padding: 1.15rem 1.25rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-lesson-next-class-body {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding-right: 0.1rem;
        }

        .jp-lesson-next-class-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .jp-lesson-next-class-header h2 {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-lesson-next-class-modal-lesson {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.8125rem;
          line-height: 1.45;
        }

        .jp-lesson-next-class-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }

        .jp-lesson-next-class-fieldset {
          margin: 0 0 0.75rem;
          padding: 0;
          border: none;
        }

        .jp-lesson-next-class-fieldset legend {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-bottom: 0.5rem;
        }

        .jp-lesson-next-class-teacher-jump {
          margin: 0 0 0.75rem;
        }

        .jp-lesson-next-class-teacher-jump-btn {
          width: 100%;
          min-height: 2.2rem;
          padding: 0.45rem 0.75rem;
          border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
          border-radius: 8px;
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
          color: var(--accent);
          font-size: 0.875rem;
          cursor: pointer;
        }

        .jp-lesson-next-class-teacher-jump-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 18%, var(--panel));
        }

        .jp-lesson-next-class-teacher-duration-hint {
          margin: 0.4rem 0 0;
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--muted);
        }

        .jp-lesson-next-class-rows {
          display: grid;
          gap: 0.75rem;
        }

        .jp-lesson-next-class-row {
          padding: 0.65rem 0.7rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: color-mix(in srgb, var(--bg) 28%, var(--panel));
        }

        .jp-lesson-next-class-row.is-duplicate {
          border-color: color-mix(in srgb, var(--rise) 45%, var(--border));
          background: color-mix(in srgb, var(--rise) 6%, var(--panel));
        }

        .jp-lesson-next-class-row-dup {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          line-height: 1.4;
          color: var(--rise);
        }

        .jp-lesson-next-class-row-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.55rem;
        }

        .jp-lesson-next-class-row-title {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--muted);
        }

        .jp-lesson-next-class-row-remove {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0.15rem 0.25rem;
        }

        .jp-lesson-next-class-row-remove:hover {
          color: var(--rise);
        }

        .jp-lesson-next-class-fields {
          display: grid;
          gap: 0.65rem;
        }

        .jp-lesson-next-class-field {
          display: grid;
          gap: 0.35rem;
        }

        .jp-lesson-next-class-field span {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-next-class-input {
          width: 100%;
          box-sizing: border-box;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font-size: 0.875rem;
        }

        .jp-lesson-next-class-time-select {
          cursor: pointer;
        }

        .jp-lesson-next-class-add {
          margin-top: 0.65rem;
          width: 100%;
          padding: 0.55rem 0.75rem;
          border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border));
          border-radius: 8px;
          background: color-mix(in srgb, var(--accent) 6%, var(--panel));
          color: var(--accent);
          font-size: 0.875rem;
          cursor: pointer;
        }

        .jp-lesson-next-class-add:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
        }

        .jp-lesson-next-class-hint {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .jp-lesson-next-class-actions {
          flex-shrink: 0;
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
          background: var(--panel);
        }

        :global(.jp-lesson-action-btn--primary) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
        }
      `}</style>
    </div>,
    document.body
  );
}
