"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { JpLessonHalfHourTimeGridPicker } from "@/components/JpLessonHalfHourTimeGridPicker";
import {
  formatNextClassHalfHourLabel,
  JP_LESSON_CLASS_DURATION_MINUTES,
  listNextClassHalfHourTimes,
  nextClassAtFromDatetimeLocalValue,
} from "@/lib/jp-lesson-shared";
import { formatTeacherDisplayLabel } from "@/lib/jp-lesson-teacher-rate";
import type { JpLessonClassScheduleInput, JpLessonTeacher } from "@/lib/types";

type Props = {
  open: boolean;
  lessonCount: number;
  teachers: JpLessonTeacher[];
  saving?: boolean;
  onClose: () => void;
  onSave: (
    schedules: JpLessonClassScheduleInput[],
    teacherIds: number[],
    teacherOther: string | null
  ) => void;
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

function emptyRow(): ScheduleRow {
  return { key: createRowKey(), date: "", time: "", duration: "" };
}

export function JpLessonBatchScheduleTeacherModal({
  open,
  lessonCount,
  teachers,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<ScheduleRow[]>([emptyRow()]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const timeOptions = useMemo(
    () =>
      HALF_HOUR_OPTIONS.map((value) => ({
        value,
        label: formatNextClassHalfHourLabel(value),
      })),
    []
  );

  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [teachers]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setRows([emptyRow()]);
    setSelectedIds([]);
  }, [open]);

  const updateRow = (key: string, patch: Partial<Omit<ScheduleRow, "key">>) => {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (key: string) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.length ? next : [emptyRow()];
    });
  };

  const toggleTeacher = (teacherId: number) => {
    setSelectedIds((prev) =>
      prev.includes(teacherId)
        ? prev.filter((id) => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const handleSave = () => {
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
    onSave(schedules, selectedIds, null);
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="jp-batch-overlay" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="jp-batch-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-batch-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-batch-head">
          <div>
            <h2 id="jp-batch-title">批量设置上课时间和老师</h2>
            <p className="jp-batch-sub">已选择 {lessonCount} 条未上课教案</p>
          </div>
          <button type="button" className="jp-batch-close" disabled={saving} onClick={onClose}>
            ×
          </button>
        </div>

        <fieldset className="jp-batch-fieldset" disabled={saving}>
          <legend>上课老师（可多选）</legend>
          <div className="jp-batch-teachers">
            {sortedTeachers.map((teacher) => (
              <label key={teacher.id} className="jp-batch-teacher-item">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(teacher.id)}
                  onChange={() => toggleTeacher(teacher.id)}
                />
                <span>
                  {formatTeacherDisplayLabel(
                    teacher.name,
                    teacher.hourly_rate,
                    teacher.lesson_minutes
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="jp-batch-fieldset" disabled={saving}>
          <legend>上课时间（北京时间）</legend>
          <div className="jp-batch-rows">
            {rows.map((row, index) => (
              <div key={row.key} className="jp-batch-row">
                <div className="jp-batch-row-head">
                  <span>预约 {index + 1}</span>
                  {rows.length > 1 ? (
                    <button type="button" onClick={() => removeRow(row.key)}>
                      删除
                    </button>
                  ) : null}
                </div>
                <div className="jp-batch-fields">
                  <input
                    type="date"
                    className="jp-batch-input"
                    value={row.date}
                    onChange={(e) => updateRow(row.key, { date: e.target.value })}
                  />
                  <JpLessonHalfHourTimeGridPicker
                    value={row.time}
                    options={timeOptions}
                    disabled={saving}
                    onChange={(time) => updateRow(row.key, { time })}
                  />
                  <select
                    className="jp-batch-input"
                    value={row.duration}
                    onChange={(e) => updateRow(row.key, { duration: e.target.value })}
                  >
                    <option value="">请选择时长</option>
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="jp-batch-add" onClick={addRow} disabled={saving}>
            + 添加预约
          </button>
        </fieldset>

        <div className="jp-batch-actions">
          <button type="button" className="jp-lesson-action-btn" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn jp-lesson-action-btn--primary"
            onClick={handleSave}
            disabled={saving || lessonCount <= 0}
          >
            {saving ? "保存中…" : "批量保存"}
          </button>
        </div>
      </div>
      <style jsx>{`
        .jp-batch-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgba(0,0,0,.55); }
        .jp-batch-modal { width: min(760px,100%); max-height: 94vh; overflow: auto; padding: 1rem 1.1rem; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
        .jp-batch-head { display: flex; justify-content: space-between; gap: .75rem; margin-bottom: .75rem; }
        .jp-batch-head h2 { margin: 0; font-size: 1.05rem; }
        .jp-batch-sub { margin: .3rem 0 0; color: var(--muted); font-size: .8125rem; }
        .jp-batch-close { width: 2rem; height: 2rem; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--muted); }
        .jp-batch-fieldset { border: none; margin: 0 0 .75rem; padding: 0; }
        .jp-batch-fieldset legend { font-size: .8125rem; color: var(--muted); margin-bottom: .45rem; }
        .jp-batch-teachers { display: grid; gap: .35rem; max-height: 10rem; overflow: auto; padding: .55rem; border: 1px solid var(--border); border-radius: 8px; }
        .jp-batch-teacher-item { display: flex; gap: .5rem; font-size: .875rem; }
        .jp-batch-rows { display: grid; gap: .6rem; }
        .jp-batch-row { border: 1px solid var(--border); border-radius: 8px; padding: .55rem; }
        .jp-batch-row-head { display: flex; justify-content: space-between; margin-bottom: .4rem; font-size: .8125rem; color: var(--muted); }
        .jp-batch-row-head button { border: none; background: transparent; color: var(--muted); cursor: pointer; }
        .jp-batch-fields { display: grid; gap: .5rem; }
        .jp-batch-input { width: 100%; box-sizing: border-box; padding: .5rem .6rem; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); color: inherit; }
        .jp-batch-add { margin-top: .55rem; width: 100%; padding: .5rem; border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border)); border-radius: 8px; background: color-mix(in srgb, var(--accent) 6%, var(--panel)); color: var(--accent); }
        .jp-batch-actions { display: flex; justify-content: flex-end; gap: .5rem; }
      `}</style>
    </div>,
    document.body
  );
}

