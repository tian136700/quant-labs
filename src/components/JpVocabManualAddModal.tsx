"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  jpVocabRefKeyFromBytes,
  sha256HexBytes,
} from "@/lib/jp-vocab-ref-shared";
import type { JpVocabKind, JpVocabRef, JpVocabWord } from "@/lib/types";

type Props = {
  open: boolean;
  locale: "en" | "zh";
  onClose: () => void;
  onAdded: (word: JpVocabWord, ref?: JpVocabRef, refDeduped?: boolean) => void;
};

type ImageState = {
  file: File;
  previewUrl: string;
  hash: string;
  refKey: string;
};

const KIND_OPTIONS: { key: JpVocabKind; label: string }[] = [
  { key: "word", label: "单词" },
  { key: "grammar", label: "语法" },
];

const imageRefCache = new Map<string, string>();
const uploadedImageHashes = new Set<string>();

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

export function JpVocabManualAddModal({
  open,
  locale,
  onClose,
  onAdded,
}: Props) {
  const [kind, setKind] = useState<JpVocabKind>("word");
  const [word, setWord] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [classNotes, setClassNotes] = useState("");
  const [refTitle, setRefTitle] = useState("");
  const [image, setImage] = useState<ImageState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dedupeHint, setDedupeHint] = useState("");
  const [imageZoomOpen, setImageZoomOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetForm = useCallback(() => {
    setKind("word");
    setWord("");
    setReading("");
    setMeaning("");
    setClassNotes("");
    setRefTitle("");
    setImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setError("");
    setDedupeHint("");
    setImageZoomOpen(false);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || submitting) return;
      if (imageZoomOpen) {
        setImageZoomOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose, imageZoomOpen]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const applyImageFile = async (file: File) => {
    setError("");
    try {
      const bytes = await file.arrayBuffer();
      const hash = await sha256HexBytes(bytes);
      const refKey = await jpVocabRefKeyFromBytes(bytes);
      const alreadySeen =
        imageRefCache.has(hash) || uploadedImageHashes.has(hash);
      imageRefCache.set(hash, refKey);

      const previewUrl = URL.createObjectURL(file);
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return { file, previewUrl, hash, refKey };
      });
      setDedupeHint(
        alreadySeen
          ? "检测到相同教案图片，将共用已有链接（不会重复上传）。"
          : ""
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片处理失败");
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const file = pickClipboardImage(e.clipboardData.items);
    if (!file) return;
    e.preventDefault();
    void applyImageFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void applyImageFile(file);
  };

  const submit = async () => {
    if (submitting) return;
    const trimmedWord = word.trim();
    if (!trimmedWord) {
      setError("请填写单词或语法。");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const form = new FormData();
      form.set("word", trimmedWord);
      form.set("kind", kind);
      if (reading.trim()) form.set("reading", reading.trim());
      if (meaning.trim()) form.set("meaning", meaning.trim());
      if (classNotes.trim()) form.set("class_notes", classNotes.trim());
      if (refTitle.trim()) form.set("ref_title", refTitle.trim());

      if (image) {
        if (uploadedImageHashes.has(image.hash)) {
          form.set("ref_key", image.refKey);
        } else {
          form.set("file", image.file);
        }
      }

      const res = await fetch("/api/jp-vocab/add", {
        method: "POST",
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        body: form,
      });

      const data = (await res.json()) as {
        ok: boolean;
        word?: JpVocabWord;
        ref_key?: string | null;
        ref_deduped?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.word) {
        throw new Error(data.error || "添加失败");
      }

      if (data.ref_key && image) {
        imageRefCache.set(image.hash, data.ref_key);
        uploadedImageHashes.add(image.hash);
      }

      const ref: JpVocabRef | undefined =
        data.ref_key != null
          ? {
              ref_key: data.ref_key,
              title: refTitle.trim() || null,
              media_type: "image",
              r2_key: `local:${data.ref_key}`,
              created_at: data.word.created_at,
              updated_at: data.word.updated_at,
            }
          : undefined;

      onAdded(data.word, ref, data.ref_deduped);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div
        className="jp-vocab-add-overlay"
        role="presentation"
        onClick={() => {
          if (!submitting) onClose();
        }}
      >
        <div
          className="jp-vocab-add-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-vocab-add-title"
          onClick={(e) => e.stopPropagation()}
          onPaste={onPaste}
        >
          <div className="jp-vocab-add-header">
            <div className="jp-vocab-add-heading">
              <h2 id="jp-vocab-add-title" className="jp-vocab-add-title">
                手动添加词条
              </h2>
              <p className="jp-vocab-add-subtitle">补充单词或语法，可选关联教案</p>
            </div>
            <button
              type="button"
              className="jp-vocab-add-close"
              onClick={onClose}
              disabled={submitting}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-vocab-add-body">
            <div className="field">
              <span className="jp-vocab-add-field-label">类型</span>
              <div className="jp-vocab-add-segment" role="radiogroup" aria-label="词条类型">
                {KIND_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={kind === opt.key}
                    className={`jp-vocab-add-segment-btn${
                      kind === opt.key ? " is-active" : ""
                    }`}
                    onClick={() => setKind(opt.key)}
                    disabled={submitting}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-add-word">
                {kind === "grammar" ? "语法" : "单词"}
                <span className="etr-required">*</span>
              </label>
              <input
                id="jp-vocab-add-word"
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={kind === "grammar" ? "例如：～ばかり" : "例如：勉強"}
                disabled={submitting}
                autoFocus
              />
            </div>

            {kind === "word" ? (
              <div className="field">
                <label htmlFor="jp-vocab-add-reading">读音（可选）</label>
                <input
                  id="jp-vocab-add-reading"
                  type="text"
                  value={reading}
                  onChange={(e) => setReading(e.target.value)}
                  placeholder="例如：べんきょう"
                  disabled={submitting}
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="jp-vocab-add-meaning">释义</label>
              <input
                id="jp-vocab-add-meaning"
                type="text"
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                placeholder="例如：学习"
                disabled={submitting}
              />
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-add-notes">备注（可选）</label>
              <textarea
                id="jp-vocab-add-notes"
                className="jp-vocab-add-textarea"
                rows={3}
                value={classNotes}
                onChange={(e) => setClassNotes(e.target.value)}
                placeholder="记录例句、用法、易错点…"
                disabled={submitting}
              />
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-add-ref-title">教案标题（可选）</label>
              <input
                id="jp-vocab-add-ref-title"
                type="text"
                value={refTitle}
                onChange={(e) => setRefTitle(e.target.value)}
                placeholder="例如：第 3 课文法"
                disabled={submitting}
              />
            </div>

            <div className="field">
              <span className="jp-vocab-add-field-label">教案图片（可选）</span>
              <div
                ref={dropRef}
                className="jp-vocab-add-drop"
                tabIndex={0}
                onPaste={onPaste}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("is-dragover");
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("is-dragover");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("is-dragover");
                  const file = e.dataTransfer.files[0];
                  if (file?.type.startsWith("image/")) void applyImageFile(file);
                }}
              >
                {image ? (
                  <div className="jp-vocab-add-preview">
                    <button
                      type="button"
                      className="jp-vocab-add-preview-thumb"
                      onClick={() => setImageZoomOpen(true)}
                      disabled={submitting}
                      title="点击放大查看"
                      aria-label="放大查看教案图片"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.previewUrl} alt="教案预览" />
                      <span className="jp-vocab-add-preview-zoom-hint">点击放大</span>
                    </button>
                    <div className="jp-vocab-add-preview-actions">
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                        onClick={() => setImageZoomOpen(true)}
                        disabled={submitting}
                      >
                        放大查看
                      </button>
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact"
                        onClick={() => {
                          setImageZoomOpen(false);
                          setImage((prev) => {
                            if (prev) URL.revokeObjectURL(prev.previewUrl);
                            return null;
                          });
                          setDedupeHint("");
                        }}
                        disabled={submitting}
                      >
                        移除图片
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="jp-vocab-add-drop-hint">
                      点击上传、拖拽图片到此处，或在弹窗内按 Ctrl+V / ⌘V 粘贴截图
                    </p>
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={submitting}
                    >
                      选择图片
                    </button>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onFileChange}
                />
              </div>
              {dedupeHint ? (
                <p className="jp-vocab-add-hint">{dedupeHint}</p>
              ) : null}
            </div>

            {error ? (
              <p className="jp-vocab-add-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="jp-vocab-add-footer">
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? "添加中…" : "添加"}
            </button>
          </div>
        </div>
      </div>

      {image && imageZoomOpen ? (
        <div
          className="jp-vocab-add-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="教案图片大图预览"
          onClick={() => setImageZoomOpen(false)}
        >
          <div className="jp-vocab-add-zoom-bar">
            <span>确认图片是否正确 · 点击空白处或按 Esc 关闭</span>
            <button
              type="button"
              className="jp-vocab-add-close"
              onClick={() => setImageZoomOpen(false)}
              aria-label="关闭大图预览"
            >
              ×
            </button>
          </div>
          <div className="jp-vocab-add-zoom-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.previewUrl}
              alt="教案大图预览"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .jp-vocab-add-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(8, 12, 18, 0.72);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }

        .jp-vocab-add-modal {
          width: min(480px, 100%);
          max-height: min(90vh, 680px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--border) 88%, var(--accent));
          background: linear-gradient(
            165deg,
            color-mix(in srgb, var(--panel) 92%, var(--accent)) 0%,
            var(--panel) 42%,
            color-mix(in srgb, var(--panel) 96%, var(--bg)) 100%
          );
          box-shadow:
            0 28px 64px rgba(0, 0, 0, 0.48),
            0 0 0 1px rgba(255, 255, 255, 0.04) inset;
        }

        .jp-vocab-add-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }

        .jp-vocab-add-heading {
          min-width: 0;
        }

        .jp-vocab-add-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
          color: var(--text);
          letter-spacing: 0.01em;
        }

        .jp-vocab-add-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .jp-vocab-add-close {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          margin: 0;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
          transition:
            color 0.15s ease,
            border-color 0.15s ease,
            background 0.15s ease;
        }

        .jp-vocab-add-close:hover:not(:disabled) {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--bg));
        }

        .jp-vocab-add-close:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-vocab-add-body {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          padding: 1rem 1.1rem;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }

        .jp-vocab-add-body::-webkit-scrollbar {
          width: 8px;
        }

        .jp-vocab-add-body::-webkit-scrollbar-track {
          background: transparent;
        }

        .jp-vocab-add-body::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 999px;
        }

        .jp-vocab-add-modal .field {
          min-width: 0;
        }

        .jp-vocab-add-modal .field label,
        .jp-vocab-add-field-label {
          display: block;
          margin-bottom: 0.35rem;
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.35;
        }

        .jp-vocab-add-modal .field input[type="text"] {
          width: 100%;
          box-sizing: border-box;
          margin: 0;
          background: var(--bg);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          min-height: 2.75rem;
          color-scheme: dark;
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease,
            background 0.15s ease;
        }

        .jp-vocab-add-modal .field input[type="text"]::placeholder {
          color: color-mix(in srgb, var(--muted) 72%, transparent);
        }

        .jp-vocab-add-modal .field input[type="text"]:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
        }

        .jp-vocab-add-modal .field input[type="text"]:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
        }

        .jp-vocab-add-modal .field input[type="text"]:disabled {
          opacity: 0.58;
          cursor: not-allowed;
        }

        .jp-vocab-add-modal .field textarea.jp-vocab-add-textarea {
          width: 100%;
          box-sizing: border-box;
          margin: 0;
          background: var(--bg);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.55rem 0.75rem;
          font: inherit;
          font-size: 0.875rem;
          line-height: 1.45;
          min-height: 4.5rem;
          resize: vertical;
          color-scheme: dark;
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease,
            background 0.15s ease;
        }

        .jp-vocab-add-modal .field textarea.jp-vocab-add-textarea::placeholder {
          color: color-mix(in srgb, var(--muted) 72%, transparent);
        }

        .jp-vocab-add-modal .field textarea.jp-vocab-add-textarea:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
        }

        .jp-vocab-add-modal .field textarea.jp-vocab-add-textarea:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
        }

        .jp-vocab-add-modal .field textarea.jp-vocab-add-textarea:disabled {
          opacity: 0.58;
          cursor: not-allowed;
        }

        .jp-vocab-add-modal .field input[type="text"]:-webkit-autofill,
        .jp-vocab-add-modal .field input[type="text"]:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--text);
          -webkit-box-shadow: 0 0 0 1000px var(--bg) inset;
          box-shadow: 0 0 0 1000px var(--bg) inset;
          transition: background-color 9999s ease-out 0s;
        }

        .jp-vocab-add-segment {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 0.2rem;
          padding: 0.2rem;
          border-radius: 9px;
          border: 1px solid var(--border);
          background: var(--bg);
        }

        .jp-vocab-add-segment-btn {
          border: none;
          border-radius: 7px;
          background: transparent;
          color: var(--muted);
          padding: 0.45rem 1.05rem;
          font-size: 0.8125rem;
          line-height: 1.3;
          cursor: pointer;
          transition:
            color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }

        .jp-vocab-add-segment-btn:hover:not(:disabled):not(.is-active) {
          color: var(--text);
          background: color-mix(in srgb, var(--panel) 70%, var(--bg));
        }

        .jp-vocab-add-segment-btn.is-active {
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
        }

        .jp-vocab-add-segment-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-vocab-add-drop {
          border: 1px dashed color-mix(in srgb, var(--border) 88%, var(--accent));
          border-radius: 10px;
          padding: 0.9rem;
          text-align: center;
          background: color-mix(in srgb, var(--bg) 72%, var(--panel));
          outline: none;
          transition:
            border-color 0.15s ease,
            background 0.15s ease;
        }

        .jp-vocab-add-drop:focus-visible {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
        }

        .jp-vocab-add-drop.is-dragover {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }

        .jp-vocab-add-drop-hint {
          margin: 0 0 0.65rem;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .jp-vocab-add-preview-thumb {
          position: relative;
          display: block;
          width: 100%;
          margin: 0 0 0.65rem;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg);
          cursor: zoom-in;
          overflow: hidden;
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease;
        }

        .jp-vocab-add-preview-thumb:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
        }

        .jp-vocab-add-preview-thumb:disabled {
          opacity: 0.58;
          cursor: not-allowed;
        }

        .jp-vocab-add-preview-thumb img {
          display: block;
          width: 100%;
          max-height: 220px;
          object-fit: contain;
          background: color-mix(in srgb, var(--bg) 80%, #000);
        }

        .jp-vocab-add-preview-zoom-hint {
          position: absolute;
          right: 0.55rem;
          bottom: 0.55rem;
          padding: 0.2rem 0.45rem;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.62);
          color: #fff;
          font-size: 0.75rem;
          line-height: 1.3;
          pointer-events: none;
        }

        .jp-vocab-add-preview-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: center;
        }

        .jp-vocab-add-zoom {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .jp-vocab-add-zoom-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: var(--muted);
          font-size: 0.8125rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .jp-vocab-add-zoom-stage {
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 1rem;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
        }

        .jp-vocab-add-zoom-stage::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        .jp-vocab-add-zoom-stage::-webkit-scrollbar-track {
          background: transparent;
        }

        .jp-vocab-add-zoom-stage::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.18);
          border-radius: 999px;
        }

        .jp-vocab-add-zoom-stage img {
          display: block;
          width: auto;
          max-width: min(96vw, 1400px);
          height: auto;
          border-radius: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        }

        .jp-vocab-add-hint {
          margin: 0.4rem 0 0;
          font-size: 0.8125rem;
          color: var(--accent);
          line-height: 1.4;
        }

        .jp-vocab-add-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
          line-height: 1.4;
        }

        .jp-vocab-add-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.55rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--bg) 38%, var(--panel));
        }

        .jp-vocab-add-footer .btn-rsi-filter {
          min-width: 5.5rem;
        }

        @media (max-width: 480px) {
          .jp-vocab-add-overlay {
            padding: 0.65rem;
            align-items: flex-end;
          }

          .jp-vocab-add-modal {
            max-height: 92vh;
            border-bottom-left-radius: 10px;
            border-bottom-right-radius: 10px;
          }

          .jp-vocab-add-segment {
            display: flex;
            width: 100%;
          }

          .jp-vocab-add-segment-btn {
            flex: 1;
          }

          .jp-vocab-add-footer .btn-rsi-filter {
            flex: 1;
          }
        }
      `}</style>
    </>,
    document.body
  );
}
