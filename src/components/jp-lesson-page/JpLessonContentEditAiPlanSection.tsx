"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import { copyTextToClipboard } from "@/lib/copy-text";
import {
  JP_LESSON_AI_PLAN_DEFAULT_PROMPT,
  buildJpLessonAiPlanCopyText,
  readStoredJpLessonAiPlanPrompt,
  writeStoredJpLessonAiPlanPrompt,
} from "@/lib/jp-lesson-ai-plan-prompt";
import { jpLessonKindLabel } from "@/lib/jp-lesson-shared";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import type { JpLessonRecord, JpVocabRef } from "@/lib/types";

type AttachBatchOk = {
  ok: true;
  lessons: JpLessonRecord[];
  refs: Record<string, JpVocabRef>;
  count: number;
};

type Props = {
  open: boolean;
  lesson: JpLessonRecord;
  /** 当前编辑行里的学习内容（未保存也按屏上词复制） */
  words: string[];
  /** 与 words 对齐的释义 */
  meanings?: Array<string | null | undefined>;
  disabled?: boolean;
  onAttached: (payload: {
    lessons: JpLessonRecord[];
    refs: Record<string, JpVocabRef>;
  }) => void;
};

/**
 * 「编辑学习内容」弹窗内：左 AI 提示词 / 右粘贴教案图；图可点放大预览。
 */
export function JpLessonContentEditAiPlanSection({
  open,
  lesson,
  words,
  meanings,
  disabled = false,
  onAttached,
}: Props) {
  const [prompt, setPrompt] = useState(JP_LESSON_AI_PLAN_DEFAULT_PROMPT);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = disabled || attachBusy;
  const saveProgress = useSaveProgressBar(attachBusy);
  const canZoomImage = Boolean(
    previewUrl && imageFile && imageFile.type.startsWith("image/")
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPrompt(readStoredJpLessonAiPlanPrompt());
    setLocalError(null);
    setZoomOpen(false);
    setImageFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [open, lesson.id]);

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

  const setImageFromFile = (file: File | null) => {
    setImageFile(file);
    setZoomOpen(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setLocalError(null);
  };

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
    writeStoredJpLessonAiPlanPrompt(prompt);
    void copyTextToClipboard(text).then((ok) =>
      setCopyToast(ok ? "复制成功" : "复制失败")
    );
  };

  const handleAttach = async () => {
    if (!imageFile) {
      setLocalError("请先粘贴或选择教案图片。");
      return;
    }
    setAttachBusy(true);
    setLocalError(null);
    writeStoredJpLessonAiPlanPrompt(prompt);
    try {
      const form = new FormData();
      form.set("lesson_ids", JSON.stringify([lesson.id]));
      form.set("file", imageFile, imageFile.name || "plan.png");
      if (imageFile.type === "application/pdf") {
        form.set("media_type", "pdf");
      } else {
        form.set("media_type", "image");
      }

      const res = await fetch("/api/jp-lesson/ref/attach-batch", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = (await res.json()) as AttachBatchOk & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `挂教案失败（${res.status}）`);
      }
      onAttached({ lessons: data.lessons, refs: data.refs });
      setImageFromFile(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttachBusy(false);
    }
  };

  return (
    <section
      className="jp-lesson-content-edit-ai-plan"
      aria-label="做教案提示词与粘贴教案"
    >
      <div className="jp-lesson-content-edit-ai-plan-grid">
        <div className="jp-lesson-content-edit-ai-plan-col">
          <div className="jp-lesson-content-edit-ai-plan-prompt-head">
            <h3 className="jp-lesson-content-edit-ai-plan-title">AI 提示词</h3>
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
            aria-label="AI 教案提示词"
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="jp-lesson-content-edit-ai-plan-col">
          <h3 className="jp-lesson-content-edit-ai-plan-title">
            粘贴教案图（挂到本课）
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
            <button
              type="button"
              className="jp-lesson-action-btn jp-lesson-action-btn--primary"
              disabled={busy || !imageFile}
              onClick={() => void handleAttach()}
            >
              挂到本课
            </button>
          </div>
          <div
            className="jp-lesson-content-edit-ai-plan-paste-zone"
            tabIndex={0}
            onPaste={handlePaste}
            role="region"
            aria-label="粘贴教案图片区域"
          >
            {previewUrl ? (
              canZoomImage ? (
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
                    src={previewUrl}
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
                  src={previewUrl}
                  alt="教案预览"
                  className="jp-lesson-content-edit-ai-plan-preview"
                />
              )
            ) : (
              <p>在此点击后粘贴图片（Ctrl/⌘+V），或上方选文件，再点「挂到本课」。</p>
            )}
          </div>
        </div>
      </div>

      {localError ? (
        <p className="jp-lesson-content-edit-ai-plan-error" role="alert">
          {localError}
        </p>
      ) : null}

      {saveProgress.visible ? (
        <JpVocabSaveProgressBar
          label={jpVocabSaveProgressLabel("save")}
          percent={saveProgress.percent}
          fullWidth
        />
      ) : null}

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />

      {mounted &&
      zoomOpen &&
      canZoomImage &&
      previewUrl &&
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
              src={previewUrl}
              alt="教案大图预览"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>,
        document.body
      )}

      <style jsx global>{`
        .jp-lesson-content-edit-ai-plan {
          flex: 0 1 auto;
          min-height: 0;
          max-height: min(42dvh, 360px);
          margin: 0;
          padding: 0.65rem 1.1rem 0.75rem;
          border-bottom: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 70%, var(--panel));
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          overflow: hidden;
        }
        .jp-lesson-content-edit-ai-plan-grid {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0.75rem;
          align-items: stretch;
        }
        .jp-lesson-content-edit-ai-plan-col {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          min-width: 0;
          min-height: 0;
        }
        .jp-lesson-content-edit-ai-plan-title {
          margin: 0;
          font-size: 0.88rem;
          font-weight: 600;
          flex-shrink: 0;
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
          flex: 1;
          min-height: 0;
          resize: none;
          padding: 0.55rem 0.65rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.88rem;
          line-height: 1.45;
          overflow-y: auto;
        }
        .jp-lesson-content-edit-ai-plan-paste-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          flex-shrink: 0;
        }
        .jp-lesson-content-edit-ai-plan-paste-zone {
          flex: 1;
          min-height: 0;
          padding: 0.55rem;
          border-radius: 8px;
          border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--bg) 90%, var(--panel));
          outline: none;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: auto;
        }
        .jp-lesson-content-edit-ai-plan-paste-zone:focus {
          border-color: var(--accent);
        }
        .jp-lesson-content-edit-ai-plan-paste-zone p {
          margin: 0;
          color: var(--muted);
          font-size: 0.84rem;
          line-height: 1.45;
          text-align: center;
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
          max-height: min(28dvh, 220px);
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
            max-height: min(50dvh, 420px);
            padding: 0.55rem 0.75rem 0.65rem;
          }
          .jp-lesson-content-edit-ai-plan-grid {
            grid-template-columns: 1fr;
          }
          .jp-lesson-content-edit-ai-plan-preview {
            max-height: min(22dvh, 160px);
          }
        }
      `}</style>
    </section>
  );
}
