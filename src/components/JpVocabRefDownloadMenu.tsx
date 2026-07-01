"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  downloadBlobAsFile,
  exportJpVocabRefPaginatedPdf,
} from "@/lib/jp-vocab-ref-pdf-export";
import type { JpVocabMediaType } from "@/lib/types";

type Props = {
  downloadUrl: string;
  mediaUrl: string;
  filename: string;
  mediaType: JpVocabMediaType;
  className?: string;
  primaryClassName?: string;
  /** 表格等滚动容器内用 fixed 定位，避免下拉被裁切 */
  fixedPanel?: boolean;
  /** 管理员可下载原图；非管理员仅提供分页 PDF */
  allowOriginalDownload?: boolean;
};

export function JpVocabRefDownloadMenu({
  downloadUrl,
  mediaUrl,
  filename,
  mediaType,
  className = "",
  primaryClassName = "btn-rsi-filter btn-rsi-filter--primary",
  fixedPanel = false,
  allowOriginalDownload = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"image" | "pdf" | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next && fixedPanel && wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setPanelStyle({
          position: "fixed",
          top: rect.bottom + 4,
          right: Math.max(8, window.innerWidth - rect.right),
          left: "auto",
        });
      }
      return next;
    });
  }, [fixedPanel]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const downloadOriginal = useCallback(async () => {
    if (busy) return;
    setBusy("image");
    setOpen(false);
    try {
      const res = await fetch(downloadUrl, { credentials: "include" });
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      await downloadBlobAsFile(blob, filename);
    } catch {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(null);
    }
  }, [busy, downloadUrl, filename]);

  const downloadPaginatedPdf = useCallback(async () => {
    if (busy) return;
    setBusy("pdf");
    setOpen(false);
    try {
      await exportJpVocabRefPaginatedPdf(mediaUrl, filename);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "分页 PDF 生成失败，请稍后重试"
      );
    } finally {
      setBusy(null);
    }
  }, [busy, mediaUrl, filename]);

  const isImage = mediaType === "image";
  const label =
    busy === "image"
      ? "下载中…"
      : busy === "pdf"
        ? "生成 PDF…"
        : isImage && !allowOriginalDownload
          ? "下载 PDF"
          : "下载";

  if (isImage && !allowOriginalDownload) {
    return (
      <button
        type="button"
        className={`${primaryClassName} ${className}`.trim()}
        onClick={() => void downloadPaginatedPdf()}
        disabled={busy != null}
      >
        {label}
      </button>
    );
  }

  if (!isImage) {
    return (
      <button
        type="button"
        className={`${primaryClassName} ${className}`.trim()}
        onClick={() => void downloadOriginal()}
        disabled={busy != null}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={`jp-ref-download-menu${open ? " is-open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className={`${primaryClassName} jp-ref-download-trigger ${className}`.trim()}
        onClick={toggleOpen}
        disabled={busy != null}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <span className="jp-ref-download-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          className={`jp-ref-download-panel${fixedPanel ? " is-fixed" : ""}`}
          style={fixedPanel ? panelStyle : undefined}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="jp-ref-download-item"
            onClick={() => void downloadOriginal()}
          >
            <span className="jp-ref-download-item-title">原图</span>
            <span className="jp-ref-download-item-desc">完整教案 PNG</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="jp-ref-download-item"
            onClick={() => void downloadPaginatedPdf()}
          >
            <span className="jp-ref-download-item-title">分页 PDF</span>
            <span className="jp-ref-download-item-desc">
              按部分分页，留白供备注
            </span>
          </button>
        </div>
      ) : null}
      <style jsx>{`
        .jp-ref-download-menu {
          position: relative;
          flex-shrink: 0;
        }
        .jp-ref-download-trigger {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .jp-ref-download-caret {
          font-size: 0.75rem;
          opacity: 0.85;
        }
        .jp-ref-download-panel {
          position: absolute;
          top: calc(100% + 0.35rem);
          right: 0;
          min-width: 11.5rem;
          padding: 0.35rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--panel);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
          z-index: 30;
        }
        .jp-ref-download-panel.is-fixed {
          z-index: 1000;
        }
        .jp-ref-download-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.1rem;
          width: 100%;
          padding: 0.55rem 0.65rem;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text);
          text-align: left;
          cursor: pointer;
        }
        .jp-ref-download-item:hover {
          background: color-mix(in srgb, var(--accent) 12%, transparent);
        }
        .jp-ref-download-item-title {
          font-size: 0.875rem;
          font-weight: 600;
        }
        .jp-ref-download-item-desc {
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.35;
        }
      `}</style>
    </div>
  );
}
