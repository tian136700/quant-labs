"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { createPortal } from "react-dom";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { copyTextToClipboard } from "@/lib/copy-text";
import {
  JP_LESSON_AI_PLAN_DEFAULT_PROMPT,
  buildJpLessonAiPlanCopyText,
  readStoredJpLessonAiPlanPrompt,
  writeStoredJpLessonAiPlanPrompt,
  type JpLessonAiPlanWordGroup,
} from "@/lib/jp-lesson-ai-plan-prompt";
import {
  jpLessonKindLabel,
  parseLessonContent,
  alignLessonItemMeanings,
} from "@/lib/jp-lesson-shared";
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
  lessons: JpLessonRecord[];
  attaching?: boolean;
  onClose: () => void;
  onAttached: (payload: {
    lessons: JpLessonRecord[];
    refs: Record<string, JpVocabRef>;
  }) => void;
};

function buildGroups(lessons: JpLessonRecord[]): JpLessonAiPlanWordGroup[] {
  return lessons.map((lesson) => {
    const words = parseLessonContent(lesson.content);
    const meanings = alignLessonItemMeanings(lesson.content, lesson.meanings);
    return {
      lessonId: lesson.id,
      courseLabel: lesson.course_label,
      kindLabel: jpLessonKindLabel(lesson.kind),
      words,
      meanings,
    };
  });
}

export function JpLessonAiPlanPromptModal({
  open,
  lessons,
  attaching = false,
  onClose,
  onAttached,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [prompt, setPrompt] = useState(JP_LESSON_AI_PLAN_DEFAULT_PROMPT);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const busy = attaching || attachBusy;
  const saveProgress = useSaveProgressBar(busy);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const lessonIdsKey = lessons.map((l) => l.id).join(",");

  useEffect(() => {
    if (!open) return;
    setPrompt(readStoredJpLessonAiPlanPrompt());
    setLocalError(null);
    setImageFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [open, lessonIdsKey]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const groups = useMemo(() => buildGroups(lessons), [lessons]);
  const wordCount = groups.reduce((n, g) => n + g.words.length, 0);

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
    if (!lessons.length) {
      setLocalError("没有勾选的课程。");
      return;
    }
    setAttachBusy(true);
    setLocalError(null);
    writeStoredJpLessonAiPlanPrompt(prompt);
    try {
      const form = new FormData();
      form.set(
        "lesson_ids",
        JSON.stringify(lessons.map((l) => l.id))
      );
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
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttachBusy(false);
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="jp-lesson-ai-plan-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="jp-lesson-ai-plan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-lesson-ai-plan-title"
      >
        <div className="jp-lesson-ai-plan-header">
          <h2 id="jp-lesson-ai-plan-title">做教案提示词</h2>
          <p className="jp-lesson-ai-plan-sub">
            已勾选 {lessons.length} 课 · 共 {wordCount} 个词条。点「复制单词+提示词」得到生词表成稿模板（辞書形、插图教案版式）；右下粘贴教案图挂到勾选课。
          </p>
        </div>

        <div className="jp-lesson-ai-plan-body">
          <div className="jp-lesson-ai-plan-grid">
            <section className="jp-lesson-ai-plan-col" aria-label="勾选单词">
              <h3>单词（勾选课）</h3>
              <div className="jp-lesson-ai-plan-words">
                {groups.map((group) => (
                  <div key={group.lessonId} className="jp-lesson-ai-plan-group">
                    <div className="jp-lesson-ai-plan-group-head">
                      #{group.lessonId} · {group.kindLabel}
                      {group.courseLabel ? ` · ${group.courseLabel}` : ""}
                    </div>
                    <ol>
                      {group.words.length ? (
                        group.words.map((w) => (
                          <li key={`${group.lessonId}-${w}`}>{w}</li>
                        ))
                      ) : (
                        <li className="is-empty">（无学习内容）</li>
                      )}
                    </ol>
                  </div>
                ))}
              </div>
            </section>

            <section className="jp-lesson-ai-plan-col" aria-label="AI提示词与教案">
              <div className="jp-lesson-ai-plan-prompt-block">
                <div className="jp-lesson-ai-plan-prompt-head">
                  <h3>AI 提示词</h3>
                  <button
                    type="button"
                    className="jp-lesson-action-btn jp-lesson-action-btn--primary"
                    disabled={busy || !lessons.length}
                    onClick={handleCopy}
                  >
                    复制单词+提示词
                  </button>
                </div>
                <textarea
                  className="jp-lesson-ai-plan-textarea"
                  rows={8}
                  value={prompt}
                  disabled={busy}
                  spellCheck={false}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <div className="jp-lesson-ai-plan-paste-block">
                <h3>粘贴教案图（挂到勾选课）</h3>
                <div
                  ref={pasteZoneRef}
                  className="jp-lesson-ai-plan-paste-zone"
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
                      className="jp-lesson-ai-plan-preview"
                    />
                  ) : (
                    <p>
                      在此点击后粘贴图片（Ctrl/⌘+V），或下方选择文件。同一张图会挂到全部勾选课。
                    </p>
                  )}
                </div>
                <div className="jp-lesson-ai-plan-paste-actions">
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
                    disabled={busy || !imageFile || !lessons.length}
                    onClick={() => void handleAttach()}
                  >
                    挂到勾选课
                    {lessons.length ? `（${lessons.length}）` : ""}
                  </button>
                </div>
              </div>
            </section>
          </div>

          {localError ? (
            <p className="jp-lesson-ai-plan-error" role="alert">
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
        </div>

        <div className="jp-lesson-ai-plan-footer">
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={busy}
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />

      <style jsx>{`
        .jp-lesson-ai-plan-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
        }
        .jp-lesson-ai-plan-modal {
          display: flex;
          flex-direction: column;
          width: min(980px, 100%);
          max-height: min(calc(100dvh - 2rem), 920px);
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-lesson-ai-plan-header {
          flex-shrink: 0;
          padding: 1rem 1.1rem 0.65rem;
          border-bottom: 1px solid var(--border);
        }
        .jp-lesson-ai-plan-header h2 {
          margin: 0;
          font-size: 1.1rem;
        }
        .jp-lesson-ai-plan-sub {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.85rem;
          line-height: 1.45;
        }
        .jp-lesson-ai-plan-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 0.85rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .jp-lesson-ai-plan-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.15fr);
          gap: 0.85rem;
          align-items: start;
        }
        .jp-lesson-ai-plan-col h3 {
          margin: 0 0 0.45rem;
          font-size: 0.9rem;
        }
        .jp-lesson-ai-plan-words {
          max-height: min(52dvh, 420px);
          overflow-y: auto;
          padding: 0.55rem 0.65rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
        }
        .jp-lesson-ai-plan-group + .jp-lesson-ai-plan-group {
          margin-top: 0.75rem;
          padding-top: 0.65rem;
          border-top: 1px dashed var(--border);
        }
        .jp-lesson-ai-plan-group-head {
          color: var(--muted);
          font-size: 0.78rem;
          font-weight: 600;
          margin-bottom: 0.35rem;
        }
        .jp-lesson-ai-plan-group ol {
          margin: 0;
          padding-left: 1.2rem;
          font-size: 0.92rem;
          line-height: 1.5;
        }
        .jp-lesson-ai-plan-group .is-empty {
          color: var(--muted);
        }
        .jp-lesson-ai-plan-prompt-block,
        .jp-lesson-ai-plan-paste-block {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .jp-lesson-ai-plan-prompt-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.45rem;
        }
        .jp-lesson-ai-plan-textarea {
          width: 100%;
          min-height: 9rem;
          resize: vertical;
          padding: 0.65rem 0.75rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .jp-lesson-ai-plan-paste-zone {
          min-height: 7.5rem;
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--bg) 90%, var(--panel));
          outline: none;
        }
        .jp-lesson-ai-plan-paste-zone:focus {
          border-color: var(--accent);
        }
        .jp-lesson-ai-plan-paste-zone p {
          margin: 0;
          color: var(--muted);
          font-size: 0.85rem;
          line-height: 1.45;
        }
        .jp-lesson-ai-plan-preview {
          display: block;
          max-width: 100%;
          max-height: 220px;
          margin: 0 auto;
          object-fit: contain;
          border-radius: 6px;
        }
        .jp-lesson-ai-plan-paste-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }
        .jp-lesson-ai-plan-error {
          margin: 0;
          color: #e85d6f;
          font-size: 0.85rem;
          font-weight: 500;
        }
        .jp-lesson-ai-plan-footer {
          flex-shrink: 0;
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.75rem 1.1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
        }
        @media (max-width: 767px) {
          .jp-lesson-ai-plan-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-lesson-ai-plan-modal {
            width: 100%;
            max-height: min(94dvh, 920px);
            border-radius: 14px 14px 0 0;
          }
          .jp-lesson-ai-plan-grid {
            grid-template-columns: 1fr;
          }
          .jp-lesson-ai-plan-words {
            max-height: 28dvh;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
