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
    placeholder = "选择老师",
  },
  ref
) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const addNameRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addMinutes, setAddMinutes] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const addingRef = useRef(false);

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

  const addHourlyPreview = useMemo(() => {
    if (!addPrice.trim() || !addMinutes.trim()) return null;
    return calcHourlyRate(Number(addPrice), Number(addMinutes));
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

  useEffect(() => {
    if (!addFormOpen) return;
    const timer = window.setTimeout(() => addNameRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [addFormOpen]);

  const clearAddDraft = () => {
    setAddName("");
    setAddPrice("");
    setAddMinutes("");
    setAddError("");
  };

  const closeAddForm = () => {
    setAddFormOpen(false);
    clearAddDraft();
  };

  const selectTeacher = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
    closeAddForm();
  };

  const openAddForm = () => {
    if (disabled || adding) return;
    setOpen(false);
    setAddFormOpen(true);
    setAddError("");
    // 搜索框里已有未匹配的姓名时，带到新增表单
    if (trimmedQuery && !exactMatch) {
      setAddName(trimmedQuery);
    }
  };

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
        setAddFormOpen(false);
        clearAddDraft();
        return teacher;
      } finally {
        addingRef.current = false;
        setAdding(false);
      }
    },
    [onAddTeacher, onChange]
  );

  const handleConfirmAdd = async () => {
    if (adding || disabled) return;
    const trimmedName = addName.trim();
    if (!trimmedName) {
      setAddError("请填写老师称呼");
      return;
    }

    const existing = findLessonTeacherByPickerName(sortedTeachers, trimmedName);
    if (existing) {
      selectTeacher(lessonTeacherPickerName(existing));
      return;
    }

    const rateError = validateLessonTeacherAddRateFields(addPrice, addMinutes);
    if (rateError) {
      setAddError(rateError);
      return;
    }

    const input = buildLessonTeacherAddInput(trimmedName, addPrice, addMinutes);
    if (!input) return;
    await runAddTeacher(input);
  };

  useImperativeHandle(
    ref,
    () => ({
      resolveValueForSave: async () => {
        if (addFormOpen) {
          return { ok: false, error: "请先完成新增老师，或取消后保存" };
        }
        if (!trimmedQuery) return { ok: true, name: "" };
        if (exactMatch) {
          return { ok: true, name: lessonTeacherPickerName(exactMatch) };
        }
        // 未点「新增老师」就直接写了姓名：只当文本，不自动入库
        return { ok: true, name: trimmedQuery };
      },
    }),
    [addFormOpen, exactMatch, trimmedQuery]
  );

  const clearSelection = () => {
    onChange("");
    setQuery("");
    setOpen(false);
    closeAddForm();
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        if (addFormOpen) return;
        if (exactMatch) {
          const name = lessonTeacherPickerName(exactMatch);
          // 仅当输入仍完整命中该老师时归一化；删改中则保留当前草稿
          if (trimmedQuery === name) {
            onChange(name);
            setQuery(name);
          } else {
            onChange(trimmedQuery);
          }
        } else {
          onChange(trimmedQuery);
        }
      }
    }, 0);
  };

  return (
    <div className="jp-lesson-teacher-single-picker" ref={containerRef}>
      <div className="jp-lesson-teacher-single-picker-row">
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
          onFocus={() => {
            if (!addFormOpen) setOpen(true);
          }}
          onBlur={handleBlur}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            onChange(next);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {trimmedQuery ? (
          <button
            type="button"
            className="jp-lesson-teacher-single-picker-clear-btn"
            aria-label="清除老师"
            disabled={disabled || adding}
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearSelection}
          >
            ×
          </button>
        ) : null}
        <button
          type="button"
          className="jp-lesson-teacher-single-picker-add-btn"
          disabled={disabled || adding}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openAddForm}
        >
          新增老师
        </button>
      </div>

      {open && !addFormOpen && filteredTeachers.length > 0 ? (
        <ul id={listId} className="jp-lesson-teacher-single-picker-list" role="listbox">
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

      {addFormOpen ? (
        <div className="jp-lesson-teacher-single-picker-add-form">
          <p className="jp-lesson-teacher-single-picker-add-title">新增老师</p>
          <label className="jp-lesson-teacher-single-picker-add-field">
            <span>称呼</span>
            <input
              ref={addNameRef}
              type="text"
              className="jp-lesson-teacher-single-picker-add-input"
              value={addName}
              placeholder="例如：周老师"
              disabled={disabled || adding}
              onChange={(event) => {
                setAddName(event.target.value);
                setAddError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleConfirmAdd();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeAddForm();
                }
              }}
            />
          </label>
          <div className="jp-lesson-teacher-single-picker-add-rate">
            <label className="jp-lesson-teacher-single-picker-add-field">
              <span>金额（可选）</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="jp-lesson-teacher-single-picker-add-input"
                value={addPrice}
                placeholder="例如：50"
                disabled={disabled || adding}
                onChange={(event) => {
                  setAddPrice(event.target.value);
                  setAddError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleConfirmAdd();
                  }
                }}
              />
            </label>
            <label className="jp-lesson-teacher-single-picker-add-field">
              <span>时长（可选）</span>
              <select
                className="jp-lesson-teacher-single-picker-add-input jp-lesson-teacher-single-picker-add-select"
                value={addMinutes}
                disabled={disabled || adding}
                onChange={(event) => {
                  setAddMinutes(event.target.value);
                  setAddError("");
                }}
              >
                <option value="">请选择</option>
                {TEACHER_LESSON_MINUTE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {addHourlyPreview != null ? (
            <p className="jp-lesson-teacher-single-picker-add-preview">
              折合时薪 ≈ {formatHourlyRate(addHourlyPreview)}
            </p>
          ) : (
            <p className="jp-lesson-teacher-single-picker-hint">
              金额与时长需同时填写，或都留空（与日语新课一致）
            </p>
          )}
          {addError ? (
            <p className="jp-lesson-teacher-single-picker-error" role="alert">
              {addError}
            </p>
          ) : null}
          <div className="jp-lesson-teacher-single-picker-add-actions">
            <button
              type="button"
              className="jp-lesson-teacher-single-picker-cancel-btn"
              disabled={adding}
              onClick={closeAddForm}
            >
              取消
            </button>
            <button
              type="button"
              className="jp-lesson-teacher-single-picker-confirm-btn"
              disabled={disabled || adding}
              onClick={() => void handleConfirmAdd()}
            >
              {adding ? "添加中…" : "确定"}
            </button>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .jp-lesson-teacher-single-picker {
          position: relative;
        }

        .jp-lesson-teacher-single-picker-row {
          display: flex;
          gap: 0.45rem;
          align-items: stretch;
        }

        .jp-lesson-teacher-single-picker-input {
          flex: 1 1 auto;
          min-width: 0;
        }

        .jp-lesson-teacher-single-picker-clear-btn {
          flex: 0 0 auto;
          width: 2.25rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: var(--muted);
          font-size: 1.1rem;
          line-height: 1;
          cursor: pointer;
        }

        .jp-lesson-teacher-single-picker-clear-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
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

        .jp-lesson-teacher-single-picker-add-btn,
        .jp-lesson-teacher-single-picker-cancel-btn,
        .jp-lesson-teacher-single-picker-confirm-btn {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.45rem 0.75rem;
          font-size: 0.8125rem;
          cursor: pointer;
          white-space: nowrap;
        }

        .jp-lesson-teacher-single-picker-add-btn {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
          font-weight: 600;
        }

        .jp-lesson-teacher-single-picker-add-btn:disabled,
        .jp-lesson-teacher-single-picker-cancel-btn:disabled,
        .jp-lesson-teacher-single-picker-confirm-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
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

        .jp-lesson-teacher-single-picker-add-form {
          margin-top: 0.55rem;
          padding: 0.7rem 0.75rem;
          border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
          border-radius: 10px;
          background: color-mix(in srgb, var(--accent) 6%, var(--panel));
          display: grid;
          gap: 0.55rem;
        }

        .jp-lesson-teacher-single-picker-add-title {
          margin: 0;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--accent);
        }

        .jp-lesson-teacher-single-picker-add-field {
          display: grid;
          gap: 0.3rem;
        }

        .jp-lesson-teacher-single-picker-add-field span {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-lesson-teacher-single-picker-add-rate {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0.45rem;
        }

        .jp-lesson-teacher-single-picker-add-select {
          cursor: pointer;
        }

        .jp-lesson-teacher-single-picker-add-preview,
        .jp-lesson-teacher-single-picker-hint {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.4;
        }

        .jp-lesson-teacher-single-picker-error {
          margin: 0;
          font-size: 0.75rem;
          color: var(--rise);
        }

        .jp-lesson-teacher-single-picker-add-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.45rem;
        }

        .jp-lesson-teacher-single-picker-cancel-btn {
          background: var(--panel);
          color: var(--text);
        }

        .jp-lesson-teacher-single-picker-confirm-btn {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 18%, var(--panel));
          color: var(--accent);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
});
