"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatBeijingDateTimeCompact } from "@/lib/format-datetime";
import {
  formatManualScheduleLessonOptionLabel,
  linkedLessonKey,
  manualScheduleLessonDisplayName,
  type ManualScheduleLessonOption,
} from "@/lib/jp-lesson-manual-schedule-linked";
import { parseLessonContent } from "@/lib/jp-lesson-shared";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";

type Props = {
  open: boolean;
  options: ManualScheduleLessonOption[];
  selectedKeys: Set<string>;
  emptyHint: string | null;
  fieldLabel: string;
  disabled?: boolean;
  onClose: () => void;
  onPick: (option: ManualScheduleLessonOption) => void;
};

function kindLabel(kind: ManualScheduleLessonOption["kind"]): string {
  if (kind === "grammar") return "语法";
  if (kind === "word_grammar") return "单词加语法";
  return "单词";
}

function progressLabel(option: ManualScheduleLessonOption): string {
  if (option.completed) return "已完成";
  if (option.learning) return "学习中";
  return "未完成";
}

function contentPreview(content: string, maxItems = 18): {
  items: string[];
  more: number;
} {
  const items = parseLessonContent(content);
  if (items.length <= maxItems) return { items, more: 0 };
  return { items: items.slice(0, maxItems), more: items.length - maxItems };
}

export function JpLessonManualScheduleLessonPickModal({
  open,
  options,
  selectedKeys,
  emptyHint,
  fieldLabel,
  disabled = false,
  onClose,
  onPick,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    return lockBodyScroll();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((option) => {
      const key = linkedLessonKey({
        subject: option.subject,
        lesson_id: option.id,
      });
      if (selectedKeys.has(key)) return false;
      if (!q) return true;
      const haystack = [
        formatManualScheduleLessonOptionLabel(option),
        manualScheduleLessonDisplayName(option),
        option.content,
        option.course_label || "",
        option.title || "",
        option.teacher_names || "",
        String(option.id),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query, selectedKeys]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="jp-manual-lesson-pick-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (!disabled) closeModalOnBackdropMouseDown(event, onClose);
      }}
    >
      <div
        className="jp-manual-lesson-pick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-manual-lesson-pick-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-manual-lesson-pick-header">
          <div>
            <h2 id="jp-manual-lesson-pick-title">选择教材</h2>
            <p className="jp-manual-lesson-pick-sub">{fieldLabel}</p>
          </div>
          <button
            type="button"
            className="jp-manual-lesson-pick-close"
            aria-label="关闭"
            disabled={disabled}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <input
          type="search"
          className="jp-manual-lesson-pick-search"
          value={query}
          disabled={disabled}
          placeholder="搜索教材名、单词、ID…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索教材"
          autoComplete="off"
          autoFocus
        />

        <ul className="jp-manual-lesson-pick-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="jp-manual-lesson-pick-empty">
              {emptyHint || "没有可关联的教材"}
            </li>
          ) : (
            filtered.map((option) => {
              const name = manualScheduleLessonDisplayName(option);
              const preview = contentPreview(option.content);
              const subject =
                option.subject === "en"
                  ? "英语"
                  : option.subject === "jp"
                    ? "日语"
                    : "";
              return (
                <li key={linkedLessonKey({ subject: option.subject, lesson_id: option.id })}>
                  <button
                    type="button"
                    className="jp-manual-lesson-pick-card"
                    disabled={disabled}
                    onClick={() => onPick(option)}
                  >
                    <div className="jp-manual-lesson-pick-card-top">
                      <span className="jp-manual-lesson-pick-name">{name}</span>
                      <span className="jp-manual-lesson-pick-badge">
                        {progressLabel(option)}
                      </span>
                    </div>
                    <div className="jp-manual-lesson-pick-meta">
                      <span>
                        #{option.id}
                        {subject ? ` · ${subject}` : ""} · {kindLabel(option.kind)}
                      </span>
                      <span>
                        上传 {formatBeijingDateTimeCompact(option.uploaded_at) || "—"}
                      </span>
                    </div>
                    {option.learning &&
                    option.teacher_names &&
                    option.teacher_names !== "未指定" ? (
                      <div className="jp-manual-lesson-pick-teacher">
                        <span>上课老师</span>
                        <strong>{option.teacher_names}</strong>
                      </div>
                    ) : null}
                    <div className="jp-manual-lesson-pick-words" aria-label="学习内容">
                      {preview.items.length === 0 ? (
                        <span className="jp-manual-lesson-pick-words-empty">（无单词内容）</span>
                      ) : (
                        <>
                          {preview.items.map((word, index) => (
                            <span
                              key={`${option.id}-${index}-${word}`}
                              className="jp-manual-lesson-pick-chip"
                            >
                              {word}
                            </span>
                          ))}
                          {preview.more > 0 ? (
                            <span className="jp-manual-lesson-pick-more">
                              等 {preview.more} 个
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="jp-manual-lesson-pick-footer">
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={disabled}
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>

      <style jsx global>{`
        .jp-manual-lesson-pick-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-manual-lesson-pick-modal {
          width: min(560px, 100%);
          max-height: min(88vh, 760px);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem 1.1rem 1rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
          box-sizing: border-box;
        }

        .jp-manual-lesson-pick-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .jp-manual-lesson-pick-header h2 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 600;
        }

        .jp-manual-lesson-pick-sub {
          margin: 0.3rem 0 0;
          font-size: 0.78rem;
          color: var(--muted);
          line-height: 1.4;
        }

        .jp-manual-lesson-pick-close {
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

        .jp-manual-lesson-pick-search {
          width: 100%;
          box-sizing: border-box;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font-size: 0.875rem;
        }

        .jp-manual-lesson-pick-list {
          list-style: none;
          margin: 0;
          padding: 0;
          overflow: auto;
          display: grid;
          gap: 0.55rem;
          flex: 1;
          min-height: 0;
          -webkit-overflow-scrolling: touch;
        }

        .jp-manual-lesson-pick-card {
          display: grid;
          gap: 0.4rem;
          width: 100%;
          text-align: left;
          padding: 0.7rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: color-mix(in srgb, var(--bg) 28%, var(--panel));
          color: inherit;
          cursor: pointer;
        }

        .jp-manual-lesson-pick-card:hover:not(:disabled),
        .jp-manual-lesson-pick-card:focus-visible {
          border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }

        .jp-manual-lesson-pick-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .jp-manual-lesson-pick-name {
          font-size: 0.92rem;
          font-weight: 600;
          line-height: 1.35;
          word-break: break-word;
        }

        .jp-manual-lesson-pick-badge {
          flex-shrink: 0;
          font-size: 0.7rem;
          padding: 0.15rem 0.4rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
          line-height: 1.3;
        }

        .jp-manual-lesson-pick-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem 0.85rem;
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.35;
        }

        .jp-manual-lesson-pick-teacher {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.35rem;
          font-size: 0.78rem;
          line-height: 1.35;
          color: var(--text);
        }

        .jp-manual-lesson-pick-teacher > span {
          padding: 0.12rem 0.38rem;
          border: 1px solid color-mix(in srgb, var(--accent) 42%, var(--border));
          border-radius: 999px;
          color: var(--accent);
          font-size: 0.68rem;
          font-weight: 600;
        }

        .jp-manual-lesson-pick-teacher > strong {
          font-weight: 600;
          overflow-wrap: anywhere;
        }

        .jp-manual-lesson-pick-words {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
        }

        .jp-manual-lesson-pick-chip {
          font-size: 0.72rem;
          padding: 0.18rem 0.4rem;
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          line-height: 1.3;
          max-width: 100%;
          overflow-wrap: anywhere;
        }

        .jp-manual-lesson-pick-more,
        .jp-manual-lesson-pick-words-empty,
        .jp-manual-lesson-pick-empty {
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.4;
        }

        .jp-manual-lesson-pick-empty {
          padding: 1rem 0.5rem;
          text-align: center;
        }

        .jp-manual-lesson-pick-footer {
          display: flex;
          justify-content: flex-end;
        }

        @media (max-width: 767px) {
          .jp-manual-lesson-pick-modal {
            width: 100%;
            max-height: min(92vh, 100%);
            padding: 0.9rem 0.85rem 0.85rem;
          }

          .jp-manual-lesson-pick-name {
            font-size: 0.88rem;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
