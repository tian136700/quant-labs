"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { uploadFormWithProgress } from "@/lib/upload-form-progress";
import type { JpLessonRecord, JpVocabRef } from "@/lib/types";

type Props = {
  open: boolean;
  lessonId: number | null;
  refKey: string | null;
  refMeta?: JpVocabRef;
  locale: "en" | "zh";
  canEdit: boolean;
  onClose: () => void;
  onUpdated: (ref: JpVocabRef, lesson: JpLessonRecord) => void;
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function JpVocabRefEditModal({
  open,
  lessonId,
  refKey,
  refMeta,
  locale,
  canEdit,
  onClose,
  onUpdated,
  onNeedAuth,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const resetForm = useCallback(() => {
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUploadProgress(0);
    setUploadPhase("");
    setError("");
  }, []);

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

  const clearFile = () => {
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = async () => {
    if (!lessonId) return;
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
    setUploadProgress(0);
    setUploadPhase("准备上传…");

    try {
      const form = new FormData();
      form.append("lesson_id", String(lessonId));
      form.append("file", file);
      if (file.type === "application/pdf") form.append("media_type", "pdf");

      const result = await uploadFormWithProgress({
        url: "/api/jp-lesson/ref/replace",
        form,
        headers: { [LOCALE_HEADER]: locale },
        onProgress: (pct) => {
          setUploadProgress(pct);
          setUploadPhase(`正在上传 ${pct}%`);
        },
      });

      setUploadProgress(100);
      setUploadPhase("服务器处理中…");

      const data = result.data as {
        ok?: boolean;
        ref?: JpVocabRef;
        lesson?: JpLessonRecord;
        error?: string;
      };

      if (result.status === 401) {
        onNeedAuth();
        throw new Error(locale === "zh" ? "请登录后再编辑教案。" : "Please log in.");
      }
      if (!result.ok || !data.ok || !data.ref || !data.lesson) {
        const msg =
          (data.error && ERR[locale][data.error as keyof (typeof ERR)["zh"]]) ||
          data.error ||
          (locale === "zh" ? "保存失败" : "Save failed");
        throw new Error(msg);
      }

      setUploadPhase("上传完成");
      onUpdated(data.ref, data.lesson);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setUploadPhase("");
      setUploadProgress(0);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !mounted || !lessonId) return null;

  const currentViewUrl = refKey
    ? `/api/jp-vocab/ref/${encodeURIComponent(refKey)}${
        refMeta?.updated_at ? `?v=${encodeURIComponent(refMeta.updated_at)}` : ""
      }`
    : "";

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
                教案仅绑定本条新课（ID {lessonId}），不会影响其他记录
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
            <div className="jp-ref-edit-current">
              <span className="jp-ref-edit-label-text">当前教案</span>
              {refKey ? (
                <a
                  href={currentViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="jp-ref-edit-view-link"
                >
                  在新标签页查看
                </a>
              ) : (
                <span className="jp-ref-edit-muted">尚未上传</span>
              )}
            </div>

            <div className="jp-ref-edit-field">
              <span className="jp-ref-edit-label-text">上传新文件</span>
              <div
                ref={dropRef}
                className={`jp-ref-edit-drop${file ? " has-file" : ""}${
                  submitting ? " is-disabled" : ""
                }`}
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!submitting) e.currentTarget.classList.add("is-dragover");
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("is-dragover");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("is-dragover");
                  if (submitting) return;
                  const picked = e.dataTransfer.files[0];
                  if (picked) applyFile(picked);
                }}
              >
                {file ? (
                  <div className="jp-ref-edit-picked">
                    {previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={previewUrl} alt="新教案预览" className="jp-ref-edit-preview" />
                    ) : (
                      <div className="jp-ref-edit-pdf-icon" aria-hidden>
                        PDF
                      </div>
                    )}
                    <div className="jp-ref-edit-picked-meta">
                      <span className="jp-ref-edit-picked-name">{file.name}</span>
                      <span className="jp-ref-edit-picked-size">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    {!submitting ? (
                      <button
                        type="button"
                        className="jp-ref-edit-remove"
                        onClick={clearFile}
                      >
                        移除
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="jp-ref-edit-drop-icon" aria-hidden>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <p className="jp-ref-edit-drop-title">拖拽图片或 PDF 到此处</p>
                    <p className="jp-ref-edit-drop-hint">支持 PNG / JPG / PDF，最大 20MB</p>
                    {canEdit ? (
                      <button
                        type="button"
                        className="jp-ref-edit-pick-btn"
                        disabled={submitting}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        选择文件
                      </button>
                    ) : null}
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  hidden
                  disabled={!canEdit || submitting}
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked) applyFile(picked);
                  }}
                />
              </div>
            </div>

            {submitting ? (
              <div className="jp-ref-edit-progress" aria-live="polite">
                <div className="jp-ref-edit-progress-head">
                  <span>{uploadPhase || "上传中…"}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="jp-ref-edit-progress-track">
                  <div
                    className="jp-ref-edit-progress-bar"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
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
                {submitting ? "上传中…" : "保存教案"}
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
          width: min(520px, 100%);
          max-height: min(88vh, 680px);
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

        .jp-ref-edit-field {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .jp-ref-edit-label-text {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-ref-edit-muted {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-ref-edit-current {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          font-size: 0.8125rem;
        }

        .jp-ref-edit-view-link {
          color: var(--accent);
          text-decoration: none;
        }

        .jp-ref-edit-view-link:hover {
          text-decoration: underline;
        }

        .jp-ref-edit-drop {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 9.5rem;
          padding: 1rem;
          border: 1.5px dashed color-mix(in srgb, var(--border) 90%, var(--accent));
          border-radius: 10px;
          background:
            radial-gradient(
              circle at top,
              color-mix(in srgb, var(--accent) 8%, transparent),
              transparent 55%
            ),
            color-mix(in srgb, var(--bg) 70%, var(--panel));
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }

        .jp-ref-edit-drop.is-dragover,
        .jp-ref-edit-drop:focus-visible {
          border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
        }

        .jp-ref-edit-drop.has-file {
          align-items: stretch;
          min-height: 0;
        }

        .jp-ref-edit-drop.is-disabled {
          opacity: 0.72;
          pointer-events: none;
        }

        .jp-ref-edit-drop-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 3rem;
          height: 3rem;
          border-radius: 999px;
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 12%, transparent);
        }

        .jp-ref-edit-drop-title {
          margin: 0;
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text);
        }

        .jp-ref-edit-drop-hint {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-ref-edit-pick-btn {
          margin-top: 0.25rem;
          min-height: 2.25rem;
          padding: 0.35rem 1rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
          font: inherit;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
        }

        .jp-ref-edit-pick-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 22%, var(--panel));
        }

        .jp-ref-edit-picked {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .jp-ref-edit-preview {
          width: 4.5rem;
          height: 4.5rem;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          flex-shrink: 0;
        }

        .jp-ref-edit-pdf-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 4.5rem;
          height: 4.5rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--rise) 12%, var(--panel));
          color: var(--rise);
          font-size: 0.75rem;
          font-weight: 700;
          flex-shrink: 0;
        }

        .jp-ref-edit-picked-meta {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .jp-ref-edit-picked-name {
          font-size: 0.875rem;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .jp-ref-edit-picked-size {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-ref-edit-remove {
          flex-shrink: 0;
          min-height: 2rem;
          padding: 0.25rem 0.65rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--muted);
          font: inherit;
          font-size: 0.8125rem;
          cursor: pointer;
        }

        .jp-ref-edit-progress {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .jp-ref-edit-progress-head {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-ref-edit-progress-track {
          height: 0.45rem;
          border-radius: 999px;
          overflow: hidden;
          background: color-mix(in srgb, var(--border) 70%, transparent);
        }

        .jp-ref-edit-progress-bar {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--accent) 85%, white),
            var(--accent)
          );
          transition: width 0.15s ease;
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
