"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { uploadFormWithProgress, formatUploadBytes, type UploadProgressEvent } from "@/lib/upload-form-progress";
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
  return formatUploadBytes(bytes);
}

function pickClipboardImage(items: DataTransferItemList): File | null {
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        const ext = item.type.split("/")[1] || "png";
        return new File([blob], `pasted.${ext}`, { type: item.type });
      }
    }
  }
  return null;
}

function uploadProgressLabel(event: UploadProgressEvent): string {
  if (event.phase === "processing") {
    return "文件已传完，服务器保存中…";
  }
  if (event.phase === "done") {
    return "上传完成";
  }
  if (event.total > 0) {
    return `正在上传 ${formatUploadBytes(event.loaded)} / ${formatUploadBytes(event.total)}`;
  }
  if (event.loaded > 0) {
    return `正在上传 ${formatUploadBytes(event.loaded)}…`;
  }
  return "准备上传…";
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
  const [uploadProgress, setUploadProgress] = useState<UploadProgressEvent | null>(null);
  const [zoomTarget, setZoomTarget] = useState<"current" | "new" | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const resetForm = useCallback(() => {
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUploadProgress(null);
    setZoomTarget(null);
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
      if (zoomTarget) {
        setZoomTarget(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose, zoomTarget]);

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
    setZoomTarget(null);
    setFile(next);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      if (next.type.startsWith("image/") || next.type === "application/pdf") {
        return URL.createObjectURL(next);
      }
      return null;
    });
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (submitting || !canEdit) return;
    const picked = pickClipboardImage(e.clipboardData.items);
    if (!picked) return;
    e.preventDefault();
    applyFile(picked);
  };

  const openFilePreview = () => {
    if (!file || !previewUrl) return;
    if (file.type.startsWith("image/")) {
      setZoomTarget("new");
      return;
    }
    if (file.type === "application/pdf") {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    }
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
    setUploadProgress({ phase: "uploading", percent: 0, loaded: 0, total: file.size });

    try {
      const form = new FormData();
      form.append("lesson_id", String(lessonId));
      form.append("file", file);
      if (file.type === "application/pdf") form.append("media_type", "pdf");

      const result = await uploadFormWithProgress({
        url: "/api/jp-lesson/ref/replace",
        form,
        headers: { [LOCALE_HEADER]: locale },
        onProgress: setUploadProgress,
      });

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

      setUploadProgress({ phase: "done", percent: 100, loaded: file.size, total: file.size });
      onUpdated(data.ref, data.lesson);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setUploadProgress(null);
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

  const currentIsPdf = refMeta?.media_type === "pdf";
  const hasCurrentRef = Boolean(refKey);
  const zoomUrl =
    zoomTarget === "current"
      ? currentViewUrl
      : zoomTarget === "new"
        ? previewUrl
        : null;
  const zoomHint =
    zoomTarget === "current"
      ? "当前教案 · 点击空白处或按 Esc 关闭"
      : "确认新图片是否正确 · 点击空白处或按 Esc 关闭";

  const openCurrentPreview = () => {
    if (!refKey || !currentViewUrl) return;
    if (currentIsPdf) {
      window.open(currentViewUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setZoomTarget("current");
  };

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
          onPaste={onPaste}
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
            <div className="jp-ref-edit-current-block">
              <div className="jp-ref-edit-current-head">
                <span className="jp-ref-edit-label-text">当前教案</span>
                {hasCurrentRef ? (
                  <a
                    href={currentViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jp-ref-edit-view-link"
                  >
                    新标签页打开
                  </a>
                ) : null}
              </div>

              {hasCurrentRef ? (
                currentIsPdf ? (
                  <button
                    type="button"
                    className="jp-ref-edit-current-card jp-ref-edit-current-card--pdf"
                    disabled={submitting}
                    onClick={() => openCurrentPreview()}
                  >
                    <span className="jp-ref-edit-current-pdf-badge">PDF</span>
                    <span className="jp-ref-edit-current-card-title">当前 PDF 教案</span>
                    <span className="jp-ref-edit-current-card-hint">点击预览</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="jp-ref-edit-current-card"
                    disabled={submitting}
                    title="点击放大预览当前教案"
                    onClick={() => openCurrentPreview()}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentViewUrl}
                      alt="当前教案预览"
                      className="jp-ref-edit-current-img"
                    />
                    <span className="jp-ref-edit-current-overlay">点击放大预览</span>
                  </button>
                )
              ) : (
                <div className="jp-ref-edit-current-empty">尚未上传教案</div>
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
                onPaste={onPaste}
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
                    {previewUrl && file.type.startsWith("image/") ? (
                      <button
                        type="button"
                        className="jp-ref-edit-preview-btn"
                        disabled={submitting}
                        title="点击放大预览"
                        aria-label="放大预览所选图片"
                        onClick={() => setZoomTarget("new")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrl} alt="新教案预览" className="jp-ref-edit-preview" />
                        <span className="jp-ref-edit-preview-hint">点击放大</span>
                      </button>
                    ) : previewUrl && file.type === "application/pdf" ? (
                      <button
                        type="button"
                        className="jp-ref-edit-pdf-icon jp-ref-edit-pdf-btn"
                        disabled={submitting}
                        title="在新标签页预览 PDF"
                        onClick={() => openFilePreview()}
                      >
                        PDF
                      </button>
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
                      {!submitting && previewUrl ? (
                        <button
                          type="button"
                          className="jp-ref-edit-preview-link"
                          onClick={() => openFilePreview()}
                        >
                          {file.type.startsWith("image/") ? "放大预览" : "预览 PDF"}
                        </button>
                      ) : null}
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
                    <p className="jp-ref-edit-drop-title">拖拽、粘贴或选择图片 / PDF</p>
                    <p className="jp-ref-edit-drop-hint">
                      支持 PNG / JPG / PDF，最大 20MB；弹窗内可按 Ctrl+V / ⌘V 粘贴截图
                    </p>
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

            {submitting && uploadProgress ? (
              <div className="jp-ref-edit-progress" aria-live="polite">
                <div className="jp-ref-edit-progress-head">
                  <span>{uploadProgressLabel(uploadProgress)}</span>
                  <span>
                    {uploadProgress.phase === "uploading" && uploadProgress.total > 0
                      ? `${uploadProgress.percent}%`
                      : uploadProgress.phase === "processing"
                        ? "处理中"
                        : "100%"}
                  </span>
                </div>
                <div
                  className={`jp-ref-edit-progress-track${
                    uploadProgress.phase === "processing" ? " is-processing" : ""
                  }`}
                >
                  <div
                    className="jp-ref-edit-progress-bar"
                    style={{
                      width:
                        uploadProgress.phase === "processing"
                          ? "100%"
                          : `${uploadProgress.percent}%`,
                    }}
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

      {zoomTarget &&
      zoomUrl &&
      (zoomTarget === "new" ? file?.type.startsWith("image/") : !currentIsPdf) ? (
        <div
          className="jp-ref-edit-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="教案大图预览"
          onClick={() => setZoomTarget(null)}
        >
          <div className="jp-ref-edit-zoom-bar">
            <span>{zoomHint}</span>
            <button
              type="button"
              className="jp-ref-edit-close"
              onClick={() => setZoomTarget(null)}
              aria-label="关闭大图预览"
            >
              ×
            </button>
          </div>
          <div className="jp-ref-edit-zoom-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomUrl}
              alt="教案大图预览"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}

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

        .jp-ref-edit-current-block {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .jp-ref-edit-current-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .jp-ref-edit-current-card {
          position: relative;
          display: block;
          width: 100%;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg);
          cursor: pointer;
          overflow: hidden;
          text-align: left;
        }

        .jp-ref-edit-current-card:disabled {
          cursor: not-allowed;
          opacity: 0.72;
        }

        .jp-ref-edit-current-card:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
        }

        .jp-ref-edit-current-img {
          display: block;
          width: 100%;
          max-height: 11rem;
          object-fit: contain;
          background: color-mix(in srgb, var(--bg) 88%, var(--panel));
        }

        .jp-ref-edit-current-overlay {
          display: block;
          padding: 0.45rem 0.65rem;
          font-size: 0.75rem;
          color: var(--muted);
          text-align: center;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--panel) 92%, transparent);
        }

        .jp-ref-edit-current-card--pdf {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          min-height: 7rem;
          padding: 1rem;
        }

        .jp-ref-edit-current-pdf-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 3rem;
          padding: 0.35rem 0.55rem;
          border-radius: 6px;
          background: color-mix(in srgb, var(--rise) 14%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
          font-weight: 700;
        }

        .jp-ref-edit-current-card-title {
          font-size: 0.875rem;
          color: var(--text);
        }

        .jp-ref-edit-current-card-hint {
          font-size: 0.75rem;
          color: var(--accent);
        }

        .jp-ref-edit-current-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 5.5rem;
          border: 1px dashed var(--border);
          border-radius: 10px;
          color: var(--muted);
          font-size: 0.8125rem;
          background: color-mix(in srgb, var(--bg) 70%, var(--panel));
        }

        .jp-ref-edit-muted {
          font-size: 0.8125rem;
          color: var(--muted);
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

        .jp-ref-edit-preview-btn {
          position: relative;
          flex-shrink: 0;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
          border-radius: 8px;
          overflow: hidden;
        }

        .jp-ref-edit-preview-btn:disabled {
          cursor: not-allowed;
        }

        .jp-ref-edit-preview {
          display: block;
          width: 4.5rem;
          height: 4.5rem;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
        }

        .jp-ref-edit-preview-hint {
          position: absolute;
          inset: auto 0 0 0;
          padding: 0.15rem 0.25rem;
          font-size: 0.625rem;
          line-height: 1.2;
          text-align: center;
          color: #fff;
          background: rgba(0, 0, 0, 0.55);
        }

        .jp-ref-edit-preview-btn:hover .jp-ref-edit-preview {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        }

        .jp-ref-edit-pdf-btn {
          cursor: pointer;
          font: inherit;
        }

        .jp-ref-edit-pdf-btn:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        }

        .jp-ref-edit-preview-link {
          align-self: flex-start;
          margin-top: 0.15rem;
          padding: 0;
          border: none;
          background: none;
          color: var(--accent);
          font: inherit;
          font-size: 0.75rem;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
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
          position: relative;
          height: 0.45rem;
          border-radius: 999px;
          overflow: hidden;
          background: color-mix(in srgb, var(--border) 70%, transparent);
        }

        .jp-ref-edit-progress-track.is-processing .jp-ref-edit-progress-bar {
          position: absolute;
          left: 0;
          top: 0;
          width: 35% !important;
          animation: jp-ref-upload-indeterminate 1.1s ease-in-out infinite;
        }

        @keyframes jp-ref-upload-indeterminate {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(320%);
          }
        }

        .jp-ref-edit-progress-bar {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--accent) 85%, white),
            var(--accent)
          );
          transition: width 0.08s linear;
        }

        .jp-ref-edit-zoom {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          flex-direction: column;
          background: rgba(8, 12, 18, 0.88);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }

        .jp-ref-edit-zoom-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: var(--muted);
          font-size: 0.8125rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
        }

        .jp-ref-edit-zoom-stage {
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          overflow: auto;
        }

        .jp-ref-edit-zoom-stage :global(img) {
          max-width: min(96vw, 1200px);
          max-height: calc(100vh - 4rem);
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
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
