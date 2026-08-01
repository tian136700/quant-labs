"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { EnVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

type Field = "word" | "meaning" | "pos";

type Props = {
  open: boolean;
  word: EnVocabWord | null;
  field: Field | null;
  locale: "en" | "zh";
  canEdit: boolean;
  onClose: () => void;
  onSaved: (word: EnVocabWord) => void;
  onNeedAuth: () => void;
};

const FIELD_META: Record<
  Field,
  { title: string; label: string; placeholder: string; rows: number }
> = {
  word: {
    title: "编辑单词 / 语法",
    label: "单词 / 语法",
    placeholder: "例如：～ばかり",
    rows: 2,
  },
  meaning: {
    title: "编辑释义",
    label: "释义",
    placeholder: "例如：不用了 / 可以了",
    rows: 2,
  },
  pos: {
    title: "编辑词性",
    label: "词性",
    placeholder: "例如：名词、动词、形容词",
    rows: 2,
  },
};

export function EnVocabFieldEditModal({
  open,
  word,
  field,
  locale,
  canEdit,
  onClose,
  onSaved,
  onNeedAuth,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const meta = field ? FIELD_META[field] : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && word && field) {
      setBody(
        field === "word"
          ? word.word
          : field === "meaning"
            ? word.meaning || ""
            : word.pos || ""
      );
      setError("");
    }
  }, [open, word, field]);

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
    return lockBodyScroll();
  }, [open]);

  const save = async () => {
    if (!word || !field) return;
    if (!canEdit) {
      onNeedAuth();
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload =
        field === "word"
          ? { word_id: word.id, word: body.trim() }
          : field === "meaning"
            ? { word_id: word.id, meaning: body.trim() || null }
            : { word_id: word.id, pos: body.trim() || null };

      const res = await fetch("/api/en-vocab/fields", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok: boolean;
        word?: EnVocabWord;
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

  if (!open || !mounted || !word || !field || !meta) return null;

  return createPortal(
    <>
      <div
        className="jp-field-edit-overlay"
        role="presentation"
        onClick={() => {
          if (!submitting) onClose();
        }}
      >
        <div
          className="jp-field-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-field-edit-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-field-edit-header">
            <div>
              <h2 id="jp-field-edit-title" className="jp-field-edit-title">
                {meta.title}
              </h2>
            </div>
            <button
              type="button"
              className="jp-field-edit-close"
              onClick={onClose}
              disabled={submitting}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-field-edit-body">
            <label htmlFor="jp-field-edit-input" className="jp-field-edit-label">
              {meta.label}
            </label>
            <textarea
              id="jp-field-edit-input"
              className="jp-field-edit-textarea"
              rows={meta.rows}
              value={body}
              disabled={!canEdit || submitting}
              placeholder={meta.placeholder}
              onChange={(e) => setBody(e.target.value)}
            />
            {error ? <p className="jp-field-edit-error">{error}</p> : null}
          </div>

          <div className="jp-field-edit-footer">
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

      <style jsx global>{`
        .jp-field-edit-overlay {
          position: fixed;
          inset: 0;
          /* 须高于抽问卡 overlay(1002)；与其它英语弹层对齐 1100 */
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-field-edit-modal {
          display: flex;
          flex-direction: column;
          width: min(420px, 100%);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-field-edit-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }

        .jp-field-edit-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-field-edit-close {
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

        .jp-field-edit-body {
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .jp-field-edit-label {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-field-edit-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.55rem 0.65rem;
          resize: vertical;
          min-height: 3.2rem;
          line-height: 1.45;
        }

        .jp-field-edit-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
        }

        .jp-field-edit-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }
      `}</style>
    </>,
    document.body
  );
}
