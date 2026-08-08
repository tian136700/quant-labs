"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CopyToast } from "@/components/CopyToast";
import { useJpLessonAiPlanPromptTemplate } from "@/hooks/useJpLessonAiPlanPromptTemplate";
import { copyTextToClipboard } from "@/lib/copy-text";
import { buildJpLessonAiPlanCopyText } from "@/lib/jp-lesson-ai-plan-prompt";
import { afterJpLessonAiPlanPromptCopySuccess } from "@/lib/jp-lesson-ai-plan-prompt-bark-client";
import { jpLessonKindLabel } from "@/lib/jp-lesson-shared";
import type { JpLessonRecord } from "@/lib/types";

export type JpLessonContentEditAiPlanSectionHandle = {
  getPendingImageFile: () => File | null;
  clearPendingImage: () => void;
  flushPrompt: () => void;
};

type Props = {
  open: boolean;
  lesson: JpLessonRecord;
  /** 当前编辑行里的学习内容（未保存也按屏上词复制） */
  words: string[];
  /** 与 words 对齐的释义 */
  meanings?: Array<string | null | undefined>;
  disabled?: boolean;
  /** 本课已挂教案时的预览 URL（jpVocabRefApiPath） */
  attachedPreviewUrl?: string | null;
  attachedIsPdf?: boolean;
};

/**
 * 「编辑学习内容」弹窗内：左 AI 提示词 / 右粘贴教案图；图可点放大预览。
 * 挂图由弹窗底栏「保存」统一提交（postJpLessonRefAttachBatch），此处只预览待挂文件。
 */
export const JpLessonContentEditAiPlanSection = forwardRef<
  JpLessonContentEditAiPlanSectionHandle,
  Props
>(function JpLessonContentEditAiPlanSection(
  {
    open,
    lesson,
    words,
    meanings,
    disabled = false,
    attachedPreviewUrl = null,
    attachedIsPdf = false,
  },
  ref
) {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<File | null>(null);
  const busy = disabled;
  const { prompt, setPrompt, flushPrompt, saveHint } =
    useJpLessonAiPlanPromptTemplate(open);

  const setImageFromFile = (file: File | null) => {
    imageFileRef.current = file;
    setImageFile(file);
    setZoomOpen(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setLocalError(null);
  };

  useImperativeHandle(
    ref,
    () => ({
      getPendingImageFile: () => imageFileRef.current,
      clearPendingImage: () => setImageFromFile(null),
      flushPrompt,
    }),
    [flushPrompt]
  );

  const displayUrl =
    previewUrl || (!imageFile ? attachedPreviewUrl || null : null);
  const showingAttached = Boolean(
    displayUrl && !imageFile && !previewUrl && attachedPreviewUrl
  );
  const canZoomImage = Boolean(
    displayUrl &&
      (imageFile
        ? imageFile.type.startsWith("image/")
        : Boolean(attachedPreviewUrl) && !attachedIsPdf)
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLocalError(null);
    setZoomOpen(false);
    setImageFromFile(null);
    // 仅换课时清空待挂图；收起/展开「做教案提示词」须保留粘贴预览
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only lesson.id
  }, [lesson.id]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen]);

  const groups = useMemo(
    () => [
      {
        lessonId: lesson.id,
        courseLabel: lesson.course_label,
        kindLabel: jpLessonKindLabel(lesson.kind),
        words,
        meanings,
      },
    ],
    [lesson.id, lesson.course_label, lesson.kind, words, meanings]
  );

  if (!open) return null;

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (busy) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      setImageFromFile(file);
      return;
    }
  };

  const handleCopy = () => {
    const text = buildJpLessonAiPlanCopyText(groups, prompt);
    flushPrompt();
    void copyTextToClipboard(text).then(async (ok) => {
      if (!ok) {
        setCopyToast("复制失败");
        return;
      }
      const msg = await afterJpLessonAiPlanPromptCopySuccess({
        lessonId: lesson.id,
        courseLabel: lesson.course_label,
      });
      setCopyToast(msg);
    });
  };

  return (
    <section
      className="jp-lesson-content-edit-ai-plan"
      aria-label="做教案提示词与粘贴教案"
    >
      <div className="jp-lesson-content-edit-ai-plan-grid">
        <div className="jp-lesson-content-edit-ai-plan-col">
          <div className="jp-lesson-content-edit-ai-plan-prompt-head">
            <h3 className="jp-lesson-content-edit-ai-plan-title">
              AI 提示词模板
              <span className="jp-lesson-content-edit-ai-plan-autosave">
                {saveHint === "saved" ? "已自动保存" : "改后自动保存"}
              </span>
            </h3>
            <button
              type="button"
              className="jp-lesson-action-btn jp-lesson-action-btn--primary"
              disabled={busy || !words.length}
              onClick={handleCopy}
              title="复制本课单词与提示词，粘贴到 ChatGPT"
            >
              复制单词+提示词
            </button>
          </div>
          <textarea
            className="jp-lesson-content-edit-ai-plan-textarea"
            rows={10}
            value={prompt}
            disabled={busy}
            spellCheck={false}
            aria-label="AI 教案提示词模板"
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={() => flushPrompt()}
          />
        </div>

        <div className="jp-lesson-content-edit-ai-plan-col">
          <h3 className="jp-lesson-content-edit-ai-plan-title">
            粘贴教案图
            {showingAttached ? (
              <span className="jp-lesson-content-edit-ai-plan-attached-badge">
                已挂本课
              </span>
            ) : null}
          </h3>
          <div className="jp-lesson-content-edit-ai-plan-paste-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setImageFromFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="jp-lesson-action-btn"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              选择图片
            </button>
            {imageFile ? (
              <button
                type="button"
                className="jp-lesson-action-btn"
                disabled={busy}
                onClick={() => setImageFromFile(null)}
              >
                清除图片
              </button>
            ) : null}
          </div>
          <div
            className="jp-lesson-content-edit-ai-plan-paste-zone"
            tabIndex={0}
            onPaste={handlePaste}
            role="region"
            aria-label="粘贴教案图片区域"
          >
            {displayUrl ? (
              attachedIsPdf && showingAttached ? (
                <p>本课已挂 PDF 教案。另选图片后点右下角「保存」可替换。</p>
              ) : canZoomImage ? (
                <button
                  type="button"
                  className="jp-lesson-content-edit-ai-plan-thumb"
                  disabled={busy}
                  title="点击放大预览"
                  aria-label="点击放大预览教案图"
                  onClick={() => setZoomOpen(true)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayUrl}
                    alt="教案预览"
                    className="jp-lesson-content-edit-ai-plan-preview"
                  />
                  <span className="jp-lesson-content-edit-ai-plan-zoom-hint">
                    点击放大预览
                  </span>
                </button>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayUrl}
                  alt="教案预览"
                  className="jp-lesson-content-edit-ai-plan-preview"
                />
              )
            ) : (
              <p>
                在此点击后粘贴图片（Ctrl/⌘+V），或上方选文件；点右下角「保存」挂到本课。
              </p>
            )}
          </div>
        </div>
      </div>

      {localError ? (
        <p className="jp-lesson-content-edit-ai-plan-error" role="alert">
          {localError}
        </p>
      ) : null}

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />

      {mounted &&
      zoomOpen &&
      canZoomImage &&
      displayUrl &&
      createPortal(
        <div
          className="jp-lesson-content-edit-ai-plan-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="教案大图预览"
          onClick={() => setZoomOpen(false)}
        >
          <div className="jp-lesson-content-edit-ai-plan-zoom-bar">
            <span>教案图 · 点击空白处或按 Esc 关闭</span>
            <button
              type="button"
              className="jp-lesson-content-edit-ai-plan-zoom-close"
              onClick={() => setZoomOpen(false)}
              aria-label="关闭大图预览"
            >
              ×
            </button>
          </div>
          <div className="jp-lesson-content-edit-ai-plan-zoom-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl}
              alt="教案大图预览"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>,
        document.body
      )}

      <style jsx global>{`
        /* PC：左右两个独立框；禁止靠 flex+min-height:0 把 textarea/粘贴区压成 0 高 */
        .jp-lesson-content-edit-ai-plan {
          flex: 0 0 auto;
          margin: 0;
          padding: 0.75rem 1.15rem 0.85rem;
          border-bottom: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          overflow: visible;
        }
        .jp-lesson-content-edit-ai-plan-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0.85rem;
          align-items: stretch;
          min-height: 300px;
        }
        .jp-lesson-content-edit-ai-plan-col {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 0;
          min-height: 300px;
          padding: 0.7rem 0.8rem;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--panel);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bg) 40%, transparent);
        }
        .jp-lesson-content-edit-ai-plan-title {
          margin: 0;
          font-size: 0.92rem;
          font-weight: 700;
          flex-shrink: 0;
          display: inline-flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 0.4rem 0.55rem;
        }
        .jp-lesson-content-edit-ai-plan-attached-badge {
          font-size: 0.75rem;
          font-weight: 600;
          color: color-mix(in srgb, var(--accent) 85%, #1a7f37);
          background: color-mix(in srgb, var(--accent) 14%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
          border-radius: 999px;
          padding: 0.12rem 0.5rem;
        }
        .jp-lesson-content-edit-ai-plan-autosave {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--muted);
        }
        .jp-lesson-content-edit-ai-plan-prompt-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.45rem;
          flex-shrink: 0;
        }
        .jp-lesson-content-edit-ai-plan-textarea {
          width: 100%;
          flex: 1 1 auto;
          min-height: 220px;
          height: 220px;
          resize: vertical;
          padding: 0.6rem 0.7rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.88rem;
          line-height: 1.45;
          overflow-y: auto;
          box-sizing: border-box;
        }
        .jp-lesson-content-edit-ai-plan-paste-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          flex-shrink: 0;
        }
        .jp-lesson-content-edit-ai-plan-paste-zone {
          flex: 1 1 auto;
          min-height: 220px;
          height: 220px;
          padding: 0.65rem;
          border-radius: 8px;
          border: 1px dashed color-mix(in srgb, var(--accent) 50%, var(--border));
          background: color-mix(in srgb, var(--bg) 88%, var(--panel));
          outline: none;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: auto;
          box-sizing: border-box;
        }
        .jp-lesson-content-edit-ai-plan-paste-zone:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
        }
        .jp-lesson-content-edit-ai-plan-paste-zone p {
          margin: 0;
          color: var(--muted);
          font-size: 0.88rem;
          line-height: 1.5;
          text-align: center;
          max-width: 16rem;
        }
        .jp-lesson-content-edit-ai-plan-thumb {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          width: 100%;
          margin: 0;
          padding: 0;
          border: none;
          background: transparent;
          cursor: zoom-in;
          color: inherit;
          font: inherit;
        }
        .jp-lesson-content-edit-ai-plan-thumb:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
        .jp-lesson-content-edit-ai-plan-preview {
          display: block;
          max-width: 100%;
          max-height: 190px;
          margin: 0 auto;
          object-fit: contain;
          border-radius: 6px;
        }
        .jp-lesson-content-edit-ai-plan-zoom-hint {
          color: var(--muted);
          font-size: 0.78rem;
        }
        .jp-lesson-content-edit-ai-plan-error {
          margin: 0;
          flex-shrink: 0;
          color: #e85d6f;
          font-size: 0.85rem;
          font-weight: 500;
        }
        .jp-lesson-content-edit-ai-plan-zoom {
          position: fixed;
          inset: 0;
          z-index: 1300;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.78);
          padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0)
            env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
        }
        .jp-lesson-content-edit-ai-plan-zoom-bar {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: #f3f5f8;
          font-size: 0.9rem;
        }
        .jp-lesson-content-edit-ai-plan-zoom-close {
          width: 2.2rem;
          height: 2.2rem;
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 1.35rem;
          line-height: 1;
          cursor: pointer;
        }
        .jp-lesson-content-edit-ai-plan-zoom-stage {
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 1rem 1rem;
          overflow: auto;
        }
        .jp-lesson-content-edit-ai-plan-zoom-stage img {
          max-width: min(96vw, 1100px);
          max-height: min(88dvh, 920px);
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        }
        @media (max-width: 767px) {
          .jp-lesson-content-edit-ai-plan {
            padding: 0.55rem 0.75rem 0.65rem;
            max-height: min(58dvh, 520px);
            overflow-y: auto;
          }
          .jp-lesson-content-edit-ai-plan-grid {
            grid-template-columns: 1fr;
            min-height: 0;
            gap: 0.65rem;
          }
          .jp-lesson-content-edit-ai-plan-col {
            min-height: 0;
          }
          .jp-lesson-content-edit-ai-plan-textarea,
          .jp-lesson-content-edit-ai-plan-paste-zone {
            min-height: 140px;
            height: 140px;
          }
          .jp-lesson-content-edit-ai-plan-preview {
            max-height: 110px;
          }
        }
      `}</style>
    </section>
  );
});
