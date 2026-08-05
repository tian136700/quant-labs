"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import {
  EN_VOCAB_CATEGORY_PRESETS,
  EN_VOCAB_DEFAULT_CATEGORY,
} from "@/lib/en-vocab-category";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import type { EnLessonKind, EnLessonRecord } from "@/lib/types";

const CATEGORY_OPTIONS = [...EN_VOCAB_CATEGORY_PRESETS, "托业"] as const;

type Props = {
  open: boolean;
  locale: string;
  onClose: () => void;
  onCreated: (lesson: EnLessonRecord) => void;
  onNeedLogin?: () => void;
};

function errorMessage(code: string | undefined): string {
  switch (code) {
    case "content_required":
    case "content_empty":
      return "请填写学习内容";
    case "content_duplicate":
      return "相同类型与内容的新课已存在";
    case "File too large (max 20MB)":
      return "文件过大（最大 20MB）";
    default:
      return code || "新增失败";
  }
}

export function EnLessonCreateModal({
  open,
  locale,
  onClose,
  onCreated,
  onNeedLogin,
}: Props) {
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [kind, setKind] = useState<EnLessonKind>("word");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>(EN_VOCAB_DEFAULT_CATEGORY);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const saveProgress = useSaveProgressBar(saving);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setKind("word");
    setContent("");
    setCategory(EN_VOCAB_DEFAULT_CATEGORY);
    setTitle("");
    setFile(null);
    setPreviewUrl(null);
    setFormError("");
    setSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!mounted || !open) return null;

  const contentHint =
    kind === "grammar"
      ? "语法可用中文名，如「定语从句」；多项用逗号分隔。"
      : "英文单词/词组用逗号分隔，如 certain, look forward to。";

  const handleFileChange = (next: FileList | null) => {
    const f = next?.[0] ?? null;
    setFile(f && f.size > 0 ? f : null);
  };

  const handleSave = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setFormError("请填写学习内容");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("content", trimmed);
      form.set("category", category);
      if (title.trim()) form.set("title", title.trim());
      if (file) {
        form.set("file", file);
        form.set(
          "media_type",
          file.type === "application/pdf" ? "pdf" : "image"
        );
      }

      const res = await fetch("/api/en-lesson/create", {
        method: "POST",
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        body: form,
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        lesson?: EnLessonRecord;
      };

      if (res.status === 401) {
        onNeedLogin?.();
        setFormError(errorMessage(data.error));
        return;
      }
      if (!data.ok || !data.lesson) {
        setFormError(errorMessage(data.error));
        return;
      }

      onCreated(data.lesson);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "新增失败");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="en-lesson-create-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="en-lesson-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="en-lesson-create-header">
          <h2 id={titleId} className="en-lesson-create-title">
            新增英语新课
          </h2>
          <button
            type="button"
            className="en-lesson-create-close"
            aria-label="关闭"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="en-lesson-create-body">
          <fieldset className="en-lesson-create-fieldset" disabled={saving}>
            <legend>类型</legend>
            <div className="en-lesson-create-kind-row" role="radiogroup" aria-label="学习类型">
              <label className="en-lesson-create-kind">
                <input
                  type="radio"
                  name="en-lesson-create-kind"
                  value="word"
                  checked={kind === "word"}
                  onChange={() => setKind("word")}
                />
                单词
              </label>
              <label className="en-lesson-create-kind">
                <input
                  type="radio"
                  name="en-lesson-create-kind"
                  value="grammar"
                  checked={kind === "grammar"}
                  onChange={() => setKind("grammar")}
                />
                语法
              </label>
            </div>
          </fieldset>

          <fieldset className="en-lesson-create-fieldset" disabled={saving}>
            <legend>学习内容</legend>
            <textarea
              className="en-lesson-create-textarea"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                kind === "grammar"
                  ? "例如：定语从句, 状语从句"
                  : "例如：certain, forward, look forward to"
              }
              aria-describedby="en-lesson-create-content-hint"
            />
            <p id="en-lesson-create-content-hint" className="en-lesson-create-hint">
              {contentHint}
            </p>
          </fieldset>

          <fieldset className="en-lesson-create-fieldset" disabled={saving}>
            <legend>分类</legend>
            <select
              className="en-lesson-create-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset className="en-lesson-create-fieldset" disabled={saving}>
            <legend>标题（可选）</legend>
            <input
              type="text"
              className="en-lesson-create-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="教案标题，可留空"
            />
          </fieldset>

          <fieldset className="en-lesson-create-fieldset" disabled={saving}>
            <legend>教案图片 / PDF（可选）</legend>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              className="en-lesson-create-file"
              onChange={(e) => handleFileChange(e.target.files)}
            />
            {file ? (
              <p className="en-lesson-create-file-name">
                已选：{file.name}
                <button
                  type="button"
                  className="en-lesson-create-file-clear"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  清除
                </button>
              </p>
            ) : null}
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="教案预览"
                className="en-lesson-create-preview"
              />
            ) : null}
          </fieldset>

          {formError ? (
            <p className="en-lesson-create-error" role="alert">
              {formError}
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

        <div className="en-lesson-create-actions">
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn jp-lesson-action-btn--primary"
            disabled={saving}
            onClick={() => {
              void handleSave();
            }}
          >
            保存
          </button>
        </div>
      </div>

      <style jsx>{`
        .en-lesson-create-overlay {
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
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        .en-lesson-create-modal {
          display: flex;
          flex-direction: column;
          width: min(100%, 520px);
          max-height: min(calc(100dvh - 2rem), 900px);
          overflow: hidden;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--panel);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        }

        .en-lesson-create-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-shrink: 0;
          padding: 0.9rem 1rem 0.65rem;
          border-bottom: 1px solid var(--border);
        }

        .en-lesson-create-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
        }

        .en-lesson-create-close {
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

        .en-lesson-create-body {
          flex: 1;
          overflow-y: auto;
          padding: 0.85rem 1rem 0.5rem;
          -webkit-overflow-scrolling: touch;
        }

        .en-lesson-create-fieldset {
          margin: 0 0 0.85rem;
          padding: 0;
          border: none;
        }

        .en-lesson-create-fieldset legend {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-bottom: 0.4rem;
        }

        .en-lesson-create-kind-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.85rem 1.25rem;
        }

        .en-lesson-create-kind {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.9375rem;
          cursor: pointer;
        }

        .en-lesson-create-textarea,
        .en-lesson-create-input,
        .en-lesson-create-select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 40%, var(--panel));
          color: var(--text);
          padding: 0.55rem 0.65rem;
          font-size: 0.9375rem;
          font-family: inherit;
        }

        .en-lesson-create-textarea {
          resize: vertical;
          min-height: 5.5rem;
          line-height: 1.45;
        }

        .en-lesson-create-hint {
          margin: 0.4rem 0 0;
          font-size: 0.78125rem;
          color: var(--muted);
          line-height: 1.4;
        }

        .en-lesson-create-file {
          width: 100%;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .en-lesson-create-file-name {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }

        .en-lesson-create-file-clear {
          border: none;
          background: transparent;
          color: var(--accent);
          font-size: 0.8125rem;
          cursor: pointer;
          padding: 0;
        }

        .en-lesson-create-preview {
          display: block;
          margin-top: 0.55rem;
          max-width: 100%;
          max-height: 180px;
          object-fit: contain;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
        }

        .en-lesson-create-error {
          margin: 0 0 0.65rem;
          font-size: 0.875rem;
          color: var(--rise);
        }

        .en-lesson-create-actions {
          flex-shrink: 0;
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.75rem 1rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
        }

        @media (max-width: 767px) {
          .en-lesson-create-overlay {
            align-items: flex-end;
            padding: 0;
          }

          .en-lesson-create-modal {
            width: 100%;
            max-height: min(92dvh, 900px);
            border-radius: 14px 14px 0 0;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
