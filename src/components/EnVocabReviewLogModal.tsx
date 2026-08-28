"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { formatBeijingDateTimeCompact } from "@/lib/format-datetime";
import {
  enVocabLevelLabelZh,
  enVocabReviewLogSourceLabelZh,
  type EnVocabReviewLogEntry,
} from "@/lib/en-vocab-review-log";
import type { EnVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

type Props = {
  open: boolean;
  word: EnVocabWord | null;
  onClose: () => void;
};

export function EnVocabReviewLogModal({ open, word, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EnVocabReviewLogEntry[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const load = useCallback(async (wordId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/en-vocab/review-log?word_id=${wordId}&limit=50`,
        { credentials: "include", cache: "no-store" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        items?: EnVocabReviewLogEntry[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "加载失败");
      }
      setItems(data.items ?? []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !word?.id) {
      setItems([]);
      setError(null);
      return;
    }
    void load(word.id);
  }, [open, word?.id, load]);

  if (!open || !mounted || !word) return null;

  return createPortal(
    <>
      <div
        className="jp-mnemonic-view-overlay"
        role="presentation"
        onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
      >
        <div
          className="jp-mnemonic-view-modal en-vocab-review-log-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="en-vocab-review-log-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-mnemonic-view-header">
            <div>
              <h2 id="en-vocab-review-log-title" className="jp-mnemonic-view-title">
                勾选记录
              </h2>
              <p className="jp-mnemonic-view-subtitle">{word.word}</p>
            </div>
            <button
              type="button"
              className="jp-mnemonic-view-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-mnemonic-view-body en-vocab-review-log-body">
            {loading ? (
              <p className="jp-mnemonic-view-empty">加载中…</p>
            ) : error ? (
              <p className="jp-mnemonic-view-empty">{error}</p>
            ) : items.length === 0 ? (
              <p className="jp-mnemonic-view-empty">
                暂无勾选记录。从此功能上线后，每次老师勾选熟悉程度都会记一条。
              </p>
            ) : (
              <ul className="en-vocab-review-log-list">
                {items.map((item) => (
                  <li key={item.id} className="en-vocab-review-log-item">
                    <div className="en-vocab-review-log-item-head">
                      <time dateTime={item.reviewed_at}>
                        {formatBeijingDateTimeCompact(item.reviewed_at)}
                      </time>
                      <span className="en-vocab-review-log-meta">
                        {item.reviewed_by} ·{" "}
                        {enVocabReviewLogSourceLabelZh(item.source)}
                      </span>
                    </div>
                    <p className="en-vocab-review-log-overall">
                      总体：{enVocabLevelLabelZh(item.overall_level)}
                    </p>
                    {item.usage_levels?.length ? (
                      <ul className="en-vocab-review-log-usages">
                        {item.usage_levels.map((level, idx) => (
                          <li key={`${item.id}-${idx}`}>
                            <span className="en-vocab-review-log-usage-label">
                              用法{idx + 1}
                            </span>
                            <span className="en-vocab-review-log-usage-level">
                              {enVocabLevelLabelZh(level)}
                            </span>
                            {item.usage_labels?.[idx] ? (
                              <span className="en-vocab-review-log-usage-text">
                                {item.usage_labels[idx]}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="en-vocab-review-log-no-usage">
                        本次为整词勾选（无分用法记录）
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <style jsx global>{`
        .en-vocab-review-log-modal {
          max-width: min(36rem, 92vw);
        }
        .en-vocab-review-log-body {
          max-height: min(70vh, 28rem);
          overflow-y: auto;
        }
        .en-vocab-review-log-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .en-vocab-review-log-item {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 0.65rem 0.75rem;
          background: rgba(0, 0, 0, 0.15);
        }
        .en-vocab-review-log-item-head {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem 0.75rem;
          align-items: baseline;
          margin-bottom: 0.35rem;
          font-size: 0.92rem;
        }
        .en-vocab-review-log-meta {
          opacity: 0.78;
          font-size: 0.82rem;
        }
        .en-vocab-review-log-overall {
          margin: 0 0 0.4rem;
          font-weight: 600;
        }
        .en-vocab-review-log-usages {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .en-vocab-review-log-usages li {
          display: grid;
          grid-template-columns: auto auto 1fr;
          gap: 0.35rem 0.5rem;
          align-items: start;
          font-size: 0.88rem;
        }
        .en-vocab-review-log-usage-label {
          font-weight: 600;
          white-space: nowrap;
        }
        .en-vocab-review-log-usage-level {
          color: #8ec5ff;
          white-space: nowrap;
        }
        .en-vocab-review-log-usage-text {
          opacity: 0.88;
          line-height: 1.35;
          word-break: break-word;
        }
        .en-vocab-review-log-no-usage {
          margin: 0;
          opacity: 0.8;
          font-size: 0.88rem;
        }
        @media (max-width: 767px) {
          .en-vocab-review-log-usages li {
            grid-template-columns: 1fr;
            gap: 0.15rem;
          }
        }
      `}</style>
    </>,
    document.body
  );
}
