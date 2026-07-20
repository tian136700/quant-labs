"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { JpVocabRefCropKind } from "@/lib/jp-vocab-ref-pdf-export";

type CopyMode = "withText" | "linkOnly";

type Props = {
  lessonId: number;
  viewUrl: string;
  siteUrl: string;
  copyCount?: number;
  primaryClassName?: string;
  fixedPanel?: boolean;
  copiedId: number | null;
  onCopied: (lessonId: number) => void;
  onCopyError: () => void;
  icon?: ReactNode;
  /** 有教案图时可复制分页 PDF */
  pdfMediaUrl?: string | null;
  pdfFilename?: string | null;
  pdfCropKind?: JpVocabRefCropKind | null;
};

const COPY_WITH_TEXT =
  "老师，这是咱们需要上课内容，麻烦你有时间的时候抽空看一下：";

export function JpLessonCopyMenu({
  lessonId,
  viewUrl,
  siteUrl,
  copyCount = 0,
  primaryClassName = "jp-lesson-action-btn",
  fixedPanel = false,
  copiedId,
  onCopied,
  onCopyError,
  icon,
  pdfMediaUrl = null,
  pdfFilename = null,
  pdfCropKind = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const canCopyPdf = Boolean(pdfMediaUrl && pdfFilename);

  const updatePanelStyle = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const panelHeight = canCopyPdf ? 198 : 132;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < panelHeight + gap;
    setPanelStyle({
      position: "fixed",
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap, top: "auto" }
        : { top: rect.bottom + gap, bottom: "auto" }),
      right: Math.max(8, window.innerWidth - rect.right),
      left: "auto",
      zIndex: 10000,
    });
  }, [canCopyPdf]);

  const toggleOpen = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (pdfBusy) return;
      setOpen((prev) => {
        const next = !prev;
        if (next && fixedPanel) updatePanelStyle();
        return next;
      });
    },
    [fixedPanel, pdfBusy, updatePanelStyle]
  );

  useEffect(() => {
    if (!open) return;
    if (fixedPanel) updatePanelStyle();

    const onDoc = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScrollOrResize = () => {
      if (fixedPanel) updatePanelStyle();
      else setOpen(false);
    };

    // Defer so the opening tap does not immediately close the menu (mobile).
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDoc);
    }, 0);

    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, fixedPanel, updatePanelStyle]);

  const copyLessonLink = async (mode: CopyMode) => {
    try {
      const link = `${siteUrl}${viewUrl}`;
      const text = mode === "withText" ? `${COPY_WITH_TEXT}${link}` : link;
      await navigator.clipboard.writeText(text);
      onCopied(lessonId);
      setOpen(false);
    } catch {
      onCopyError();
    }
  };

  const pickCopyMode = (mode: CopyMode) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void copyLessonLink(mode);
  };

  const copyPaginatedPdf = async (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pdfMediaUrl || !pdfFilename || pdfBusy) return;
    setPdfBusy(true);
    setOpen(false);
    try {
      const { copyJpVocabRefPaginatedPdf } = await import("@/lib/jp-vocab-ref-pdf-export");
      const result = await copyJpVocabRefPaginatedPdf(
        pdfMediaUrl,
        pdfFilename,
        pdfCropKind
      );
      if (result === "copied") {
        onCopied(lessonId);
        window.alert("分页 PDF 已复制，可直接粘贴发送");
      } else if (result === "downloaded") {
        window.alert(
          "当前浏览器无法把 PDF 直接放进剪贴板，已改为下载。下载完成后可在「下载」文件夹里复制发送。"
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      onCopyError();
      window.alert(
        err instanceof Error ? err.message : "复制分页 PDF 失败，请稍后重试"
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const label =
    pdfBusy ? "复制 PDF…" : copiedId === lessonId ? "已复制" : "复制";

  return (
    <div className={`jp-lesson-copy-menu${open ? " is-open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className={`${primaryClassName} jp-lesson-copy-trigger`}
        onClick={toggleOpen}
        disabled={pdfBusy}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {icon}
        {label}
        <span className="jp-lesson-copy-caret" aria-hidden>
          ▾
        </span>
        {copyCount > 0 ? (
          <span className="jp-lesson-copy-count" aria-label={`已复制 ${copyCount} 次`}>
            {copyCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className={`jp-lesson-copy-panel${fixedPanel ? " is-fixed" : ""}`}
          style={fixedPanel ? panelStyle : undefined}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="jp-lesson-copy-item"
            onPointerDown={pickCopyMode("withText")}
          >
            <span className="jp-lesson-copy-item-title">带文字</span>
            <span className="jp-lesson-copy-item-desc">附带发给老师的说明</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="jp-lesson-copy-item"
            onPointerDown={pickCopyMode("linkOnly")}
          >
            <span className="jp-lesson-copy-item-title">仅链接</span>
            <span className="jp-lesson-copy-item-desc">只复制教案查看地址</span>
          </button>
          {canCopyPdf ? (
            <button
              type="button"
              role="menuitem"
              className="jp-lesson-copy-item"
              onPointerDown={(e) => void copyPaginatedPdf(e)}
            >
              <span className="jp-lesson-copy-item-title">分页 PDF</span>
              <span className="jp-lesson-copy-item-desc">
                一步复制文件；不支持则分享或下载
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
