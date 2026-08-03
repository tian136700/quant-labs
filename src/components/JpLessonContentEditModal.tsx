"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import {
  buildJpLessonContentMeaningsFromEdit,
  formatJpLessonContentForEdit,
  formatJpLessonMeaningsForEdit,
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
  const [contentEdit, setContentEdit] = useState("");
  const [meaningsEdit, setMeaningsEdit] = useState("");
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
    setContentEdit(formatJpLessonContentForEdit(lesson.content));
    setMeaningsEdit(
      formatJpLessonMeaningsForEdit(lesson.content, lesson.meanings)
    );
    setLocalError(null);
  }, [open, lesson]);

  const preview = useMemo(() => {
    const parsed = buildJpLessonContentMeaningsFromEdit(contentEdit, meaningsEdit);
    if (!parsed.ok) return null;
    return parsed.value;
  }, [contentEdit, meaningsEdit]);

  const mismatchHint =
    preview && preview.meaningCount > 0 && preview.meaningCount !== preview.contentCount
      ? `学习内容 ${preview.contentCount} 条，释义 ${preview.meaningCount} 条；保存后按学习内容对齐（多截少补空）。`
      : null;

  if (!mounted || !open || !lesson) return null;

  const handleSave = () => {
    const parsed = buildJpLessonContentMeaningsFromEdit(contentEdit, meaningsEdit);
    if (!parsed.ok) {
      setLocalError("学习内容不能为空，请按每行一项填写。");
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
            每行一项，编号可有可无；上下一一对应。
          </p>
        </div>

        <div className="jp-lesson-content-edit-body">
          <label className="jp-lesson-content-edit-field">
            <span>学习内容</span>
            <textarea
              className="jp-lesson-content-edit-textarea"
              rows={10}
              value={contentEdit}
              disabled={saveBusy}
              spellCheck={false}
              placeholder={"1. ～ばかり\n2. ～ようになる\n3. ～に来る"}
              onChange={(e) => setContentEdit(e.target.value)}
            />
          </label>

          <label className="jp-lesson-content-edit-field">
            <span>释义（与上面一一对应）</span>
            <textarea
              className="jp-lesson-content-edit-textarea"
              rows={10}
              value={meaningsEdit}
              disabled={saveBusy}
              spellCheck={false}
              placeholder={"1. （刚刚，只是……）\n2. （变得能够……）\n3. （来……做……）"}
              onChange={(e) => setMeaningsEdit(e.target.value)}
            />
          </label>

          {mismatchHint ? (
            <p className="jp-lesson-content-edit-hint" role="status">
              {mismatchHint}
            </p>
          ) : (
            <p className="jp-lesson-content-edit-hint">
              保存后自动拆成词表用的逗号 /「|」格式。已有标注、例句会按新条数对齐。
            </p>
          )}

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
          width: min(720px, 100%);
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
          gap: 0.85rem;
        }
        .jp-lesson-content-edit-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.9rem;
          font-weight: 600;
        }
        .jp-lesson-content-edit-textarea {
          width: 100%;
          min-height: 9rem;
          resize: vertical;
          padding: 0.65rem 0.75rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-weight: 400;
          font-size: 0.92rem;
          line-height: 1.55;
          white-space: pre-wrap;
        }
        .jp-lesson-content-edit-textarea:focus {
          outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
          outline-offset: 1px;
        }
        .jp-lesson-content-edit-hint {
          margin: 0;
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
          .jp-lesson-content-edit-textarea {
            min-height: 7.5rem;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
