"use client";

import {
  useEffect,
  useId,
  useState,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import {
  buildEnLessonContentEditRows,
  buildEnLessonContentMeaningsFromRows,
  createEmptyEnLessonContentEditRow,
  type EnLessonContentEditRow,
} from "@/lib/en-lesson-content-edit";
import {
  EN_VOCAB_CATEGORY_PRESETS,
  EN_VOCAB_DEFAULT_CATEGORY,
} from "@/lib/en-vocab-category";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import type { EnLessonKind, EnLessonRecord } from "@/lib/types";

const CATEGORY_OPTIONS = [...EN_VOCAB_CATEGORY_PRESETS] as const;

export type EnLessonEditApi = {
  open: (lesson: EnLessonRecord) => void;
};

type Props = {
  locale: string;
  apiRef: MutableRefObject<EnLessonEditApi | null>;
  onNeedLogin?: () => void;
  onUpdated: (lesson: EnLessonRecord) => void;
};

function errorMessage(code: string | undefined): string {
  switch (code) {
    case "content_empty":
    case "content_invalid":
      return "请至少填写一项学习内容";
    case "content_duplicate":
      return "相同类型与内容的新课已存在";
    case "kind_invalid":
      return "类型无效";
    case "not_found":
      return "课次不存在或已删除";
    default:
      return code || "保存失败";
  }
}

export function EnLessonEditBridge({
  locale,
  apiRef,
  onNeedLogin,
  onUpdated,
}: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [lesson, setLesson] = useState<EnLessonRecord | null>(null);
  const [kind, setKind] = useState<EnLessonKind>("word");
  const [category, setCategory] = useState<string>(EN_VOCAB_DEFAULT_CATEGORY);
  const [title, setTitle] = useState("");
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<EnLessonContentEditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const saveProgress = useSaveProgressBar(saving);
  const open = Boolean(lesson);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    apiRef.current = {
      open: (next) => {
        setLesson(next);
        setKind(next.kind === "grammar" ? "grammar" : "word");
        setCategory(next.category?.trim() || EN_VOCAB_DEFAULT_CATEGORY);
        setTitle(next.title?.trim() || "");
        setRemarks(next.remarks?.trim() || "");
        setRows(buildEnLessonContentEditRows(next.content, next.meanings));
        setFormError("");
        setSaving(false);
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const onClose = () => {
    if (saving) return;
    setLesson(null);
    setFormError("");
  };

  const patchRow = (
    id: string,
    patch: Partial<Pick<EnLessonContentEditRow, "content" | "meaning">>
  ) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length ? next : [createEmptyEnLessonContentEditRow()];
    });
  };

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyEnLessonContentEditRow()]);
  };

  const handleSave = async () => {
    if (!lesson) return;
    const parsed = buildEnLessonContentMeaningsFromRows(rows);
    if (!parsed.ok) {
      setFormError("请至少填写一项学习内容");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const res = await fetch("/api/en-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "update",
          lesson_id: lesson.id,
          kind,
          content: parsed.value.content,
          meanings: parsed.value.meanings,
          category,
          remarks: remarks.trim() || null,
          title: title.trim() || null,
        }),
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
      onUpdated(data.lesson);
      setLesson(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || !open || !lesson) return null;

  return createPortal(
    <div
      className="en-lesson-edit-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="en-lesson-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="en-lesson-edit-header">
          <h2 id={titleId} className="en-lesson-edit-title">
            编辑英语新课 #{lesson.id}
          </h2>
          <button
            type="button"
            className="en-lesson-edit-close"
            aria-label="关闭"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="en-lesson-edit-body">
          <p className="en-lesson-edit-sub">
            可改类型、分类、学习内容与释义、备注、标题。上课老师 / 时间 / 状态 /
            换教案仍用列表原有入口。
          </p>

          <fieldset className="en-lesson-edit-fieldset" disabled={saving}>
            <legend>类型</legend>
            <div
              className="en-lesson-edit-kind-row"
              role="radiogroup"
              aria-label="学习类型"
            >
              <label className="en-lesson-edit-kind">
                <input
                  type="radio"
                  name="en-lesson-edit-kind"
                  value="word"
                  checked={kind === "word"}
                  onChange={() => setKind("word")}
                />
                单词
              </label>
              <label className="en-lesson-edit-kind">
                <input
                  type="radio"
                  name="en-lesson-edit-kind"
                  value="grammar"
                  checked={kind === "grammar"}
                  onChange={() => setKind("grammar")}
                />
                语法
              </label>
            </div>
          </fieldset>

          <fieldset className="en-lesson-edit-fieldset" disabled={saving}>
            <legend>分类</legend>
            <select
              className="en-lesson-edit-select"
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

          <fieldset className="en-lesson-edit-fieldset" disabled={saving}>
            <legend>学习内容与释义</legend>
            <div className="en-lesson-edit-rows-toolbar">
              <button
                type="button"
                className="jp-lesson-action-btn"
                disabled={saving}
                onClick={addRow}
              >
                添加一项
              </button>
            </div>
            <div className="en-lesson-edit-rows">
              {rows.map((row, index) => (
                <div key={row.id} className="en-lesson-edit-row">
                  <span className="en-lesson-edit-row-idx" aria-hidden="true">
                    {index + 1}
                  </span>
                  <label className="en-lesson-edit-cell">
                    <span className="en-lesson-edit-cell-label">学习内容</span>
                    <input
                      type="text"
                      className="en-lesson-edit-input"
                      value={row.content}
                      onChange={(e) =>
                        patchRow(row.id, { content: e.target.value })
                      }
                      placeholder={
                        kind === "grammar"
                          ? "如：定语从句"
                          : "如：look forward to"
                      }
                      aria-label={`第 ${index + 1} 项学习内容`}
                    />
                  </label>
                  <label className="en-lesson-edit-cell">
                    <span className="en-lesson-edit-cell-label">释义</span>
                    <input
                      type="text"
                      className="en-lesson-edit-input"
                      value={row.meaning}
                      onChange={(e) =>
                        patchRow(row.id, { meaning: e.target.value })
                      }
                      placeholder="中文释义"
                      aria-label={`第 ${index + 1} 项释义`}
                    />
                  </label>
                  <button
                    type="button"
                    className="jp-lesson-action-btn en-lesson-edit-row-remove"
                    disabled={saving}
                    title="删除这一项"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `确定删除第 ${index + 1} 项及其释义吗？`
                        )
                      ) {
                        return;
                      }
                      removeRow(row.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="en-lesson-edit-fieldset" disabled={saving}>
            <legend>备注（可选）</legend>
            <textarea
              className="en-lesson-edit-textarea"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={
                kind === "grammar"
                  ? "语法说明、用法要点等"
                  : "本课重点或补充说明"
              }
            />
          </fieldset>

          <fieldset className="en-lesson-edit-fieldset" disabled={saving}>
            <legend>教案标题（可选）</legend>
            <input
              type="text"
              className="en-lesson-edit-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="可选"
            />
          </fieldset>

          {formError ? (
            <p className="en-lesson-edit-error" role="alert">
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

        <div className="en-lesson-edit-actions">
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
        .en-lesson-edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(8, 12, 20, 0.62);
        }
        .en-lesson-edit-modal {
          width: min(720px, 100%);
          max-height: min(92dvh, 920px);
          display: flex;
          flex-direction: column;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
          overflow: hidden;
        }
        .en-lesson-edit-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.85rem 1rem;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .en-lesson-edit-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 650;
        }
        .en-lesson-edit-close {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 1.4rem;
          line-height: 1;
          cursor: pointer;
          padding: 0.15rem 0.35rem;
        }
        .en-lesson-edit-body {
          padding: 0.85rem 1rem 1rem;
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          min-height: 0;
        }
        .en-lesson-edit-sub {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }
        .en-lesson-edit-fieldset {
          margin: 0;
          padding: 0;
          border: none;
          min-width: 0;
        }
        .en-lesson-edit-fieldset legend {
          margin: 0 0 0.35rem;
          font-size: 0.8125rem;
          font-weight: 600;
        }
        .en-lesson-edit-kind-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1.1rem;
        }
        .en-lesson-edit-kind {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.875rem;
        }
        .en-lesson-edit-select,
        .en-lesson-edit-input,
        .en-lesson-edit-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--panel) 88%, #000);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.45rem 0.6rem;
        }
        .en-lesson-edit-textarea {
          resize: vertical;
          min-height: 4.5rem;
        }
        .en-lesson-edit-rows-toolbar {
          margin-bottom: 0.45rem;
        }
        .en-lesson-edit-rows {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .en-lesson-edit-row {
          display: grid;
          grid-template-columns: 1.5rem 1fr 1fr auto;
          gap: 0.45rem;
          align-items: end;
          padding: 0.55rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--panel) 92%, #111);
        }
        .en-lesson-edit-row-idx {
          font-size: 0.75rem;
          color: var(--muted);
          padding-bottom: 0.55rem;
          text-align: center;
        }
        .en-lesson-edit-cell {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          min-width: 0;
        }
        .en-lesson-edit-cell-label {
          font-size: 0.7rem;
          color: var(--muted);
        }
        .en-lesson-edit-row-remove {
          white-space: nowrap;
        }
        .en-lesson-edit-error {
          margin: 0;
          color: #f07178;
          font-size: 0.8125rem;
        }
        .en-lesson-edit-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }
        @media (max-width: 767px) {
          .en-lesson-edit-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .en-lesson-edit-modal {
            width: 100%;
            max-height: 92dvh;
            border-radius: 14px 14px 0 0;
          }
          .en-lesson-edit-row {
            grid-template-columns: 1.25rem 1fr;
          }
          .en-lesson-edit-row-remove {
            grid-column: 1 / -1;
            justify-self: stretch;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
