"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { JpVocabExportScope } from "@/lib/jp-vocab-export";

type Props = {
  open: boolean;
  busy?: boolean;
  todayWeakCount: number;
  allCount: number;
  onClose: () => void;
  onExport: (scope: JpVocabExportScope) => void;
  onExportExcel?: () => void;
  onExportToCoach?: () => void;
};

export function JpVocabExportChoiceModal({
  open,
  busy = false,
  todayWeakCount,
  allCount,
  onClose,
  onExport,
  onExportExcel,
  onExportToCoach,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="jp-vocab-export-modal-overlay"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="jp-vocab-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-vocab-export-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-vocab-export-modal-header">
          <h2 id="jp-vocab-export-modal-title" className="jp-vocab-export-modal-title">
            选择导出范围
          </h2>
          <button
            type="button"
            className="jp-vocab-export-modal-close"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="jp-vocab-export-modal-body">
          <p>
            <strong>导出 Word</strong>：生成 .docx 文档（序号、日语、读音、类型、备注图片等）。
          </p>
          <p>
            <strong>导出全部数据</strong>：导出当前单词表全部 {allCount} 条到 Word。
          </p>
          <p>
            <strong>导出今日未掌握（Word）</strong>：仅导出今日勾选为「一般」或「不熟悉」的词条（当前{" "}
            {todayWeakCount} 条）。
          </p>
          <p>
            <strong>导出 Excel（复习次数）</strong>：导出全部 {allCount}{" "}
            条的单词 ID、名字、不熟悉/一般/非常熟悉次数、总共抽查次数与抽查优先级（.xlsx）；
            文件最前面有一张「规则说明」表，写明现行算法，可直接丢给 AI 复盘。
          </p>
          <p>
            <strong>导出到课堂带读</strong>：将今日「一般」「不熟悉」词条（{todayWeakCount}{" "}
            条）合并进课堂带读队列（自动剔除已带读、与未带读去重）；备注与抽问页同步，带读页可修改熟悉程度与编辑词条。
          </p>
        </div>
        <div className="jp-vocab-export-modal-footer">
          <button
            type="button"
            className="btn-rsi-filter"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className="btn-rsi-filter"
            onClick={() => onExportToCoach?.()}
            disabled={busy || todayWeakCount <= 0 || !onExportToCoach}
            title={
              todayWeakCount <= 0
                ? "今日暂无勾选为「一般」或「不熟悉」的词条"
                : undefined
            }
          >
            导出到课堂带读
          </button>
          <button
            type="button"
            className="btn-rsi-filter"
            onClick={() => onExport("today_weak")}
            disabled={busy || todayWeakCount <= 0}
            title={
              todayWeakCount <= 0
                ? "今日暂无勾选为「一般」或「不熟悉」的词条"
                : undefined
            }
          >
            导出今日未掌握
          </button>
          <button
            type="button"
            className="btn-rsi-filter"
            onClick={() => onExportExcel?.()}
            disabled={busy || allCount <= 0 || !onExportExcel}
            title="导出复习次数统计为 Excel（.xlsx）"
          >
            导出 Excel（复习次数）
          </button>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            onClick={() => onExport("all")}
            disabled={busy || allCount <= 0}
          >
            导出全部数据
          </button>
        </div>
      </div>
      <style jsx>{`
        .jp-vocab-export-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(0.75rem, 3vw, 1.25rem);
          background: rgba(8, 12, 18, 0.72);
          backdrop-filter: blur(2px);
        }
        .jp-vocab-export-modal {
          width: min(34rem, 96vw);
          display: flex;
          flex-direction: column;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-vocab-export-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem 1rem 0.75rem;
          border-bottom: 1px solid var(--border);
        }
        .jp-vocab-export-modal-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 600;
        }
        .jp-vocab-export-modal-close {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 1.35rem;
          line-height: 1;
          cursor: pointer;
          padding: 0.1rem 0.35rem;
        }
        .jp-vocab-export-modal-close:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .jp-vocab-export-modal-body {
          padding: 0.85rem 1rem 1rem;
          color: var(--muted);
          font-size: 0.9rem;
          line-height: 1.55;
        }
        .jp-vocab-export-modal-body p {
          margin: 0 0 0.75rem;
        }
        .jp-vocab-export-modal-body p:last-child {
          margin-bottom: 0;
        }
        .jp-vocab-export-modal-body strong {
          color: var(--text);
        }
        .jp-vocab-export-modal-footer {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.75rem 1rem 1rem;
          border-top: 1px solid var(--border);
        }
        @media (max-width: 768px) {
          .jp-vocab-export-modal-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-vocab-export-modal {
            width: 100%;
            max-height: min(92vh, 100%);
            border-radius: 16px 16px 0 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }
          .jp-vocab-export-modal-header {
            position: sticky;
            top: 0;
            z-index: 1;
            background: var(--panel);
          }
          .jp-vocab-export-modal-body {
            font-size: 0.875rem;
          }
          .jp-vocab-export-modal-footer {
            flex-direction: column;
            align-items: stretch;
            position: sticky;
            bottom: 0;
            background: var(--panel);
            padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
          }
          .jp-vocab-export-modal-footer :global(.btn-rsi-filter) {
            width: 100%;
            min-height: 2.75rem;
            justify-content: center;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
