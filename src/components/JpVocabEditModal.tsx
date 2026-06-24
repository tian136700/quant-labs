"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpVocabKind, JpVocabWord } from "@/lib/types";

type Props = {
  open: boolean;
  word: JpVocabWord | null;
  locale: "en" | "zh";
  canEdit: boolean;
  onClose: () => void;
  onSaved: (word: JpVocabWord) => void;
  onNeedAuth: () => void;
};

const KIND_OPTIONS: { key: JpVocabKind; label: string }[] = [
  { key: "word", label: "单词" },
  { key: "grammar", label: "语法" },
];

export function JpVocabEditModal({
  open,
  word,
  locale,
  canEdit,
  onClose,
  onSaved,
  onNeedAuth,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [kind, setKind] = useState<JpVocabKind>("word");
  const [wordText, setWordText] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [pos, setPos] = useState("");
  const [classNotes, setClassNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && word) {
      setKind(word.kind);
      setWordText(word.word);
      setReading(word.reading || "");
      setMeaning(word.meaning || "");
      setPos(word.pos || "");
      setClassNotes(word.class_notes || "");
      setError("");
    }
  }, [open, word]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || submitting) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const save = async () => {
    if (!word) return;
    if (!canEdit) {
      onNeedAuth();
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/jp-vocab/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({
          word_id: word.id,
          kind,
          word: wordText.trim(),
          reading: kind === "word" ? reading.trim() || null : null,
          meaning: meaning.trim() || null,
          pos: pos.trim() || null,
          class_notes: classNotes.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        word?: JpVocabWord;
        error?: string;
      };

      if (res.status === 401) {
        onNeedAuth();
        throw new Error(locale === "zh" ? "请登录后再编辑。" : "Please log in.");
      }
      if (!data.ok || !data.word) {
        throw new Error(
          data.error || (locale === "zh" ? "保存失败" : "Save failed")
        );
      }

      onSaved(data.word);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !mounted || !word) return null;

  return createPortal(
    <>
      <div
        className="jp-vocab-edit-overlay"
        role="presentation"
        onClick={() => {
          if (!submitting) onClose();
        }}
      >
        <div
          className="jp-vocab-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-vocab-edit-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-vocab-edit-header">
            <div>
              <h2 id="jp-vocab-edit-title" className="jp-vocab-edit-title">
                编辑词条
              </h2>
              <p className="jp-vocab-edit-subtitle">
                熟悉程度、抽查次数等统计请在表格中直接操作，此处不可修改。
              </p>
            </div>
            <button
              type="button"
              className="jp-vocab-edit-close"
              onClick={onClose}
              disabled={submitting}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-vocab-edit-body">
            <div className="field">
              <label htmlFor="jp-vocab-edit-kind" className="jp-vocab-edit-label">
                类型
              </label>
              <select
                id="jp-vocab-edit-kind"
                className="jp-vocab-edit-select"
                value={kind}
                disabled={!canEdit || submitting}
                onChange={(e) => setKind(e.target.value as JpVocabKind)}
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-edit-word" className="jp-vocab-edit-label">
                {kind === "grammar" ? "语法" : "单词 / 语法"}
                <span className="etr-required">*</span>
              </label>
              <textarea
                id="jp-vocab-edit-word"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
                rows={2}
                value={wordText}
                disabled={!canEdit || submitting}
                placeholder={kind === "grammar" ? "例如：～ばかり" : "例如：勉強"}
                onChange={(e) => setWordText(e.target.value)}
              />
            </div>

            {kind === "word" ? (
              <div className="field">
                <label htmlFor="jp-vocab-edit-reading" className="jp-vocab-edit-label">
                  读音（可选）
                </label>
                <input
                  id="jp-vocab-edit-reading"
                  type="text"
                  className="jp-vocab-edit-input"
                  value={reading}
                  disabled={!canEdit || submitting}
                  placeholder="例如：べんきょう"
                  onChange={(e) => setReading(e.target.value)}
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="jp-vocab-edit-meaning" className="jp-vocab-edit-label">
                释义
              </label>
              <textarea
                id="jp-vocab-edit-meaning"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
                rows={2}
                value={meaning}
                disabled={!canEdit || submitting}
                placeholder="例如：学习"
                onChange={(e) => setMeaning(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-edit-pos" className="jp-vocab-edit-label">
                词性
              </label>
              <textarea
                id="jp-vocab-edit-pos"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
                rows={2}
                value={pos}
                disabled={!canEdit || submitting}
                placeholder="例如：名词、动词、形容词"
                onChange={(e) => setPos(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-edit-notes" className="jp-vocab-edit-label">
                备注
              </label>
              <textarea
                id="jp-vocab-edit-notes"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--lg"
                rows={4}
                value={classNotes}
                disabled={!canEdit || submitting}
                placeholder="记录例句、用法、易错点…"
                onChange={(e) => setClassNotes(e.target.value)}
              />
              <p className="jp-vocab-edit-hint">备注保存后会同步到日语新课。</p>
            </div>

            {error ? <p className="jp-vocab-edit-error">{error}</p> : null}
          </div>

          <div className="jp-vocab-edit-footer">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              disabled={submitting}
              onClick={onClose}
            >
              取消
            </button>
            {canEdit ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                disabled={submitting}
                onClick={() => void save()}
              >
                {submitting ? "保存中…" : "保存"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <style jsx>{`
        .jp-vocab-edit-overlay {
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

        .jp-vocab-edit-modal {
          display: flex;
          flex-direction: column;
          width: min(520px, 100%);
          max-height: min(92vh, 720px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-vocab-edit-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-vocab-edit-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-vocab-edit-subtitle {
          margin: 0.35rem 0 0;
          font-size: 0.75rem;
          line-height: 1.45;
          color: var(--muted);
        }

        .jp-vocab-edit-close {
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

        .jp-vocab-edit-body {
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          overflow-y: auto;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .jp-vocab-edit-label {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-vocab-edit-input,
        .jp-vocab-edit-select,
        .jp-vocab-edit-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.55rem 0.65rem;
          line-height: 1.45;
        }

        .jp-vocab-edit-select {
          cursor: pointer;
        }

        .jp-vocab-edit-select:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-vocab-edit-textarea {
          resize: vertical;
        }

        .jp-vocab-edit-textarea--sm {
          min-height: 3.2rem;
        }

        .jp-vocab-edit-textarea--lg {
          min-height: 5.5rem;
        }

        .jp-vocab-edit-hint {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-vocab-edit-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
        }

        .jp-vocab-edit-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }
      `}</style>
    </>,
    document.body
  );
}
