"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { parseJpLessonBulkGrammarText } from "@/lib/jp-lesson-bulk-grammar-parse";
import type { JpLessonProgressStatus } from "@/lib/jp-lesson-shared";
import {
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressPercent,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
} from "@/lib/jp-vocab-save-progress";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import type { JpLessonRecord } from "@/lib/types";

export type JpLessonBulkGrammarModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (payload: {
    lesson: JpLessonRecord;
    progress: JpLessonProgressStatus;
    itemCount: number;
    inserted: number;
    skipped: number;
  }) => void;
};

const PROGRESS_OPTIONS: { value: JpLessonProgressStatus; label: string }[] = [
  { value: "pending", label: "未完成" },
  { value: "learning", label: "学习中" },
  { value: "completed", label: "已完成" },
];

export function JpLessonBulkGrammarModal({
  open,
  onClose,
  onCreated,
}: JpLessonBulkGrammarModalProps) {
  const [mounted, setMounted] = useState(false);
  const [courseLabel, setCourseLabel] = useState("标日第26课");
  const [progress, setProgress] = useState<JpLessonProgressStatus>("pending");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setError("");
      setSaving(false);
      setProgressPercent(null);
    }
  }, [open]);

  const preview = useMemo(() => parseJpLessonBulkGrammarText(text), [text]);
  const previewCount = preview.ok ? preview.items.length : 0;

  const handleSubmit = async () => {
    setError("");
    const label = courseLabel.trim();
    if (!label) {
      setError("请填写教材课次（如标日第26课）");
      return;
    }
    const parsed = parseJpLessonBulkGrammarText(text);
    if (!parsed.ok) {
      setError(parsed.detail || parsed.error || "无法解析粘贴内容");
      return;
    }

    setSaving(true);
    setProgressPercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setProgressPercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
    }, 200);

    try {
      const res = await fetch("/api/jp-lesson", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_create_grammar",
          text,
          course_label: label,
          progress_status: progress,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        detail?: string | null;
        lesson?: JpLessonRecord;
        item_count?: number;
        vocab_sync?: {
          inserted?: number;
          skipped?: number;
        } | null;
        skipped_words?: string[];
      };
      if (!data.ok || !data.lesson) {
        setError(data.detail || data.error || "保存失败");
        setProgressPercent(null);
        return;
      }
      await animateJpVocabSaveProgressTo100(startedAt, setProgressPercent);
      onCreated({
        lesson: data.lesson,
        progress,
        itemCount: data.item_count ?? parsed.items.length,
        inserted: data.vocab_sync?.inserted ?? 0,
        skipped: data.vocab_sync?.skipped ?? data.skipped_words?.length ?? 0,
      });
      setText("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgressPercent(null);
    } finally {
      window.clearInterval(timer);
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="jp-lesson-bulk-grammar-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (saving) return;
        closeModalOnBackdropMouseDown(e, onClose);
      }}
    >
      <div
        className="jp-lesson-bulk-grammar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-lesson-bulk-grammar-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-lesson-bulk-grammar-header">
          <h2 id="jp-lesson-bulk-grammar-title" className="jp-lesson-bulk-grammar-title">
            新增语法
          </h2>
          <button
            type="button"
            className="jp-lesson-bulk-grammar-close"
            onClick={onClose}
            disabled={saving}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="jp-lesson-bulk-grammar-body">
          <label className="jp-lesson-bulk-grammar-field">
            <span>教材课次</span>
            <input
              type="text"
              value={courseLabel}
              onChange={(e) => setCourseLabel(e.target.value)}
              placeholder="如：标日第26课"
              disabled={saving}
              autoComplete="off"
            />
          </label>

          <fieldset className="jp-lesson-bulk-grammar-status" disabled={saving}>
            <legend>学习状态</legend>
            <div className="jp-lesson-bulk-grammar-status-row">
              {PROGRESS_OPTIONS.map((opt) => (
                <label key={opt.value} className="jp-lesson-bulk-grammar-radio">
                  <input
                    type="radio"
                    name="jp-lesson-bulk-progress"
                    checked={progress === opt.value}
                    onChange={() => setProgress(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <p className="jp-lesson-bulk-grammar-hint">
              选「已完成」会同步到日语抽问；抽问里已有的语法/单词会跳过。
            </p>
          </fieldset>

          <label className="jp-lesson-bulk-grammar-field">
            <span>
              批量粘贴
              {previewCount > 0 ? (
                <em className="jp-lesson-bulk-grammar-preview">已识别 {previewCount} 条</em>
              ) : null}
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={saving}
              rows={14}
              spellCheck={false}
              placeholder={`1. ～でしょう\n释义：……\n标注：考试和口语常用\n口语频次：9\n考试频次：9\n\n2. ～かもしれません\n释义：……\n…`}
            />
          </label>

          {error ? (
            <p className="jp-lesson-bulk-grammar-error" role="alert">
              {error}
            </p>
          ) : null}

          {saving ? (
            <JpVocabSaveProgressBar
              label={
                progress === "completed"
                  ? "正在保存并同步到抽问…"
                  : "正在保存新课…"
              }
              percent={
                progressPercent == null
                  ? jpVocabSaveProgressDisplayPercent(null)
                  : progressPercent
              }
              fullWidth
            />
          ) : null}
        </div>

        <div className="jp-lesson-bulk-grammar-footer">
          <button
            type="button"
            className="btn-rsi-filter"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            onClick={() => void handleSubmit()}
            disabled={saving || !text.trim()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .jp-lesson-bulk-grammar-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          background: rgba(8, 12, 20, 0.72);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: max(1rem, env(safe-area-inset-top)) 0.75rem
            max(1rem, env(safe-area-inset-bottom));
          overflow-y: auto;
        }
        .jp-lesson-bulk-grammar-modal {
          width: min(40rem, 100%);
          margin: 1.25rem auto;
          background: var(--panel, #1a2230);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
          color: var(--text, #e8eef8);
        }
        .jp-lesson-bulk-grammar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.9rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .jp-lesson-bulk-grammar-title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 650;
        }
        .jp-lesson-bulk-grammar-close {
          border: none;
          background: transparent;
          color: var(--muted, #9aa8bc);
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
          padding: 0.15rem 0.4rem;
        }
        .jp-lesson-bulk-grammar-body {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .jp-lesson-bulk-grammar-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.875rem;
        }
        .jp-lesson-bulk-grammar-field span {
          color: var(--muted, #9aa8bc);
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }
        .jp-lesson-bulk-grammar-preview {
          font-style: normal;
          color: var(--accent, #6cb6ff);
          font-size: 0.8rem;
        }
        .jp-lesson-bulk-grammar-field input,
        .jp-lesson-bulk-grammar-field textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.25);
          color: inherit;
          padding: 0.55rem 0.65rem;
          font: inherit;
        }
        .jp-lesson-bulk-grammar-field textarea {
          min-height: 14rem;
          resize: vertical;
          line-height: 1.45;
        }
        .jp-lesson-bulk-grammar-status {
          margin: 0;
          padding: 0.65rem 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
        }
        .jp-lesson-bulk-grammar-status legend {
          padding: 0 0.25rem;
          color: var(--muted, #9aa8bc);
          font-size: 0.8rem;
        }
        .jp-lesson-bulk-grammar-status-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1rem;
        }
        .jp-lesson-bulk-grammar-radio {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.9rem;
          cursor: pointer;
        }
        .jp-lesson-bulk-grammar-hint {
          margin: 0.55rem 0 0;
          font-size: 0.78rem;
          color: var(--muted, #9aa8bc);
          line-height: 1.4;
        }
        .jp-lesson-bulk-grammar-error {
          margin: 0;
          color: var(--rise, #e85d6f);
          font-size: 0.875rem;
        }
        .jp-lesson-bulk-grammar-footer {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.75rem 1rem 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        @media (max-width: 767px) {
          .jp-lesson-bulk-grammar-modal {
            width: 100%;
            margin: 0.5rem auto;
          }
          .jp-lesson-bulk-grammar-field textarea {
            min-height: 12rem;
          }
          .jp-lesson-bulk-grammar-footer {
            flex-direction: column-reverse;
          }
          .jp-lesson-bulk-grammar-footer .btn-rsi-filter {
            width: 100%;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
