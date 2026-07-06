"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { JpLessonHalfHourTimeGridPicker } from "@/components/JpLessonHalfHourTimeGridPicker";
import type { JpLessonManualSchedule, JpLessonManualScheduleDraft } from "@/lib/jp-lesson-manual-schedule";
import {
  formatNextClassHalfHourLabel,
  JP_LESSON_CLASS_DURATION_MINUTES,
  listNextClassHalfHourTimes,
  nextClassAtFromDatetimeLocalValue,
  nextClassAtToDatetimeLocalValue,
  splitNextClassAtLocalValue,
} from "@/lib/jp-lesson-shared";

type Props = {
  open: boolean;
  initialDate?: string;
  editing?: JpLessonManualSchedule | null;
  onClose: () => void;
  onSave: (draft: JpLessonManualScheduleDraft) => void;
};

const HALF_HOUR_OPTIONS = listNextClassHalfHourTimes();
const DURATION_OPTIONS = JP_LESSON_CLASS_DURATION_MINUTES.map((minutes) => ({
  value: String(minutes),
  label: minutes === 60 ? "1小时" : `${minutes}分钟`,
}));

function draftFromSchedule(
  schedule: JpLessonManualSchedule | null | undefined,
  initialDate: string
): {
  title: string;
  date: string;
  time: string;
  duration: string;
  teacher: string;
  note: string;
} {
  if (!schedule) {
    return {
      title: "",
      date: initialDate,
      time: "",
      duration: "",
      teacher: "",
      note: "",
    };
  }

  const local = nextClassAtToDatetimeLocalValue(schedule.class_at);
  const parts = local ? splitNextClassAtLocalValue(local) : null;
  return {
    title: schedule.title,
    date: parts?.date ?? initialDate,
    time: parts?.time ?? "",
    duration: schedule.duration_minutes != null ? String(schedule.duration_minutes) : "",
    teacher: schedule.teacher,
    note: schedule.note,
  };
}

export function JpLessonManualScheduleModal({
  open,
  initialDate = "",
  editing = null,
  onClose,
  onSave,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [teacher, setTeacher] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const timeOptions = useMemo(
    () =>
      HALF_HOUR_OPTIONS.map((value) => ({
        value,
        label: formatNextClassHalfHourLabel(value),
      })),
    []
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const next = draftFromSchedule(editing, initialDate);
    setTitle(next.title);
    setDate(next.date);
    setTime(next.time);
    setDuration(next.duration);
    setTeacher(next.teacher);
    setNote(next.note);
    setError("");
  }, [open, editing, initialDate]);

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("请填写日程标题");
      return;
    }
    if (!date.trim() || !time.trim()) {
      setError("请选择日期和时间");
      return;
    }

    const classAt = nextClassAtFromDatetimeLocalValue(`${date}T${time}`);
    if (!classAt) {
      setError("日期或时间无效");
      return;
    }

    onSave({
      title: trimmedTitle,
      class_at: classAt,
      duration_minutes: duration ? Number(duration) : null,
      teacher: teacher.trim(),
      note: note.trim(),
    });
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="jp-lesson-next-class-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="jp-lesson-next-class-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-lesson-manual-schedule-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-lesson-next-class-header">
          <div>
            <h2 id="jp-lesson-manual-schedule-modal-title">
              {editing ? "编辑手动日程" : "手动添加日程"}
            </h2>
            <p className="jp-lesson-next-class-modal-lesson">
              仅保存在本页，不会同步到日语新课列表
            </p>
          </div>
          <button
            type="button"
            className="jp-lesson-next-class-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <fieldset className="jp-lesson-next-class-fieldset">
          <legend>日程信息（北京时间，整点 / 半点）</legend>
          <div className="jp-lesson-next-class-rows">
            <div className="jp-lesson-next-class-row">
              <div className="jp-lesson-next-class-fields">
                <label className="jp-lesson-next-class-field">
                  <span>标题</span>
                  <input
                    type="text"
                    className="jp-lesson-next-class-input"
                    value={title}
                    placeholder="例如：复习 N3 语法"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="jp-lesson-next-class-field">
                  <span>日期</span>
                  <input
                    type="date"
                    className="jp-lesson-next-class-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <div className="jp-lesson-next-class-field">
                  <span>时间</span>
                  <JpLessonHalfHourTimeGridPicker
                    value={time}
                    options={timeOptions}
                    onChange={setTime}
                  />
                </div>
                <label className="jp-lesson-next-class-field">
                  <span>时长</span>
                  <select
                    className="jp-lesson-next-class-input jp-lesson-next-class-time-select"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  >
                    <option value="">默认 55 分钟</option>
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="jp-lesson-next-class-field">
                  <span>老师（可选）</span>
                  <input
                    type="text"
                    className="jp-lesson-next-class-input"
                    value={teacher}
                    placeholder="例如：张老师"
                    onChange={(e) => setTeacher(e.target.value)}
                  />
                </label>
                <label className="jp-lesson-next-class-field jp-lesson-next-class-field--full">
                  <span>备注（可选）</span>
                  <textarea
                    className="jp-lesson-next-class-input jp-lesson-manual-note"
                    value={note}
                    rows={3}
                    placeholder="补充说明、链接等"
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>
          {error ? (
            <p className="jp-lesson-next-class-hint" role="alert">
              {error}
            </p>
          ) : (
            <p className="jp-lesson-next-class-hint">
              手动日程只用于日程管理视图，方便你记录额外安排。
            </p>
          )}
        </fieldset>

        <div className="jp-lesson-next-class-actions">
          <button type="button" className="jp-lesson-action-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn jp-lesson-action-btn--primary"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>

      <style jsx>{`
        .jp-lesson-next-class-field--full {
          grid-column: 1 / -1;
        }
        .jp-lesson-manual-note {
          resize: vertical;
          min-height: 4.5rem;
          line-height: 1.45;
        }
      `}</style>
    </div>,
    document.body
  );
}
