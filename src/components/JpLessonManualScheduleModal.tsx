"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { JpLessonHalfHourTimeGridPicker } from "@/components/JpLessonHalfHourTimeGridPicker";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import {
  JpLessonTeacherSinglePicker,
} from "@/components/JpLessonTeacherSinglePicker";
import type { JpLessonTeacherAddInput } from "@/components/JpLessonTeacherEditModal";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import type { JpLessonManualSchedule, JpLessonManualScheduleDraft } from "@/lib/jp-lesson-manual-schedule";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import {
  detectScheduleTeacherSubjectFromTitle,
  scheduleTeacherPickerListForSubject,
} from "@/lib/jp-lesson-teacher-rate";
import { findLessonTeacherByPickerName, lessonTeacherPickerName } from "@/lib/lesson-teacher-search";
import type { JpLessonTeacher } from "@/lib/types";
import {
  beijingTodayDateString,
  formatNextClassHalfHourLabel,
  JP_LESSON_CLASS_DURATION_MINUTES,
  listNextClassHalfHourTimes,
  nextClassAtFromDatetimeLocalValue,
  nextClassAtToDatetimeLocalValue,
  splitNextClassAtLocalValue,
} from "@/lib/jp-lesson-shared";

type ManualScheduleModalMode = "full" | "time";

type Props = {
  open: boolean;
  initialDate?: string;
  editing?: JpLessonManualSchedule | null;
  mode?: ManualScheduleModalMode;
  jpTeachers?: JpLessonTeacher[];
  enTeachers?: JpLessonTeacher[];
  onAddJpTeacher?: (input: JpLessonTeacherAddInput) => Promise<JpLessonTeacher | null>;
  onAddEnTeacher?: (input: JpLessonTeacherAddInput) => Promise<JpLessonTeacher | null>;
  saving?: boolean;
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
      date: initialDate || beijingTodayDateString(),
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
    date: parts?.date ?? (initialDate || beijingTodayDateString()),
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
  mode = "full",
  jpTeachers = [],
  enTeachers = [],
  onAddJpTeacher,
  onAddEnTeacher,
  saving = false,
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
  const [addingTeacher, setAddingTeacher] = useState(false);
  const saveInitiatedRef = useRef(false);
  const saveProgress = useSaveProgressBar(saving);

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
    if (!open) {
      saveInitiatedRef.current = false;
      return;
    }
    const next = draftFromSchedule(editing, initialDate);
    setTitle(next.title);
    setDate(next.date);
    setTime(next.time);
    setDuration(next.duration);
    setTeacher(next.teacher);
    setNote(next.note);
    setError("");
    setAddingTeacher(false);
    saveInitiatedRef.current = false;
  }, [open, editing, initialDate]);

  useEffect(() => {
    if (!saving) {
      saveInitiatedRef.current = false;
    }
  }, [saving]);

  const teacherSubject = useMemo(
    () => detectScheduleTeacherSubjectFromTitle(title),
    [title]
  );

  const pickerTeachers = useMemo(
    () => scheduleTeacherPickerListForSubject(teacherSubject, jpTeachers, enTeachers),
    [teacherSubject, jpTeachers, enTeachers]
  );

  const onAddTeacher =
    teacherSubject === "en"
      ? onAddEnTeacher
      : teacherSubject === "jp"
        ? onAddJpTeacher
        : onAddJpTeacher ?? onAddEnTeacher;

  const teacherFieldLabel =
    teacherSubject === "en"
      ? "老师（可选 · 英语）"
      : teacherSubject === "jp"
        ? "老师（可选 · 日语）"
        : "老师（可选）";

  const teacherPlaceholder =
    teacherSubject === "en"
      ? "选择英语老师，或输入后添加"
      : teacherSubject === "jp"
        ? "选择日语老师，或输入后添加"
        : "选择系统老师，或输入后添加";

  const resolveTeacherForSave = async (): Promise<string | null> => {
    const trimmedTeacher = teacher.trim();
    if (!trimmedTeacher) return "";
    if (!onAddTeacher) return trimmedTeacher;

    const existing = findLessonTeacherByPickerName(pickerTeachers, trimmedTeacher);
    if (existing) return lessonTeacherPickerName(existing);

    setAddingTeacher(true);
    try {
      const created = await onAddTeacher({ name: trimmedTeacher });
      if (!created) {
        setError("添加老师失败，请重试或从列表选择已有老师");
        return null;
      }
      const name = lessonTeacherPickerName(created);
      setTeacher(name);
      return name;
    } finally {
      setAddingTeacher(false);
    }
  };

  const handleSave = async () => {
    if (saving || addingTeacher || saveInitiatedRef.current) {
      setError("正在提交，请勿重复提交");
      return;
    }

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

    const teacherName = await resolveTeacherForSave();
    if (teacherName === null) return;

    saveInitiatedRef.current = true;
    setError("");
    onSave({
      title: trimmedTitle,
      class_at: classAt,
      duration_minutes: duration ? Number(duration) : null,
      teacher: teacherName,
      note: note.trim(),
    });
  };

  const modalTitle = editing
    ? mode === "time"
      ? "改时"
      : "编辑手动日程"
    : "手动添加日程";
  const showFullFields = mode === "full";

  if (!open || !mounted) return null;

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
        aria-labelledby="jp-lesson-manual-schedule-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-lesson-next-class-header">
          <div>
            <h2 id="jp-lesson-manual-schedule-modal-title">{modalTitle}</h2>
            <p className="jp-lesson-next-class-modal-lesson">
              仅保存在本页，不会同步到日语新课列表
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

        <fieldset className="jp-lesson-next-class-fieldset" disabled={saving || addingTeacher}>
          <legend>
            {showFullFields ? "日程信息（北京时间，整点 / 半点）" : "上课时间（北京时间，整点 / 半点）"}
          </legend>
          <div className="jp-lesson-next-class-rows">
            <div className="jp-lesson-next-class-row">
              <div className="jp-lesson-next-class-fields">
                {showFullFields ? (
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
                ) : null}
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
                {showFullFields ? (
                  <>
                    <label className="jp-lesson-next-class-field">
                      <span>{teacherFieldLabel}</span>
                      {onAddTeacher ? (
                        <JpLessonTeacherSinglePicker
                          value={teacher}
                          teachers={pickerTeachers}
                          placeholder={teacherPlaceholder}
                          onChange={setTeacher}
                          onAddTeacher={onAddTeacher}
                        />
                      ) : (
                        <input
                          type="text"
                          className="jp-lesson-next-class-input"
                          value={teacher}
                          placeholder="例如：张老师"
                          onChange={(e) => setTeacher(e.target.value)}
                        />
                      )}
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
                  </>
                ) : null}
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

        {saveProgress.visible || addingTeacher ? (
          <JpVocabSaveProgressBar
            label={
              addingTeacher
                ? "正在添加老师…"
                : jpVocabSaveProgressLabel("save")
            }
            percent={saveProgress.percent}
            fullWidth
          />
        ) : null}

        <div className="jp-lesson-next-class-actions">
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={saving || addingTeacher}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn jp-lesson-action-btn--primary"
            disabled={saving || addingTeacher}
            onClick={() => void handleSave()}
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
          width: min(720px, 100%);
          max-height: min(94vh, 900px);
          overflow: auto;
          padding: 1.15rem 1.25rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
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

        .jp-lesson-next-class-hint {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .jp-lesson-next-class-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        .jp-lesson-next-class-field--full {
          grid-column: 1 / -1;
        }

        .jp-lesson-manual-note {
          resize: vertical;
          min-height: 4.5rem;
          line-height: 1.45;
        }

        :global(.jp-lesson-action-btn) {
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          border-radius: 8px;
          padding: 0.45rem 0.85rem;
          font-size: 0.8125rem;
          cursor: pointer;
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
