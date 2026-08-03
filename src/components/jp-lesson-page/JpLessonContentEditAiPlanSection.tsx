"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
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
  disabled?: boolean;
  onAttached: (payload: {
    lessons: JpLessonRecord[];
    refs: Record<string, JpVocabRef>;
  }) => void;
};

/**
 * 「编辑学习内容」弹窗内：展开后复制 AI 教案提示词 + 粘贴图挂到本课。
 */
export function JpLessonContentEditAiPlanSection({
  open,
  lesson,
  words,
  disabled = false,
  onAttached,
}: Props) {
  const [prompt, setPrompt] = useState(JP_LESSON_AI_PLAN_DEFAULT_PROMPT);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = disabled || attachBusy;
  const saveProgress = useSaveProgressBar(attachBusy);

  useEffect(() => {
    if (!open) return;
    setPrompt(readStoredJpLessonAiPlanPrompt());
    setLocalError(null);
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

  const groups = useMemo(
    () => [
      {
        lessonId: lesson.id,
        courseLabel: lesson.course_label,
        kindLabel: jpLessonKindLabel(lesson.kind),
        words,
      },
    ],
    [lesson.id, lesson.course_label, lesson.kind, words]
  );

  if (!open) return null;

  const setImageFromFile = (file: File | null) => {
    setImageFile(file);
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
        rows={5}
        value={prompt}
        disabled={busy}
        spellCheck={false}
        aria-label="AI 教案提示词"
        onChange={(e) => setPrompt(e.target.value)}
      />

      <h3 className="jp-lesson-content-edit-ai-plan-title">
        粘贴教案图（挂到本课）
      </h3>
      <div
        className="jp-lesson-content-edit-ai-plan-paste-zone"
        tabIndex={0}
        onPaste={handlePaste}
        role="region"
        aria-label="粘贴教案图片区域"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="教案预览"
            className="jp-lesson-content-edit-ai-plan-preview"
          />
        ) : (
          <p>在此点击后粘贴图片（Ctrl/⌘+V），或下方选择文件，挂到本课。</p>
        )}
      </div>
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

      <style jsx global>{`
        .jp-lesson-content-edit-ai-plan {
          margin-top: 0.75rem;
          padding: 0.75rem 0.8rem;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
          background: color-mix(in srgb, var(--bg) 70%, var(--panel));
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .jp-lesson-content-edit-ai-plan-title {
          margin: 0;
          font-size: 0.88rem;
          font-weight: 600;
        }
        .jp-lesson-content-edit-ai-plan-prompt-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.45rem;
        }
        .jp-lesson-content-edit-ai-plan-textarea {
          width: 100%;
          min-height: 6.5rem;
          resize: vertical;
          padding: 0.55rem 0.65rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.88rem;
          line-height: 1.45;
        }
        .jp-lesson-content-edit-ai-plan-paste-zone {
          min-height: 5.5rem;
          padding: 0.65rem;
          border-radius: 8px;
          border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--bg) 90%, var(--panel));
          outline: none;
        }
        .jp-lesson-content-edit-ai-plan-paste-zone:focus {
          border-color: var(--accent);
        }
        .jp-lesson-content-edit-ai-plan-paste-zone p {
          margin: 0;
          color: var(--muted);
          font-size: 0.84rem;
          line-height: 1.45;
        }
        .jp-lesson-content-edit-ai-plan-preview {
          display: block;
          max-width: 100%;
          max-height: 160px;
          margin: 0 auto;
          object-fit: contain;
          border-radius: 6px;
        }
        .jp-lesson-content-edit-ai-plan-paste-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }
        .jp-lesson-content-edit-ai-plan-error {
          margin: 0;
          color: #e85d6f;
          font-size: 0.85rem;
          font-weight: 500;
        }
        @media (max-width: 767px) {
          .jp-lesson-content-edit-ai-plan {
            padding: 0.65rem 0.7rem;
          }
        }
      `}</style>
    </section>
  );
}
