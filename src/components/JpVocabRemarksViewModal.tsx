"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  parseJpVocabClassNotes,
  removeJpVocabClassNoteAtIndex,
} from "@/lib/jp-vocab-class-notes";
import {
  buildOptimisticJpVocabWord,
  syncJpVocabEditResponse,
} from "@/lib/jp-vocab-optimistic-save";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { jpVocabSaveQueue } from "@/lib/request-queue";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import type { JpVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

type Props = {
  open: boolean;
  word: JpVocabWord | null;
  canDelete?: boolean;
  onClose: () => void;
  onWordUpdated?: (word: JpVocabWord) => void;
  onSaveFailed?: (wordId: number, snapshot: JpVocabWord, message: string) => void;
  onNeedAuth?: () => void;
};

export function JpVocabRemarksViewModal({
  open,
  word,
  canDelete = false,
  onClose,
  onWordUpdated,
  onSaveFailed,
  onNeedAuth,
}: Props) {
  const { locale } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [displayWord, setDisplayWord] = useState<JpVocabWord | null>(word);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const displayWordRef = useRef(displayWord);

  useEffect(() => {
    displayWordRef.current = displayWord;
  }, [displayWord]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && word) {
      setDisplayWord(word);
      setError("");
      setDeletingIndex(null);
    }
  }, [open, word?.id, word?.updated_at, word]);

  // 禁止打开时/定时轮询拉备注（易 1102）。最新正文仅由卡片「拉取实时备注」按需 GET 后传入。
  // 本弹窗只展示传入的 word，删除条目时才 POST。

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const handleDeleteAtIndex = async (index: number) => {
    const current = displayWordRef.current;
    if (!current || !canDelete || deletingIndex != null) return;

    const entries = parseJpVocabClassNotes(current.class_notes);
    if (!entries[index]) return;

    const nextNotes = removeJpVocabClassNoteAtIndex(current.class_notes, index);
    const snapshot = current;
    const optimistic = buildOptimisticJpVocabWord(snapshot, {
      class_notes: nextNotes,
    });

    setDeletingIndex(index);
    setError("");
    setDisplayWord(optimistic);
    onWordUpdated?.(optimistic);

    try {
      await jpVocabSaveQueue.enqueue(async () => {
        const res = await fetch("/api/jp-vocab/class-notes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({
            word_id: snapshot.id,
            class_notes: nextNotes,
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          word?: JpVocabWord;
          error?: string;
        };
        await syncJpVocabEditResponse(res, data, locale, {
          onSaved: (saved) => {
            setDisplayWord(saved);
            onWordUpdated?.(saved);
          },
          onSaveFailed: (wordId, snap, message) => {
            setDisplayWord(snap);
            onWordUpdated?.(snap);
            onSaveFailed?.(wordId, snap, message);
          },
          onNeedAuth: () => onNeedAuth?.(),
        });
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : locale === "zh" ? "删除失败" : "Delete failed";
      setError(message);
      setDisplayWord(snapshot);
      onWordUpdated?.(snapshot);
      onSaveFailed?.(snapshot.id, snapshot, message);
    } finally {
      setDeletingIndex(null);
    }
  };

  if (!open || !mounted || !displayWord) return null;

  const entries = parseJpVocabClassNotes(displayWord.class_notes);

  return createPortal(
    <>
      <div
        className="jp-remarks-view-overlay"
        role="presentation"
        onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
      >
        <div
          className="jp-remarks-view-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-remarks-view-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-remarks-view-header">
            <div>
              <h2 id="jp-remarks-view-title" className="jp-remarks-view-title">
                备注
              </h2>
              <p className="jp-remarks-view-subtitle">{displayWord.word}</p>
            </div>
            <button
              type="button"
              className="jp-remarks-view-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-remarks-view-body">
            {entries.length > 0 ? (
              <div className="jp-remarks-view-list">
                {entries.map((entry, index) => (
                  <div
                    key={`${entry.timestamp ?? "legacy"}-${index}`}
                    className="jp-remarks-view-entry"
                  >
                    <div className="jp-remarks-view-entry-head">
                      {entry.timestamp ? (
                        <div className="jp-remarks-view-entry-ts">{entry.timestamp}</div>
                      ) : (
                        <span />
                      )}
                      {canDelete ? (
                        <button
                          type="button"
                          className="jp-remarks-view-entry-delete"
                          disabled={deletingIndex === index}
                          aria-label="删除本条备注"
                          onClick={() => void handleDeleteAtIndex(index)}
                        >
                          {deletingIndex === index ? "删除中…" : "删除"}
                        </button>
                      ) : null}
                    </div>
                    <JpVocabClassNoteContent content={entry.content} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="jp-remarks-view-empty">暂无备注</p>
            )}
            {error ? <p className="jp-remarks-view-error">{error}</p> : null}
            <p className="jp-remarks-view-sync-hint">
              不自动同步；要点「拉取实时备注」才会向服务器取最新
            </p>
          </div>

          <div className="jp-remarks-view-footer">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .jp-remarks-view-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-remarks-view-modal {
          display: flex;
          flex-direction: column;
          width: min(760px, 100%);
          max-height: min(88vh, 720px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-remarks-view-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-remarks-view-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-remarks-view-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--accent);
        }

        .jp-remarks-view-close {
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

        .jp-remarks-view-body {
          padding: 1.1rem 1.25rem;
          overflow-y: auto;
          flex: 1;
          min-height: 12rem;
        }

        .jp-remarks-view-list {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .jp-remarks-view-entry {
          padding: 0.65rem 0.75rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          background: color-mix(in srgb, var(--bg) 45%, var(--panel));
        }

        .jp-remarks-view-entry-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.35rem;
        }

        .jp-remarks-view-entry-ts {
          font-size: 0.75rem;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
        }

        .jp-remarks-view-entry-delete {
          flex-shrink: 0;
          border: none;
          background: transparent;
          color: var(--rise);
          font-size: 0.75rem;
          padding: 0.1rem 0.25rem;
          cursor: pointer;
          font: inherit;
        }

        .jp-remarks-view-entry-delete:hover:not(:disabled) {
          text-decoration: underline;
        }

        .jp-remarks-view-entry-delete:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-remarks-view-entry-body {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font: inherit;
          font-size: 0.9375rem;
          line-height: 1.6;
          color: var(--text);
        }

        .jp-remarks-view-empty {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .jp-remarks-view-error {
          margin: 0.75rem 0 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
        }

        .jp-remarks-view-sync-hint {
          margin: 0.75rem 0 0;
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-remarks-view-footer {
          display: flex;
          justify-content: flex-end;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }
      `}</style>
    </>,
    document.body
  );
}
