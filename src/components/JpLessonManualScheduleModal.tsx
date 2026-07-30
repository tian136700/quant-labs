"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { JpLessonHalfHourTimeGridPicker } from "@/components/JpLessonHalfHourTimeGridPicker";
import { JpLessonManualScheduleLessonPicker } from "@/components/JpLessonManualScheduleLessonPicker";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import {
  JpLessonTeacherSinglePicker,
  type JpLessonTeacherSinglePickerHandle,
} from "@/components/JpLessonTeacherSinglePicker";
import type { JpLessonTeacherAddInput } from "@/components/JpLessonTeacherEditModal";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import type { JpLessonManualSchedule, JpLessonManualScheduleDraft } from "@/lib/jp-lesson-manual-schedule";
import {
  normalizeManualScheduleLinkedLessons,
  type ManualScheduleLinkedLesson,
} from "@/lib/jp-lesson-manual-schedule-linked";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import {
  detectScheduleTeacherSubjectFromTitle,
  scheduleTeacherPickerListForSubject,
} from "@/lib/jp-lesson-teacher-rate";
import {
  formatJpLessonDefaultDurationFormValue,
  resolveJpLessonTeacherLessonMinutes,
} from "@/lib/jp-lesson-teacher-default-duration";
import { findLessonTeacherByPickerName } from "@/lib/lesson-teacher-search";
import type { EnLessonRecord, JpLessonRecord, JpLessonTeacher } from "@/lib/types";
import { DEFAULT_EN_LESSON_CLASS_DURATION_MINUTES } from "@/lib/en-lesson-shared";
import {
  beijingTodayDateString,
  DEFAULT_JP_LESSON_CLASS_DURATION_MINUTES,
  formatNextClassHalfHourLabel,
  JP_LESSON_CLASS_DURATION_MINUTES,
  listNextClassHalfHourTimes,
  nextClassAtFromDatetimeLocalValue,
  nextClassAtToDatetimeLocalValue,
  splitNextClassAtLocalValue,
} from "@/lib/jp-lesson-shared";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";

type ManualScheduleModalMode = "full" | "time";

type Props = {
  open: boolean;
  initialDate?: string;
  editing?: JpLessonManualSchedule | null;
  mode?: ManualScheduleModalMode;
  jpTeachers?: JpLessonTeacher[];
  enTeachers?: JpLessonTeacher[];
  koTeachers?: JpLessonTeacher[];
  jpLessons?: JpLessonRecord[];
  enLessons?: EnLessonRecord[];
  onAddJpTeacher?: (input: JpLessonTeacherAddInput) => Promise<JpLessonTeacher | null>;
  onAddEnTeacher?: (input: JpLessonTeacherAddInput) => Promise<JpLessonTeacher | null>;
  onAddKoTeacher?: (input: JpLessonTeacherAddInput) => Promise<JpLessonTeacher | null>;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: JpLessonManualScheduleDraft) => void;
};

const HALF_HOUR_OPTIONS = listNextClassHalfHourTimes();
const DURATION_OPTIONS = JP_LESSON_CLASS_DURATION_MINUTES.map((minutes) => ({
  value: String(minutes),
  label: minutes === 60 ? "1小时" : `${minutes}分钟`,
}));

/** 手动日程标题：下拉预设（含闲鱼英语抽查）或自定义输入 */
const MANUAL_SCHEDULE_TITLE_PRESETS = [
  "韩语",
  "日语",
  "英语",
  "闲鱼英语抽查",
] as const;
type ManualScheduleTitlePreset = (typeof MANUAL_SCHEDULE_TITLE_PRESETS)[number];
type ManualScheduleTitleChoice = ManualScheduleTitlePreset | "custom";

function isManualScheduleTitlePreset(value: string): value is ManualScheduleTitlePreset {
  return (MANUAL_SCHEDULE_TITLE_PRESETS as readonly string[]).includes(value);
}

function titleChoiceFromStoredTitle(stored: string): {
  choice: ManualScheduleTitleChoice | "";
  custom: string;
} {
  const trimmed = stored.trim();
  if (!trimmed) return { choice: "", custom: "" };
  if (isManualScheduleTitlePreset(trimmed)) {
    return { choice: trimmed, custom: "" };
  }
  return { choice: "custom", custom: stored };
}

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
  linked_lessons: ManualScheduleLinkedLesson[];
} {
  if (!schedule) {
    return {
      title: "",
      date: initialDate || beijingTodayDateString(),
      time: "",
      duration: "",
      teacher: "",
      note: "",
      linked_lessons: [],
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
    linked_lessons: normalizeManualScheduleLinkedLessons(schedule.linked_lessons),
  };
}

export function JpLessonManualScheduleModal({
  open,
  initialDate = "",
  editing = null,
  mode = "full",
  jpTeachers = [],
  enTeachers = [],
  koTeachers = [],
  jpLessons = [],
  enLessons = [],
  onAddJpTeacher,
  onAddEnTeacher,
  onAddKoTeacher,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [titleChoice, setTitleChoice] = useState<ManualScheduleTitleChoice | "">("");
  const [customTitle, setCustomTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [teacher, setTeacher] = useState("");
  const [note, setNote] = useState("");
  const [linkedLessons, setLinkedLessons] = useState<ManualScheduleLinkedLesson[]>([]);
  const [error, setError] = useState("");
  const [addingTeacher, setAddingTeacher] = useState(false);
  const saveInitiatedRef = useRef(false);
  const formInitKeyRef = useRef<string | null>(null);
  const teacherPickerRef = useRef<JpLessonTeacherSinglePickerHandle>(null);
  const saveProgress = useSaveProgressBar(saving);

  const title = useMemo(() => {
    if (titleChoice === "custom") return customTitle;
    if (isManualScheduleTitlePreset(titleChoice)) {
      return titleChoice;
    }
    return "";
  }, [titleChoice, customTitle]);

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
      formInitKeyRef.current = null;
      saveInitiatedRef.current = false;
      return;
    }
    const initKey = editing?.id != null ? `edit:${editing.id}` : "new";
    if (formInitKeyRef.current === initKey) return;
    formInitKeyRef.current = initKey;
    const next = draftFromSchedule(editing, initialDate);
    const fromTitle = titleChoiceFromStoredTitle(next.title);
    setTitleChoice(fromTitle.choice);
    setCustomTitle(fromTitle.custom);
    setDate(next.date);
    setTime(next.time);
    setDuration(next.duration);
    setTeacher(next.teacher);
    setNote(next.note);
    setLinkedLessons(next.linked_lessons);
    setError("");
    setAddingTeacher(false);
    saveInitiatedRef.current = false;
  }, [open, editing, initialDate]);

  useEffect(() => {
    if (!saving) {
      saveInitiatedRef.current = false;
    }
  }, [saving]);

  const selectTitlePreset = (preset: ManualScheduleTitlePreset) => {
    setTitleChoice(preset);
    setCustomTitle("");
    setError("");
    // 闲鱼英语抽查：自动填上课老师 + 30 分钟（须与人员管理英语老师同名）
    if (preset === "闲鱼英语抽查") {
      applyTeacherName("闲鱼英语抽查");
      setDuration("30");
      return;
    }
    // 英语课默认 25 分钟（与英语新课一致；勿留空落到日语默认 55）
    if (preset === "英语") {
      setDuration(String(DEFAULT_EN_LESSON_CLASS_DURATION_MINUTES));
    }
  };

  const applyTeacherName = (name: string) => {
    setTeacher(name);
    const trimmed = name.trim();
    if (!trimmed) return;
    // 时长已手选则不覆盖；空着时按老师默认时长带出
    setDuration((prev) => {
      if (prev.trim()) return prev;
      const matched =
        findLessonTeacherByPickerName(jpTeachers, trimmed) ??
        findLessonTeacherByPickerName(enTeachers, trimmed) ??
        findLessonTeacherByPickerName(koTeachers, trimmed);
      if (!matched) {
        return formatJpLessonDefaultDurationFormValue(
          resolveJpLessonTeacherLessonMinutes({ name: trimmed, lesson_minutes: null })
        ) || prev;
      }
      return (
        formatJpLessonDefaultDurationFormValue(
          resolveJpLessonTeacherLessonMinutes(matched)
        ) || prev
      );
    });
  };

  const activateCustomTitle = () => {
    setTitleChoice("custom");
    setError("");
  };

  const teacherSubject = useMemo(
    () => detectScheduleTeacherSubjectFromTitle(title),
    [title]
  );

  const pickerTeachers = useMemo(
    () =>
      scheduleTeacherPickerListForSubject(
        teacherSubject,
        jpTeachers,
        enTeachers,
        koTeachers
      ),
    [teacherSubject, jpTeachers, enTeachers, koTeachers]
  );

  const onAddTeacher =
    teacherSubject === "en"
      ? onAddEnTeacher
      : teacherSubject === "ko"
        ? onAddKoTeacher
        : teacherSubject === "jp"
          ? onAddJpTeacher
          : onAddJpTeacher ?? onAddEnTeacher ?? onAddKoTeacher;

  const teacherFieldLabel =
    teacherSubject === "en"
      ? "老师（可选 · 英语）"
      : teacherSubject === "ko"
        ? "老师（可选 · 韩语）"
        : teacherSubject === "jp"
          ? "老师（可选 · 日语）"
          : "老师（可选）";

  const teacherPlaceholder =
    teacherSubject === "en"
      ? "选择英语老师"
      : teacherSubject === "ko"
        ? "选择韩语老师"
        : teacherSubject === "jp"
          ? "选择日语老师"
          : "选择老师";

  const resolveTeacherForSave = async (): Promise<string | null> => {
    if (!onAddTeacher) return teacher.trim();

    setAddingTeacher(true);
    try {
      const result = await teacherPickerRef.current?.resolveValueForSave();
      if (!result) return teacher.trim();
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      applyTeacherName(result.name);
      return result.name;
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
      setError(
        titleChoice === "custom" || !titleChoice
          ? "请选择或填写日程标题"
          : "请填写日程标题"
      );
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
      linked_lessons: normalizeManualScheduleLinkedLessons(linkedLessons),
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
      onMouseDown={(event) => {
        if (!saving && !addingTeacher) {
          closeModalOnBackdropMouseDown(event, onClose);
        }
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
                  <div className="jp-lesson-next-class-field">
                    <span>标题</span>
                    <select
                      className="jp-lesson-next-class-input"
                      aria-label="日程标题"
                      value={
                        titleChoice === "custom"
                          ? "custom"
                          : titleChoice || ""
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "custom") {
                          activateCustomTitle();
                          return;
                        }
                        if (isManualScheduleTitlePreset(v)) {
                          selectTitlePreset(v);
                        }
                      }}
                    >
                      <option value="" disabled>
                        请选择标题…
                      </option>
                      {MANUAL_SCHEDULE_TITLE_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                      <option value="custom">自己输入…</option>
                    </select>
                    {titleChoice === "custom" ? (
                      <input
                        type="text"
                        className="jp-lesson-next-class-input"
                        style={{ marginTop: "0.35rem" }}
                        value={customTitle}
                        placeholder="自定义标题"
                        onChange={(e) => {
                          activateCustomTitle();
                          setCustomTitle(e.target.value);
                        }}
                      />
                    ) : null}
                  </div>
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
                    <option value="">
                      {teacherSubject === "en"
                        ? `默认 ${DEFAULT_EN_LESSON_CLASS_DURATION_MINUTES} 分钟`
                        : `默认 ${DEFAULT_JP_LESSON_CLASS_DURATION_MINUTES} 分钟`}
                    </option>
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
                          ref={teacherPickerRef}
                          value={teacher}
                          teachers={pickerTeachers}
                          placeholder={teacherPlaceholder}
                          onChange={applyTeacherName}
                          onAddTeacher={onAddTeacher}
                          disabled={saving || addingTeacher}
                        />
                      ) : (
                        <input
                          type="text"
                          className="jp-lesson-next-class-input"
                          value={teacher}
                          placeholder="例如：张老师"
                          onChange={(e) => applyTeacherName(e.target.value)}
                        />
                      )}
                    </label>
                    <div className="jp-lesson-next-class-field jp-lesson-next-class-field--full">
                      <JpLessonManualScheduleLessonPicker
                        value={linkedLessons}
                        onChange={setLinkedLessons}
                        titleSubject={teacherSubject}
                        jpLessons={jpLessons}
                        enLessons={enLessons}
                        disabled={saving || addingTeacher}
                      />
                    </div>
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

        .jp-lesson-manual-title-choices {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, auto)) minmax(0, 1fr);
          gap: 0.35rem;
          align-items: stretch;
        }

        .jp-lesson-manual-title-preset {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: var(--muted);
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          line-height: 1.3;
          cursor: pointer;
          transition:
            color 0.15s ease,
            background 0.15s ease,
            border-color 0.15s ease;
        }

        .jp-lesson-manual-title-preset:hover:not(:disabled):not(.is-active) {
          color: var(--text);
          background: color-mix(in srgb, var(--panel) 70%, var(--bg));
        }

        .jp-lesson-manual-title-preset.is-active {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
        }

        .jp-lesson-manual-title-custom {
          min-width: 0;
        }

        .jp-lesson-manual-title-custom.is-active {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }

        @media (max-width: 520px) {
          .jp-lesson-manual-title-choices {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .jp-lesson-manual-title-custom {
            grid-column: 1 / -1;
          }
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
