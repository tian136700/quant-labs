"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { JpLessonRecord, JpLessonTeacher } from "@/lib/types";

type Props = {
  open: boolean;
  lesson: JpLessonRecord | null;
  teachers: JpLessonTeacher[];
  saving?: boolean;
  onClose: () => void;
  onSave: (teacherIds: number[], teacherOther: string | null) => void;
};

export function JpLessonTeacherEditModal({
  open,
  lesson,
  teachers,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherName, setOtherName] = useState("");

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
    const other = lesson.teacher_other?.trim() ?? "";
    setOtherChecked(Boolean(other));
    setOtherName(other);
  }, [open, lesson]);

  const toggleTeacher = (teacherId: number) => {
    setSelectedIds((prev) =>
      prev.includes(teacherId)
        ? prev.filter((id) => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const handleSave = () => {
    const teacherOther = otherChecked ? otherName.trim() || null : null;
    onSave(selectedIds, teacherOther);
  };

  if (!open || !mounted || !lesson) return null;

  return createPortal(
    <div
      className="jp-lesson-teacher-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="jp-lesson-teacher-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-lesson-teacher-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-lesson-teacher-header">
          <div>
            <h2 id="jp-lesson-teacher-modal-title">设置上课老师</h2>
            <p className="jp-lesson-teacher-modal-lesson">
              课程 #{lesson.id} · {lesson.content}
            </p>
          </div>
          <button
            type="button"
            className="jp-lesson-teacher-close"
            aria-label="关闭"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <fieldset className="jp-lesson-teacher-fieldset" disabled={saving}>
          <legend>上课老师（可多选）</legend>
          <div className="jp-lesson-teacher-options">
            {sortedTeachers.map((teacher) => (
              <label key={teacher.id} className="jp-lesson-teacher-option">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(teacher.id)}
                  onChange={() => toggleTeacher(teacher.id)}
                />
                <span>{teacher.name}</span>
              </label>
            ))}
            <label className="jp-lesson-teacher-option jp-lesson-teacher-option--other">
              <input
                type="checkbox"
                checked={otherChecked}
                onChange={() => setOtherChecked((prev) => !prev)}
              />
              <span>其他老师</span>
              <input
                type="text"
                className="jp-lesson-teacher-other-input"
                value={otherName}
                placeholder="手动输入姓名"
                disabled={!otherChecked || saving}
                onChange={(e) => setOtherName(e.target.value)}
              />
            </label>
          </div>
          {!sortedTeachers.length ? (
            <p className="jp-lesson-teacher-hint">
              暂无系统老师；可在下方勾选「其他老师」并手动填写。
            </p>
          ) : null}
        </fieldset>

        <div className="jp-lesson-teacher-actions">
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
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .jp-lesson-teacher-overlay {
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

        .jp-lesson-teacher-modal {
          width: min(420px, 100%);
          padding: 1rem 1.1rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-lesson-teacher-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .jp-lesson-teacher-header h2 {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-lesson-teacher-modal-lesson {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.8125rem;
          line-height: 1.45;
        }

        .jp-lesson-teacher-close {
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

        .jp-lesson-teacher-fieldset {
          margin: 0 0 0.75rem;
          padding: 0;
          border: none;
        }

        .jp-lesson-teacher-fieldset legend {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-bottom: 0.5rem;
        }

        .jp-lesson-teacher-options {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          max-height: min(40vh, 260px);
          overflow-y: auto;
          padding: 0.65rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
        }

        .jp-lesson-teacher-option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .jp-lesson-teacher-option input[type="checkbox"] {
          flex-shrink: 0;
        }

        .jp-lesson-teacher-option--other {
          flex-wrap: wrap;
        }

        .jp-lesson-teacher-other-input {
          flex: 1 1 8rem;
          min-width: 0;
          padding: 0.35rem 0.5rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--panel);
          color: inherit;
          font-size: 0.8125rem;
        }

        .jp-lesson-teacher-other-input:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-lesson-teacher-hint {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-teacher-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
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
