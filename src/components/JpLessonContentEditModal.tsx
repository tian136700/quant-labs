"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import {
  buildJpLessonContentEditRows,
  buildJpLessonContentMeaningsFromRows,
  createEmptyJpLessonContentEditRow,
  type JpLessonContentEditRow,
} from "@/lib/jp-lesson-content-edit";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import type { JpLessonRecord } from "@/lib/types";

type Props = {
  open: boolean;
  lesson: JpLessonRecord | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (content: string, meanings: string | null) => void | Promise<void>;
};

export function JpLessonContentEditModal({
  open,
  lesson,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<JpLessonContentEditRow[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const saveBusy = saving;
  const saveProgress = useSaveProgressBar(saveBusy);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open || !lesson) return;
    setRows(buildJpLessonContentEditRows(lesson.content, lesson.meanings));
    setLocalError(null);
  }, [open, lesson]);

  if (!mounted || !open || !lesson) return null;

  const updateRow = (
    id: string,
    patch: Partial<Pick<JpLessonContentEditRow, "content" | "meaning">>
  ) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const removeRow = (id: string) => {
    const target = rows.find((row) => row.id === id);
    const label = (target?.content || "").trim() || "这一项";
    if (
      !window.confirm(
        `确定删除「${label}」及其释义吗？保存后才会写回课程。`
      )
    ) {
      return;
    }
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length ? next : [createEmptyJpLessonContentEditRow()];
    });
    setLocalError(null);
  };

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyJpLessonContentEditRow()]);
  };

  const handleSave = () => {
    const parsed = buildJpLessonContentMeaningsFromRows(rows);
    if (!parsed.ok) {
      setLocalError("至少填写一项学习内容（可删空行后再保存）。");
      return;
    }
    setLocalError(null);
    void onSave(parsed.value.content, parsed.value.meanings);
  };

  return createPortal(
    <div
      className="jp-lesson-content-edit-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saveBusy) onClose();
      }}
    >
      <div
        className="jp-lesson-content-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-lesson-content-edit-title"
      >
        <div className="jp-lesson-content-edit-header">
          <h2 id="jp-lesson-content-edit-title">编辑学习内容与释义</h2>
          <p className="jp-lesson-content-edit-sub">
            课程 #{lesson.id}
            {lesson.course_label ? ` · ${lesson.course_label}` : ""}
            {" · "}
            每行一词与释义对应；可单独删除。
          </p>
        </div>

        <div className="jp-lesson-content-edit-body">
          <div className="jp-lesson-content-edit-list-head" aria-hidden="true">
            <span className="jp-lesson-content-edit-idx">#</span>
            <span>学习内容</span>
            <span>释义</span>
            <span className="jp-lesson-content-edit-del-head">操作</span>
          </div>

          <ul className="jp-lesson-content-edit-list">
            {rows.map((row, index) => (
              <li key={row.id} className="jp-lesson-content-edit-row">
                <span
                  className="jp-lesson-content-edit-idx"
                  aria-label={`第 ${index + 1} 项`}
                >
                  {index + 1}
                </span>
                <label className="jp-lesson-content-edit-cell jp-lesson-content-edit-cell--content">
                  <span className="jp-lesson-content-edit-cell-label">
                    学习内容
                  </span>
                  <input
                    type="text"
                    className="jp-lesson-content-edit-input"
                    value={row.content}
                    disabled={saveBusy}
                    spellCheck={false}
                    placeholder="单词 / 语法"
                    aria-label={`第 ${index + 1} 项学习内容`}
                    onChange={(e) =>
                      updateRow(row.id, { content: e.target.value })
                    }
                  />
                </label>
                <label className="jp-lesson-content-edit-cell jp-lesson-content-edit-cell--meaning">
                  <span className="jp-lesson-content-edit-cell-label">释义</span>
                  <input
                    type="text"
                    className="jp-lesson-content-edit-input"
                    value={row.meaning}
                    disabled={saveBusy}
                    spellCheck={false}
                    placeholder="中文释义"
                    aria-label={`第 ${index + 1} 项释义`}
                    onChange={(e) =>
                      updateRow(row.id, { meaning: e.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="jp-lesson-content-edit-delete"
                  disabled={saveBusy}
                  title="删除这一项及其释义"
                  aria-label={`删除第 ${index + 1} 项`}
                  onClick={() => removeRow(row.id)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>

          <div className="jp-lesson-content-edit-toolbar">
            <button
              type="button"
              className="jp-lesson-action-btn"
              disabled={saveBusy}
              onClick={addRow}
            >
              添加一项
            </button>
            <p className="jp-lesson-content-edit-hint">
              共 {rows.filter((r) => r.content.trim()).length} 项有效内容。保存后自动拆成词表用的逗号 /「|」格式；标注、例句按新条数对齐。
            </p>
          </div>

          {localError ? (
            <p className="jp-lesson-content-edit-error" role="alert">
              {localError}
            </p>
          ) : null}

          {saveProgress.visible ? (
            <JpVocabSaveProgressBar
              label={jpVocabSaveProgressLabel("save")}
              percent={saveProgress.percent}
              fullWidth
            />
          ) : null}
        </div>

        <div className="jp-lesson-content-edit-actions">
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={saveBusy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn jp-lesson-action-btn--primary"
            disabled={saveBusy}
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>

      <style jsx>{`
        .jp-lesson-content-edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
        }
        .jp-lesson-content-edit-modal {
          display: flex;
          flex-direction: column;
          width: min(860px, 100%);
          max-height: min(calc(100dvh - 2rem), 900px);
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-lesson-content-edit-header {
          flex-shrink: 0;
          padding: 1rem 1.1rem 0.65rem;
          border-bottom: 1px solid var(--border);
        }
        .jp-lesson-content-edit-header h2 {
          margin: 0;
          font-size: 1.1rem;
        }
        .jp-lesson-content-edit-sub {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.85rem;
          line-height: 1.45;
        }
        .jp-lesson-content-edit-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 0.85rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .jp-lesson-content-edit-list-head {
          display: grid;
          grid-template-columns: 2rem minmax(0, 1fr) minmax(0, 1fr) 4.2rem;
          gap: 0.45rem;
          align-items: center;
          padding: 0 0.15rem;
          color: var(--muted);
          font-size: 0.78rem;
          font-weight: 600;
        }
        .jp-lesson-content-edit-del-head {
          text-align: center;
        }
        .jp-lesson-content-edit-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .jp-lesson-content-edit-row {
          display: grid;
          grid-template-columns: 2rem minmax(0, 1fr) minmax(0, 1fr) 4.2rem;
          gap: 0.45rem;
          align-items: center;
          padding: 0.4rem 0.35rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 88%, var(--panel));
        }
        .jp-lesson-content-edit-idx {
          text-align: center;
          color: var(--muted);
          font-size: 0.85rem;
          font-variant-numeric: tabular-nums;
        }
        .jp-lesson-content-edit-cell {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          min-width: 0;
        }
        .jp-lesson-content-edit-cell-label {
          display: none;
          color: var(--muted);
          font-size: 0.72rem;
          font-weight: 600;
        }
        .jp-lesson-content-edit-input {
          width: 100%;
          min-width: 0;
          padding: 0.5rem 0.6rem;
          border-radius: 7px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.92rem;
          line-height: 1.4;
        }
        .jp-lesson-content-edit-input:focus {
          outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
          outline-offset: 1px;
        }
        .jp-lesson-content-edit-delete {
          min-height: 2.25rem;
          padding: 0.35rem 0.4rem;
          border-radius: 7px;
          border: 1px solid color-mix(in srgb, #e85d6f 45%, var(--border));
          background: transparent;
          color: #e85d6f;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
        }
        .jp-lesson-content-edit-delete:hover:not(:disabled) {
          background: color-mix(in srgb, #e85d6f 14%, transparent);
        }
        .jp-lesson-content-edit-delete:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-lesson-content-edit-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.65rem 0.85rem;
        }
        .jp-lesson-content-edit-hint {
          margin: 0;
          flex: 1;
          min-width: 12rem;
          color: var(--muted);
          font-size: 0.8rem;
          line-height: 1.45;
          font-weight: 400;
        }
        .jp-lesson-content-edit-error {
          margin: 0;
          color: #e85d6f;
          font-size: 0.85rem;
          font-weight: 500;
        }
        .jp-lesson-content-edit-actions {
          flex-shrink: 0;
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.75rem 1.1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
        }
        @media (max-width: 767px) {
          .jp-lesson-content-edit-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-lesson-content-edit-modal {
            width: 100%;
            max-height: min(94dvh, 900px);
            border-radius: 14px 14px 0 0;
          }
          .jp-lesson-content-edit-list-head {
            display: none;
          }
          .jp-lesson-content-edit-row {
            grid-template-columns: 1.6rem minmax(0, 1fr) auto;
            grid-template-areas:
              "idx content del"
              "idx meaning del";
            align-items: stretch;
            gap: 0.35rem 0.4rem;
            padding: 0.55rem 0.45rem;
          }
          .jp-lesson-content-edit-idx {
            grid-area: idx;
            padding-top: 0.55rem;
          }
          .jp-lesson-content-edit-cell--content {
            grid-area: content;
          }
          .jp-lesson-content-edit-cell--meaning {
            grid-area: meaning;
          }
          .jp-lesson-content-edit-delete {
            grid-area: del;
            align-self: center;
            min-width: 3.2rem;
          }
          .jp-lesson-content-edit-cell-label {
            display: block;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
