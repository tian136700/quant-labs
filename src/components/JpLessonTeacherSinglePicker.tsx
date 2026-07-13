"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { JpLessonTeacherAddInput } from "@/components/JpLessonTeacherEditModal";
import {
  formatTeacherDisplayLabel,
  resolveLessonTeacherRateFields,
  sortJpLessonTeachersByLessonCount,
} from "@/lib/jp-lesson-teacher-rate";
import type { JpLessonTeacher } from "@/lib/types";

type Props = {
  value: string;
  teachers: JpLessonTeacher[];
  onChange: (name: string) => void;
  onAddTeacher: (input: JpLessonTeacherAddInput) => Promise<JpLessonTeacher | null>;
  disabled?: boolean;
  placeholder?: string;
};

export function JpLessonTeacherSinglePicker({
  value,
  teachers,
  onChange,
  onAddTeacher,
  disabled = false,
  placeholder = "选择或输入老师姓名",
}: Props) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
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

  const trimmedQuery = query.trim();

  const teacherPickerName = (teacher: JpLessonTeacher) =>
    resolveLessonTeacherRateFields(teacher).name;

  const filteredTeachers = useMemo(() => {
    if (!trimmedQuery) return sortedTeachers;
    const needle = trimmedQuery.toLowerCase();
    return sortedTeachers.filter((teacher) =>
      teacherPickerName(teacher).toLowerCase().includes(needle)
    );
  }, [sortedTeachers, trimmedQuery]);

  const exactMatch = useMemo(
    () =>
      sortedTeachers.find((teacher) => teacherPickerName(teacher) === trimmedQuery),
    [sortedTeachers, trimmedQuery]
  );

  const showAddOption = Boolean(trimmedQuery) && !exactMatch;

  const selectTeacher = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
    setAddError("");
  };

  const handleAddTeacher = async () => {
    if (!trimmedQuery || adding || disabled) return;
    if (exactMatch) {
      selectTeacher(teacherPickerName(exactMatch));
      return;
    }

    setAdding(true);
    setAddError("");
    try {
      const teacher = await onAddTeacher({ name: trimmedQuery });
      if (!teacher) {
        setAddError("添加失败，请重试");
        return;
      }
      selectTeacher(teacherPickerName(teacher));
    } finally {
      setAdding(false);
    }
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        if (exactMatch) {
          const name = teacherPickerName(exactMatch);
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

      {open && (filteredTeachers.length || showAddOption) ? (
        <ul id={listId} className="jp-lesson-teacher-single-picker-list" role="listbox">
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
            const pickerName = teacherPickerName(teacher);
            return (
            <li key={pickerName} role="option" aria-selected={value === pickerName}>
              <button
                type="button"
                className="jp-lesson-teacher-single-picker-option"
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectTeacher(pickerName)}
              >
                {formatTeacherDisplayLabel(teacher.name, teacher.hourly_rate, teacher.lesson_minutes)}
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

        .jp-lesson-teacher-single-picker-input {
          width: 100%;
          box-sizing: border-box;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font-size: 0.875rem;
        }

        .jp-lesson-teacher-single-picker-list {
          position: absolute;
          z-index: 5;
          top: calc(100% + 0.25rem);
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

        .jp-lesson-teacher-single-picker-error {
          margin: 0.35rem 0 0;
          font-size: 0.75rem;
          color: var(--rise);
        }
      `}</style>
    </div>
  );
}
