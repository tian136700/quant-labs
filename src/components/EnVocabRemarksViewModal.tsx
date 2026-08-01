"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { parseEnVocabClassNotes } from "@/lib/en-vocab-class-notes";
import { mergeEnVocabWordAfterClassNotesFetch } from "@/lib/en-vocab-teacher-quiz";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import type { EnVocabWord } from "@/lib/types";
import { EnVocabClassNoteContent } from "@/components/EnVocabClassNoteContent";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

type Props = {
  open: boolean;
  word: EnVocabWord | null;
  onClose: () => void;
  onWordUpdated?: (word: EnVocabWord) => void;
};

export function EnVocabRemarksViewModal({
  open,
  word,
  onClose,
  onWordUpdated,
}: Props) {
  const { locale } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [displayWord, setDisplayWord] = useState<EnVocabWord | null>(word);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && word) setDisplayWord(word);
  }, [open, word?.id, word?.updated_at, word]);

  /** 打开时拉一次；禁止定时轮询（对方刷新后才见新备注） */
  useEffect(() => {
    if (!open || !word) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/en-vocab/class-notes?word_id=${encodeURIComponent(String(word.id))}`,
          {
            headers: { [LOCALE_HEADER]: locale },
            credentials: "include",
            cache: "no-store",
          }
        );
        const data = (await res.json()) as { ok: boolean; word?: EnVocabWord };
        if (cancelled || !data.ok || !data.word) return;
        const merged = mergeEnVocabWordAfterClassNotesFetch(word, data.word);
        setDisplayWord(merged);
        onWordUpdated?.(merged);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, word?.id, locale, onWordUpdated, word]);

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

  if (!open || !mounted || !displayWord) return null;

  const entries = parseEnVocabClassNotes(displayWord.class_notes);

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
                    {entry.timestamp ? (
                      <div className="jp-remarks-view-entry-ts">{entry.timestamp}</div>
                    ) : null}
                    <EnVocabClassNoteContent content={entry.content} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="jp-remarks-view-empty">暂无备注</p>
            )}
            <p className="jp-remarks-view-sync-hint">
              不会自动同步 · 刷新页面后可见最新备注
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

      <style jsx global>{`
        .jp-remarks-view-overlay {
          position: fixed;
          inset: 0;
          /* 须高于抽问卡 overlay(1002)；对齐日语 JpVocabRemarksViewModal(1100) */
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
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
          width: 2.75rem;
          height: 2.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
          touch-action: manipulation;
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

        .jp-remarks-view-entry-ts {
          font-size: 0.75rem;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
          margin-bottom: 0.35rem;
        }

        .jp-remarks-view-empty {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted);
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

        .jp-remarks-view-footer .btn-rsi-filter {
          min-height: 2.75rem;
          touch-action: manipulation;
        }

        @media (max-width: 767px) {
          .jp-remarks-view-overlay {
            padding: 0.5rem;
            padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
            align-items: flex-end;
          }
          .jp-remarks-view-modal {
            width: 100%;
            max-height: min(92dvh, 92svh);
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>
    </>,
    document.body
  );
}
