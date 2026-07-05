"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EnLessonRecord, EnLessonTeacher } from "@/lib/types";

type Props = {
  open: boolean;
  lesson: EnLessonRecord | null;
  teachers: EnLessonTeacher[];
  saving?: boolean;
  onClose: () => void;
  onSave: (
    teacherIds: number[],
    teacherOther: string | null,
    options?: { keepOpen?: boolean }
  ) => void | Promise<void>;
  onAddTeacher: (name: string) => Promise<EnLessonTeacher | null>;
};

export function EnLessonTeacherEditModal({
  open,
  lesson,
  teachers,
  saving = false,
  onClose,
  onSave,
  onAddTeacher,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [addName, setAddName] = useState("");
  const [addingTeacher, setAddingTeacher] = useState(false);
  const [addError, setAddError] = useState("");
  const skipAddBlurRef = useRef(false);

  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [teachers]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !lesson) return;
    setSelectedIds([...(lesson.teacher_ids ?? [])]);
    setAddName("");
    setAddError("");
  }, [open, lesson]);

  const toggleTeacher = (teacherId: number) => {
    setSelectedIds((prev) =>
      prev.includes(teacherId)
        ? prev.filter((id) => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const resolveExistingTeacher = (name: string): EnLessonTeacher | undefined =>
    sortedTeachers.find((t) => t.name === name);

  const handleAddTeacher = async () => {
    const trimmed = addName.trim();
    if (!trimmed || addingTeacher || saving) return;

    skipAddBlurRef.current = true;
    setAddError("");

    const existing = resolveExistingTeacher(trimmed);
    if (existing) {
      const nextIds = selectedIds.includes(existing.id)
        ? selectedIds
        : [...selectedIds, existing.id];
      setSelectedIds(nextIds);
      setAddName("");
      if (!selectedIds.includes(existing.id)) {
        await onSave(nextIds, null, { keepOpen: true });
      }
      skipAddBlurRef.current = false;
      return;
    }

    setAddingTeacher(true);
    try {
      const teacher = await onAddTeacher(trimmed);
      if (!teacher) {
        setAddError("添加失败，请重试");
        skipAddBlurRef.current = false;
        return;
      }
      const nextIds = selectedIds.includes(teacher.id)
        ? selectedIds
        : [...selectedIds, teacher.id];
      setSelectedIds(nextIds);
      setAddName("");
      await onSave(nextIds, null, { keepOpen: true });
    } finally {
      setAddingTeacher(false);
      skipAddBlurRef.current = false;
    }
  };

  const handleSave = () => {
    onSave(selectedIds, null);
  };

  if (!open || !mounted || !lesson) return null;

  return createPortal(
    <div
      className="en-lesson- jp-lesson-teacher-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="en-lesson- jp-lesson-teacher-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="en-lesson- jp-lesson-teacher-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="en-lesson- jp-lesson-teacher-header">
          <div>
            <h2 id="en-lesson- jp-lesson-teacher-modal-title">设置上课老师</h2>
            <p className="en-lesson- jp-lesson-teacher-modal-lesson">
              课程 #{lesson.id} · {lesson.content}
            </p>
          </div>
          <button
            type="button"
            className="en-lesson- jp-lesson-teacher-close"
            aria-label="关闭"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <fieldset className="en-lesson- jp-lesson-teacher-fieldset" disabled={saving}>
          <legend>上课老师（可多选）</legend>
          <div className="en-lesson- jp-lesson-teacher-options">
            {sortedTeachers.map((teacher) => (
              <label key={teacher.id} className="en-lesson- jp-lesson-teacher-option">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(teacher.id)}
                  onChange={() => toggleTeacher(teacher.id)}
                />
                <span>{teacher.name}</span>
              </label>
            ))}
            <div className="en-lesson- jp-lesson-teacher-option en-lesson- jp-lesson-teacher-option--add">
              <input
                type="checkbox"
                checked={false}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
              />
              <span className="en-lesson- jp-lesson-teacher-add-label">添加老师</span>
              <input
                type="text"
                className="en-lesson- jp-lesson-teacher-add-input"
                value={addName}
                placeholder="输入姓名后回车保存"
                disabled={addingTeacher || saving}
                onChange={(e) => {
                  setAddName(e.target.value);
                  if (addError) setAddError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddTeacher();
                  }
                }}
                onBlur={() => {
                  if (skipAddBlurRef.current) return;
                  if (addName.trim()) void handleAddTeacher();
                }}
              />
            </div>
          </div>
          {addError ? <p className="en-lesson- jp-lesson-teacher-add-error">{addError}</p> : null}
          {!sortedTeachers.length ? (
            <p className="en-lesson- jp-lesson-teacher-hint">暂无老师；可在下方直接添加。</p>
          ) : null}
        </fieldset>

        <div className="en-lesson- jp-lesson-teacher-actions">
          <button
            type="button"
            className="en-lesson- jp-lesson-action-btn"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="en-lesson- jp-lesson-action-btn en-lesson- jp-lesson-action-btn--primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .en-lesson- jp-lesson-teacher-overlay {
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

        .en-lesson- jp-lesson-teacher-modal {
          width: min(540px, 100%);
          padding: 1rem 1.1rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .en-lesson- jp-lesson-teacher-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .en-lesson- jp-lesson-teacher-header h2 {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .en-lesson- jp-lesson-teacher-modal-lesson {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.8125rem;
          line-height: 1.45;
        }

        .en-lesson- jp-lesson-teacher-close {
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

        .en-lesson- jp-lesson-teacher-fieldset {
          margin: 0 0 0.75rem;
          padding: 0;
          border: none;
        }

        .en-lesson- jp-lesson-teacher-fieldset legend {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-bottom: 0.5rem;
        }

        .en-lesson- jp-lesson-teacher-options {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          max-height: min(55vh, 380px);
          overflow-y: auto;
          padding: 0.65rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
        }

        .en-lesson- jp-lesson-teacher-option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .en-lesson- jp-lesson-teacher-option input[type="checkbox"] {
          flex-shrink: 0;
        }

        .en-lesson- jp-lesson-teacher-option--add {
          flex-wrap: wrap;
        }

        .en-lesson- jp-lesson-teacher-add-label {
          color: var(--muted);
          flex-shrink: 0;
        }

        .en-lesson- jp-lesson-teacher-add-input {
          flex: 1 1 10rem;
          min-width: 0;
          padding: 0.35rem 0.5rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--panel);
          color: inherit;
          font-size: 0.8125rem;
        }

        .en-lesson- jp-lesson-teacher-add-input:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .en-lesson- jp-lesson-teacher-add-error {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--rise);
        }

        .en-lesson- jp-lesson-teacher-hint {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .en-lesson- jp-lesson-teacher-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        :global(.en-lesson- jp-lesson-action-btn--primary) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
        }
      `}</style>
    </div>,
    document.body
  );
}
