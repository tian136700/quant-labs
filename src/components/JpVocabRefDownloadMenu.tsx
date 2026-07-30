"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { JpVocabMediaType } from "@/lib/types";
import { saveVocabRefImageToDevice } from "@/lib/vocab-ref-save-image";

async function downloadBlobAsFile(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type Props = {
  downloadUrl: string;
  mediaUrl: string;
  filename: string;
  mediaType: JpVocabMediaType;
  className?: string;
  primaryClassName?: string;
  /** 表格等滚动容器内用 fixed 定位，避免下拉被裁切 */
  fixedPanel?: boolean;
  /** 管理员可下载原图（附件）；所有人另有「保存图片」进相册/分享 */
  allowOriginalDownload?: boolean;
  /** 语法/单词分路径切段；不传则从下载名推断 */
  cropKind?: "word" | "grammar" | null;
  /** 保存/下载结果短提示（可接 CopyToast） */
  onStatus?: (message: string) => void;
};

type BusyKind = "image" | "pdf" | "word" | "copyPdf";

function PaginatedFormatMenu({
  onSaveImage,
  onPdf,
  onCopyPdf,
  onWord,
  busy,
  className,
  primaryClassName,
  fixedPanel,
}: {
  onSaveImage: () => void;
  onPdf: () => void;
  onCopyPdf: () => void;
  onWord: () => void;
  busy: BusyKind | null;
  className?: string;
  primaryClassName: string;
  fixedPanel: boolean;
}) {
  const [open, setOpen] = useState(false);
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

  const label =
    busy === "image"
      ? "保存中…"
      : busy === "pdf"
        ? "生成 PDF…"
        : busy === "copyPdf"
          ? "复制 PDF…"
          : busy === "word"
            ? "生成 Word…"
            : "下载";

  return (
    <div className={`jp-ref-download-menu${open ? " is-open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className={`${primaryClassName} jp-ref-download-trigger ${className ?? ""}`.trim()}
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
            onClick={() => {
              setOpen(false);
              onSaveImage();
            }}
          >
            <span className="jp-ref-download-item-title">保存图片</span>
            <span className="jp-ref-download-item-desc">
              iPhone 选「存储图像」进相册；也可分享/下载
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="jp-ref-download-item"
            onClick={() => {
              setOpen(false);
              onPdf();
            }}
          >
            <span className="jp-ref-download-item-title">分页 PDF</span>
            <span className="jp-ref-download-item-desc">按部分分页，留白供备注</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="jp-ref-download-item"
            onClick={() => {
              setOpen(false);
              onCopyPdf();
            }}
          >
            <span className="jp-ref-download-item-title">复制分页 PDF</span>
            <span className="jp-ref-download-item-desc">
              一步复制文件；不支持则分享或下载
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="jp-ref-download-item"
            onClick={() => {
              setOpen(false);
              onWord();
            }}
          >
            <span className="jp-ref-download-item-title">分页 Word</span>
            <span className="jp-ref-download-item-desc">两部分同页，中间留白供板书</span>
          </button>
        </div>
      ) : null}
      <style jsx>{downloadMenuStyles}</style>
    </div>
  );
}

export function JpVocabRefDownloadMenu({
  downloadUrl,
  mediaUrl,
  filename,
  mediaType,
  className = "",
  primaryClassName = "btn-rsi-filter btn-rsi-filter--primary",
  fixedPanel = false,
  allowOriginalDownload = false,
  cropKind = null,
  onStatus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<BusyKind | null>(null);
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
      onStatus?.("原图已下载");
    } catch {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(null);
    }
  }, [busy, downloadUrl, filename, onStatus]);

  const saveImage = useCallback(async () => {
    if (busy) return;
    setBusy("image");
    setOpen(false);
    try {
      const result = await saveVocabRefImageToDevice({
        imageUrl: mediaUrl,
        filename,
      });
      if (result === "shared") {
        onStatus?.("请在分享面板选择「存储图像」");
      } else if (result === "downloaded") {
        onStatus?.("图片已下载");
      }
    } catch {
      onStatus?.("保存失败，请稍后重试");
    } finally {
      setBusy(null);
    }
  }, [busy, mediaUrl, filename, onStatus]);

  const downloadPaginatedPdf = useCallback(async () => {
    if (busy) return;
    setBusy("pdf");
    setOpen(false);
    try {
      const { exportJpVocabRefPaginatedPdf } = await import("@/lib/jp-vocab-ref-pdf-export");
      await exportJpVocabRefPaginatedPdf(mediaUrl, filename, cropKind);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "分页 PDF 生成失败，请稍后重试"
      );
    } finally {
      setBusy(null);
    }
  }, [busy, mediaUrl, filename, cropKind]);

  const copyPaginatedPdf = useCallback(async () => {
    if (busy) return;
    setBusy("copyPdf");
    setOpen(false);
    try {
      const { copyJpVocabRefPaginatedPdf } = await import("@/lib/jp-vocab-ref-pdf-export");
      const result = await copyJpVocabRefPaginatedPdf(mediaUrl, filename, cropKind);
      if (result === "copied") {
        window.alert("分页 PDF 已复制，可直接粘贴发送");
      } else if (result === "downloaded") {
        window.alert(
          "当前浏览器无法把 PDF 直接放进剪贴板，已改为下载。下载完成后可在「下载」文件夹里复制发送。"
        );
      }
      // shared：系统分享面板已接管，无需再提示
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      window.alert(
        err instanceof Error ? err.message : "复制分页 PDF 失败，请稍后重试"
      );
    } finally {
      setBusy(null);
    }
  }, [busy, mediaUrl, filename, cropKind]);

  const downloadPaginatedWord = useCallback(async () => {
    if (busy) return;
    setBusy("word");
    setOpen(false);
    try {
      const { exportJpVocabRefPaginatedDocx } = await import("@/lib/jp-vocab-ref-pdf-export");
      await exportJpVocabRefPaginatedDocx(mediaUrl, filename, cropKind);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "分页 Word 生成失败，请稍后重试"
      );
    } finally {
      setBusy(null);
    }
  }, [busy, mediaUrl, filename, cropKind]);

  const isImage = mediaType === "image";
  const label =
    busy === "image"
      ? "保存中…"
      : busy === "pdf"
        ? "生成 PDF…"
        : busy === "copyPdf"
          ? "复制 PDF…"
          : busy === "word"
            ? "生成 Word…"
            : "下载";

  if (isImage && !allowOriginalDownload) {
    return (
      <PaginatedFormatMenu
        onSaveImage={() => void saveImage()}
        onPdf={() => void downloadPaginatedPdf()}
        onCopyPdf={() => void copyPaginatedPdf()}
        onWord={() => void downloadPaginatedWord()}
        busy={busy}
        className={className}
        primaryClassName={primaryClassName}
        fixedPanel={fixedPanel}
      />
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
            onClick={() => void saveImage()}
          >
            <span className="jp-ref-download-item-title">保存图片</span>
            <span className="jp-ref-download-item-desc">
              iPhone 选「存储图像」进相册；也可分享/下载
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="jp-ref-download-item"
            onClick={() => void downloadOriginal()}
          >
            <span className="jp-ref-download-item-title">原图附件</span>
            <span className="jp-ref-download-item-desc">完整教案 PNG（下载文件）</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="jp-ref-download-item"
            onClick={() => void downloadPaginatedPdf()}
          >
            <span className="jp-ref-download-item-title">分页 PDF</span>
            <span className="jp-ref-download-item-desc">按部分分页，留白供备注</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="jp-ref-download-item"
            onClick={() => void copyPaginatedPdf()}
          >
            <span className="jp-ref-download-item-title">复制分页 PDF</span>
            <span className="jp-ref-download-item-desc">
              一步复制文件；不支持则分享或下载
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="jp-ref-download-item"
            onClick={() => void downloadPaginatedWord()}
          >
            <span className="jp-ref-download-item-title">分页 Word</span>
            <span className="jp-ref-download-item-desc">两部分同页，中间留白供板书</span>
          </button>
        </div>
      ) : null}
      <style jsx>{downloadMenuStyles}</style>
    </div>
  );
}

const downloadMenuStyles = `
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
`;
