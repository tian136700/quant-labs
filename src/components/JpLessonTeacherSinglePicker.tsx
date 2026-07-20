"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { JpLessonTeacherAddInput } from "@/components/JpLessonTeacherEditModal";
import { JP_LESSON_CLASS_DURATION_MINUTES } from "@/lib/jp-lesson-shared";
import {
  buildLessonTeacherAddInput,
  calcHourlyRate,
  formatHourlyRate,
  formatTeacherDisplayLabel,
  sortJpLessonTeachersByLessonCount,
  validateLessonTeacherAddRateFields,
} from "@/lib/jp-lesson-teacher-rate";
import {
  filterLessonTeachersBySearch,
  findLessonTeacherByPickerName,
  lessonTeacherPickerName,
} from "@/lib/lesson-teacher-search";
import type { JpLessonTeacher } from "@/lib/types";

const TEACHER_LESSON_MINUTE_OPTIONS = JP_LESSON_CLASS_DURATION_MINUTES.map((minutes) => ({
  value: String(minutes),
  label: minutes === 60 ? "60 分钟（1 小时）" : `${minutes} 分钟`,
}));

export type JpLessonTeacherSinglePickerHandle = {
  resolveValueForSave: () => Promise<
    | { ok: true; name: string }
    | { ok: false; error: string }
  >;
};

type Props = {
  value: string;
  teachers: JpLessonTeacher[];
  onChange: (name: string) => void;
  onAddTeacher: (input: JpLessonTeacherAddInput) => Promise<JpLessonTeacher | null>;
  disabled?: boolean;
  placeholder?: string;
};

export const JpLessonTeacherSinglePicker = forwardRef<
  JpLessonTeacherSinglePickerHandle,
  Props
>(function JpLessonTeacherSinglePicker(
  {
    value,
    teachers,
    onChange,
    onAddTeacher,
    disabled = false,
    placeholder = "选择或输入老师姓名",
  },
  ref
) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [addPrice, setAddPrice] = useState("");
  const [addMinutes, setAddMinutes] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const sortedTeachers = useMemo(
    () => sortJpLessonTeachersByLessonCount(teachers),
    [teachers]
  );

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const trimmedQuery = query.trim();

  const filteredTeachers = useMemo(
    () => filterLessonTeachersBySearch(sortedTeachers, trimmedQuery),
    [sortedTeachers, trimmedQuery]
  );

  const exactMatch = useMemo(
    () => findLessonTeacherByPickerName(sortedTeachers, trimmedQuery),
    [sortedTeachers, trimmedQuery]
  );

  const showAddOption = Boolean(trimmedQuery) && !exactMatch;

  useEffect(() => {
    if (!showAddOption) {
      setAddPrice("");
      setAddMinutes("");
      setAddError("");
    }
  }, [showAddOption]);

  const addHourlyPreview = useMemo(() => {
    const price = Number(addPrice);
    const minutes = Number(addMinutes);
    if (!addPrice.trim() || !addMinutes.trim()) return null;
    return calcHourlyRate(price, minutes);
  }, [addPrice, addMinutes]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const clearAddDraft = () => {
    setAddPrice("");
    setAddMinutes("");
    setAddError("");
  };

  const selectTeacher = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
    clearAddDraft();
  };

  const addingRef = useRef(false);

  const runAddTeacher = useCallback(
    async (input: JpLessonTeacherAddInput): Promise<JpLessonTeacher | null> => {
      if (addingRef.current) return null;
      addingRef.current = true;
      setAdding(true);
      setAddError("");
      try {
        const teacher = await onAddTeacher(input);
        if (!teacher) {
          setAddError("添加失败，请重试");
          return null;
        }
        const name = lessonTeacherPickerName(teacher);
        onChange(name);
        setQuery(name);
        setOpen(false);
        clearAddDraft();
        return teacher;
      } finally {
        addingRef.current = false;
        setAdding(false);
      }
    },
    [onAddTeacher, onChange]
  );

  const handleAddTeacher = async () => {
    if (!trimmedQuery || adding || disabled) return;
    if (exactMatch) {
      selectTeacher(lessonTeacherPickerName(exactMatch));
      return;
    }

    const rateError = validateLessonTeacherAddRateFields(addPrice, addMinutes);
    if (rateError) {
      setAddError(rateError);
      return;
    }

    const input = buildLessonTeacherAddInput(trimmedQuery, addPrice, addMinutes);
    if (!input) return;
    await runAddTeacher(input);
  };

  useImperativeHandle(
    ref,
    () => ({
      resolveValueForSave: async () => {
        if (!trimmedQuery) return { ok: true, name: "" };
        if (exactMatch) {
          return { ok: true, name: lessonTeacherPickerName(exactMatch) };
        }

        const rateError = validateLessonTeacherAddRateFields(addPrice, addMinutes);
        if (rateError) return { ok: false, error: rateError };

        const input = buildLessonTeacherAddInput(trimmedQuery, addPrice, addMinutes);
        if (!input) return { ok: true, name: "" };

        const teacher = await runAddTeacher(input);
        if (!teacher) {
          return {
            ok: false,
            error: "添加老师失败，请重试或从列表选择已有老师",
          };
        }
        return { ok: true, name: lessonTeacherPickerName(teacher) };
      },
    }),
    [addMinutes, addPrice, exactMatch, runAddTeacher, trimmedQuery]
  );

  const handleBlur = () => {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        if (exactMatch) {
          const name = lessonTeacherPickerName(exactMatch);
          onChange(name);
          setQuery(name);
        } else {
          onChange(trimmedQuery);
        }
      }
    }, 0);
  };

  return (
    <div className="jp-lesson-teacher-single-picker" ref={containerRef}>
      <input
        type="text"
        className="jp-lesson-teacher-single-picker-input"
        value={query}
        placeholder={placeholder}
        disabled={disabled || adding}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onChange={(event) => {
          setQuery(event.target.value);
          setAddError("");
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key === "Enter" && showAddOption) {
            event.preventDefault();
            void handleAddTeacher();
          }
        }}
      />

      {showAddOption ? (
        <div className="jp-lesson-teacher-single-picker-add">
          <div className="jp-lesson-teacher-single-picker-add-row">
            <input
              type="number"
              min="0"
              step="0.01"
              className="jp-lesson-teacher-single-picker-add-input"
              value={addPrice}
              placeholder="金额（可选）"
              disabled={disabled || adding}
              onChange={(event) => {
                setAddPrice(event.target.value);
                setAddError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAddTeacher();
                }
              }}
            />
            <select
              className="jp-lesson-teacher-single-picker-add-input jp-lesson-teacher-single-picker-add-select"
              value={addMinutes}
              disabled={disabled || adding}
              onChange={(event) => {
                setAddMinutes(event.target.value);
                setAddError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAddTeacher();
                }
              }}
            >
              <option value="">时长（可选）</option>
              {TEACHER_LESSON_MINUTE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {addHourlyPreview != null ? (
            <p className="jp-lesson-teacher-single-picker-add-preview">
              折合时薪 ≈ {formatHourlyRate(addHourlyPreview)}
            </p>
          ) : null}
          <p className="jp-lesson-teacher-single-picker-hint">
            金额与时长需同时填写，或都留空；也可保存日程时自动添加。
          </p>
        </div>
      ) : null}

      {open && (filteredTeachers.length || showAddOption) ? (
        <ul
          id={listId}
          className={`jp-lesson-teacher-single-picker-list${
            showAddOption ? " jp-lesson-teacher-single-picker-list--with-add" : ""
          }`}
          role="listbox"
        >
          {showAddOption ? (
            <li role="option">
              <button
                type="button"
                className="jp-lesson-teacher-single-picker-option jp-lesson-teacher-single-picker-option--add"
                disabled={adding || disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void handleAddTeacher()}
              >
                {adding ? "添加中…" : `添加「${trimmedQuery}」`}
              </button>
            </li>
          ) : null}
          {filteredTeachers.map((teacher) => {
            const pickerName = lessonTeacherPickerName(teacher);
            return (
              <li key={teacher.id} role="option" aria-selected={value === pickerName}>
                <button
                  type="button"
                  className="jp-lesson-teacher-single-picker-option"
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectTeacher(pickerName)}
                >
                  {formatTeacherDisplayLabel(
                    teacher.name,
                    teacher.hourly_rate,
                    teacher.lesson_minutes
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {addError ? (
        <p className="jp-lesson-teacher-single-picker-error" role="alert">
          {addError}
        </p>
      ) : null}

      <style jsx>{`
        .jp-lesson-teacher-single-picker {
          position: relative;
        }

        .jp-lesson-teacher-single-picker-input,
        .jp-lesson-teacher-single-picker-add-input {
          width: 100%;
          box-sizing: border-box;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font-size: 0.875rem;
        }

        .jp-lesson-teacher-single-picker-add {
          display: grid;
          gap: 0.35rem;
          margin-top: 0.45rem;
        }

        .jp-lesson-teacher-single-picker-add-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0.45rem;
        }

        .jp-lesson-teacher-single-picker-add-select {
          cursor: pointer;
        }

        .jp-lesson-teacher-single-picker-add-preview {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-lesson-teacher-single-picker-list {
          position: absolute;
          z-index: 5;
          left: 0;
          right: 0;
          margin: 0;
          padding: 0.3rem;
          list-style: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--panel);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
          max-height: 12rem;
          overflow: auto;
        }

        .jp-lesson-teacher-single-picker-list:not(.jp-lesson-teacher-single-picker-list--with-add) {
          top: calc(100% + 0.25rem);
        }

        .jp-lesson-teacher-single-picker-list--with-add {
          position: static;
          margin-top: 0.35rem;
          box-shadow: none;
        }

        .jp-lesson-teacher-single-picker-option {
          width: 100%;
          display: block;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: inherit;
          text-align: left;
          padding: 0.45rem 0.55rem;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .jp-lesson-teacher-single-picker-option:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }

        .jp-lesson-teacher-single-picker-option--add {
          color: var(--accent);
          font-weight: 600;
        }

        .jp-lesson-teacher-single-picker-hint {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.4;
        }

        .jp-lesson-teacher-single-picker-error {
          margin: 0.35rem 0 0;
          font-size: 0.75rem;
          color: var(--rise);
        }
      `}</style>
    </div>
  );
});
