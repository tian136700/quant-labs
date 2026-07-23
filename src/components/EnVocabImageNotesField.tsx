"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  appendEnVocabClassNoteImageLine,
  collectEnVocabClassNoteImageRefKeysFromContent,
  enVocabClassNoteImageRefKeyFromSrc,
  mergeEnVocabClassNoteDraftFromEdit,
  mergeEnVocabClassNotesBlobFromEdit,
  removeEnVocabClassNoteImageAt,
  removeEnVocabClassNotesBlobImageAt,
  splitEnVocabClassNoteDraftForEdit,
  splitEnVocabClassNotesBlobForEdit,
  type EnVocabClassNotesBlobEditImages,
} from "@/lib/en-vocab-class-notes";
import {
  formatUploadBytes,
  uploadFormWithProgress,
  type UploadProgressEvent,
} from "@/lib/upload-form-progress";

type Mode = "plain" | "notes-blob";

type Props = {
  id: string;
  value: string;
  onChange: (next: string) => void;
  locale: "en" | "zh";
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
  /** plain=单段正文（用法）；notes-blob=带时间戳的课堂备注整段 */
  mode?: Mode;
  onNeedAuth?: () => void;
  onError?: (message: string) => void;
  className?: string;
  textareaClassName?: string;
};

function pickClipboardImage(items: DataTransferItemList): File | null {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return null;
}

export function EnVocabImageNotesField({
  id,
  value,
  onChange,
  locale,
  disabled = false,
  rows = 4,
  placeholder,
  mode = "plain",
  onNeedAuth,
  onError,
  className = "",
  textareaClassName = "jp-vocab-edit-textarea jp-vocab-edit-textarea--lg",
}: Props) {
  const valueRef = useRef(value);
  const uploadingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressEvent | null>(
    null
  );
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const blobImagesRef = useRef<EnVocabClassNotesBlobEditImages>({
    byTimestamp: {},
    untimestamped: [],
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!zoomSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomSrc]);

  const { text, imageSrcs } = useMemo(() => {
    if (mode === "notes-blob") {
      const split = splitEnVocabClassNotesBlobForEdit(value);
      blobImagesRef.current = split.images;
      return { text: split.text, imageSrcs: split.imageSrcs };
    }
    return splitEnVocabClassNoteDraftForEdit(value);
  }, [mode, value]);

  const setTextOnly = (nextText: string) => {
    if (mode === "notes-blob") {
      onChange(
        mergeEnVocabClassNotesBlobFromEdit(nextText, blobImagesRef.current)
      );
      return;
    }
    const { imageSrcs: imgs } = splitEnVocabClassNoteDraftForEdit(
      valueRef.current
    );
    onChange(mergeEnVocabClassNoteDraftFromEdit(nextText, imgs));
  };

  const removeImageAt = (index: number) => {
    if (mode === "notes-blob") {
      onChange(removeEnVocabClassNotesBlobImageAt(valueRef.current, index));
      return;
    }
    onChange(removeEnVocabClassNoteImageAt(valueRef.current, index));
  };

  const uploadOne = async (
    file: File
  ): Promise<"ok" | "dup" | "auth" | "fail"> => {
    setUploadProgress({
      phase: "uploading",
      percent: 0,
      loaded: 0,
      total: file.size,
    });
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await uploadFormWithProgress({
        url: "/api/en-vocab/class-notes/upload",
        form,
        headers: { [LOCALE_HEADER]: locale },
        onProgress: setUploadProgress,
      });
      const data = (result.data ?? {}) as {
        ok?: boolean;
        view_path?: string;
        ref_key?: string;
        error?: string;
      };
      if (result.status === 401) {
        onNeedAuth?.();
        return "auth";
      }
      if (!result.ok || !data.ok || !data.view_path) {
        throw new Error(data.error || "图片上传失败");
      }
      const viewPath = data.view_path;
      const refKey =
        (typeof data.ref_key === "string" && data.ref_key.trim()) ||
        enVocabClassNoteImageRefKeyFromSrc(viewPath);
      const existingKeys = collectEnVocabClassNoteImageRefKeysFromContent(
        valueRef.current
      );
      if (refKey && existingKeys.has(refKey)) {
        onError?.(
          "请审核你的图片：内容里已经有一张相同的了，请勿重复粘贴。"
        );
        return "dup";
      }
      setUploadProgress({
        phase: "done",
        percent: 100,
        loaded: file.size,
        total: file.size,
      });
      const next = appendEnVocabClassNoteImageLine(valueRef.current, viewPath);
      valueRef.current = next;
      onChange(next);
      onError?.("");
      return "ok";
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
      return "fail";
    }
  };

  const uploadImages = async (files: File[]) => {
    if (disabled) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      onError?.("仅支持图片文件。");
      return;
    }
    if (uploadingRef.current) {
      onError?.("请等待当前图片上传完成后再传下一张");
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    onError?.("");
    try {
      for (const file of images) {
        const outcome = await uploadOne(file);
        if (outcome === "auth" || outcome === "fail") break;
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <>
      <div
        className={`en-vocab-image-notes ${className}`.trim()}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.currentTarget.classList.add("is-dragover");
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove("is-dragover");
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("is-dragover");
          if (disabled || uploadingRef.current) return;
          const files = Array.from(e.dataTransfer.files || []);
          if (!files.length) return;
          void uploadImages(files);
        }}
      >
        <textarea
          id={id}
          className={textareaClassName}
          rows={rows}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setTextOnly(e.target.value)}
          onPaste={(e) => {
            if (disabled) return;
            const picked = pickClipboardImage(e.clipboardData.items);
            if (!picked) return;
            e.preventDefault();
            void uploadImages([picked]);
          }}
        />

        {imageSrcs.length > 0 ? (
          <div className="en-vocab-image-notes__thumbs" aria-label="已上传图片">
            {imageSrcs.map((src, index) => (
              <div key={`${src}-${index}`} className="en-vocab-image-notes__thumb">
                <button
                  type="button"
                  className="en-vocab-image-notes__thumb-btn"
                  title="点击放大"
                  onClick={() => setZoomSrc(src)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`图片 ${index + 1}`} />
                </button>
                {!disabled ? (
                  <button
                    type="button"
                    className="en-vocab-image-notes__remove"
                    onClick={() => removeImageAt(index)}
                  >
                    移除图片
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {!disabled ? (
          <div className="en-vocab-image-notes__toolbar">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                if (!files.length) return;
                void uploadImages(files);
              }}
            />
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "上传中…" : "上传图片"}
            </button>
            <span className="en-vocab-image-notes__hint">
              可粘贴 / 拖拽图片；图片居中显示，相同内容不重复加入
            </span>
            {uploadProgress && uploadProgress.phase === "uploading" ? (
              <span className="en-vocab-image-notes__progress">
                {formatUploadBytes(uploadProgress.loaded)} /{" "}
                {formatUploadBytes(uploadProgress.total)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {mounted && zoomSrc
        ? createPortal(
            <div
              className="jp-vocab-note-zoom"
              role="dialog"
              aria-modal="true"
              aria-label="图片大图预览"
              onClick={() => setZoomSrc(null)}
            >
              <div className="jp-vocab-note-zoom__bar">
                <span>图片 · 点击空白处或按 Esc 关闭</span>
                <button
                  type="button"
                  className="jp-vocab-note-zoom__close"
                  onClick={() => setZoomSrc(null)}
                  aria-label="关闭大图预览"
                >
                  ×
                </button>
              </div>
              <div className="jp-vocab-note-zoom__stage">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={zoomSrc}
                  alt="图片大图"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>,
            document.body
          )
        : null}

      <style jsx>{`
        .en-vocab-image-notes {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .en-vocab-image-notes.is-dragover {
          outline: 2px dashed color-mix(in srgb, var(--accent) 70%, transparent);
          outline-offset: 2px;
          border-radius: 8px;
        }
        .en-vocab-image-notes__thumbs {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .en-vocab-image-notes__thumb {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
        }
        .en-vocab-image-notes__thumb-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 0.45rem;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          cursor: zoom-in;
        }
        .en-vocab-image-notes__thumb-btn :global(img) {
          display: block;
          max-width: 100%;
          max-height: 220px;
          width: auto;
          height: auto;
          object-fit: contain;
          margin: 0 auto;
        }
        .en-vocab-image-notes__remove {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 0.8125rem;
          cursor: pointer;
          text-decoration: underline;
        }
        .en-vocab-image-notes__toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 0.75rem;
        }
        .en-vocab-image-notes__hint,
        .en-vocab-image-notes__progress {
          font-size: 0.75rem;
          color: var(--muted);
        }
        .jp-vocab-note-zoom {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.9);
        }
        .jp-vocab-note-zoom__bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: var(--muted);
          font-size: 0.8125rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .jp-vocab-note-zoom__close {
          width: 2rem;
          height: 2rem;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          font-size: 1.25rem;
          cursor: pointer;
        }
        .jp-vocab-note-zoom__stage {
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .jp-vocab-note-zoom__stage :global(img) {
          display: block;
          max-width: min(100%, 1200px);
          width: auto;
          height: auto;
          object-fit: contain;
        }
      `}</style>
    </>
  );
}
