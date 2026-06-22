"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpVocabRef } from "@/lib/types";

type Props = {
  open: boolean;
  refKey: string | null;
  refMeta?: JpVocabRef;
  locale: "en" | "zh";
  canEdit: boolean;
  onClose: () => void;
  onUpdated: (ref: JpVocabRef) => void;
  onNeedAuth: () => void;
};

const ERR = {
  zh: {
    file_required: "请选择要上传的教案文件",
    file_too_large: "文件过大（最大 20MB）",
    ref_not_found: "教案不存在",
    empty_file: "文件为空",
  },
  en: {
    file_required: "Please choose a file",
    file_too_large: "File too large (max 20MB)",
    ref_not_found: "Lesson plan not found",
    empty_file: "Empty file",
  },
};

export function JpVocabRefEditModal({
  open,
  refKey,
  refMeta,
  locale,
  canEdit,
  onClose,
  onUpdated,
  onNeedAuth,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setTitle(refMeta?.title || "");
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError("");
  }, [refMeta?.title]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

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

  const applyFile = (next: File) => {
    setError("");
    setFile(next);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      if (next.type.startsWith("image/")) {
        return URL.createObjectURL(next);
      }
      return null;
    });
  };

  const submit = async () => {
    if (!refKey) return;
    if (!canEdit) {
      onNeedAuth();
      return;
    }
    if (!file) {
      setError(ERR[locale].file_required);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const form = new FormData();
      form.append("ref_key", refKey);
      form.append("file", file);
      if (title.trim()) form.append("title", title.trim());
      if (file.type === "application/pdf") form.append("media_type", "pdf");

      const res = await fetch("/api/jp-vocab/ref/replace", {
        method: "POST",
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        body: form,
      });
      const data = (await res.json()) as {
        ok: boolean;
        ref?: JpVocabRef;
        error?: string;
      };

      if (res.status === 401) {
        onNeedAuth();
        throw new Error(locale === "zh" ? "请登录后再编辑教案。" : "Please log in.");
      }
      if (!data.ok || !data.ref) {
        const msg =
          (data.error && ERR[locale][data.error as keyof (typeof ERR)["zh"]]) ||
          data.error ||
          (locale === "zh" ? "保存失败" : "Save failed");
        throw new Error(msg);
      }

      onUpdated(data.ref);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !mounted || !refKey) return null;

  const currentViewUrl = `/api/jp-vocab/ref/${encodeURIComponent(refKey)}${
    refMeta?.updated_at ? `?v=${encodeURIComponent(refMeta.updated_at)}` : ""
  }`;

  return createPortal(
    <>
      <div
        className="jp-ref-edit-overlay"
        role="presentation"
        onClick={() => {
          if (!submitting) onClose();
        }}
      >
        <div
          className="jp-ref-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-ref-edit-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-ref-edit-header">
            <div>
              <h2 id="jp-ref-edit-title" className="jp-ref-edit-title">
                编辑教案
              </h2>
              <p className="jp-ref-edit-subtitle">
                更换文件后，日语新课与单词复习将共用同一份教案（ref: {refKey}）
              </p>
            </div>
            <button
              type="button"
              className="jp-ref-edit-close"
              onClick={onClose}
              disabled={submitting}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-ref-edit-body">
            <label className="jp-ref-edit-label">
              教案标题（可选）
              <input
                className="jp-ref-edit-input"
                type="text"
                value={title}
                disabled={!canEdit || submitting}
                placeholder="例如：第 2 课语法"
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <div className="jp-ref-edit-current">
              <span className="jp-ref-edit-label-text">当前教案</span>
              <a
                href={currentViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="jp-ref-edit-view-link"
              >
                在新标签页查看
              </a>
            </div>

            <label className="jp-ref-edit-label">
              上传新文件（图片或 PDF）
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                disabled={!canEdit || submitting}
                className="jp-ref-edit-file"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) applyFile(picked);
                }}
              />
            </label>

            {previewUrl ? (
              <img
                src={previewUrl}
                alt="新教案预览"
                className="jp-ref-edit-preview"
              />
            ) : file ? (
              <p className="jp-ref-edit-file-name">已选择：{file.name}</p>
            ) : null}

            {error ? <p className="jp-ref-edit-error">{error}</p> : null}
          </div>

          <div className="jp-ref-edit-footer">
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
                disabled={submitting || !file}
                onClick={() => void submit()}
              >
                {submitting ? "保存中…" : "保存教案"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <style jsx>{`
        .jp-ref-edit-overlay {
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

        .jp-ref-edit-modal {
          display: flex;
          flex-direction: column;
          width: min(480px, 100%);
          max-height: min(88vh, 640px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-ref-edit-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }

        .jp-ref-edit-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-ref-edit-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .jp-ref-edit-close {
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

        .jp-ref-edit-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          padding: 1rem 1.1rem;
        }

        .jp-ref-edit-label {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-ref-edit-input {
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.45rem 0.6rem;
        }

        .jp-ref-edit-current {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          font-size: 0.8125rem;
        }

        .jp-ref-edit-label-text {
          color: var(--muted);
        }

        .jp-ref-edit-view-link {
          color: var(--accent);
          text-decoration: none;
        }

        .jp-ref-edit-view-link:hover {
          text-decoration: underline;
        }

        .jp-ref-edit-file {
          font-size: 0.8125rem;
        }

        .jp-ref-edit-preview {
          max-width: 100%;
          max-height: 12rem;
          object-fit: contain;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
        }

        .jp-ref-edit-file-name {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--text);
        }

        .jp-ref-edit-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
        }

        .jp-ref-edit-footer {
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
