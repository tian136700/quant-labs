"use client";

import { useEffect, useState } from "react";
import { JpVocabRefDownloadMenu } from "@/components/JpVocabRefDownloadMenu";
import {
  useVocabRefImageZoom,
  VocabRefImageZoomButtons,
  VocabRefImageZoomStage,
} from "@/components/VocabRefImageZoom";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import {
  jpVocabRefApiPath,
  jpVocabRefFilename,
} from "@/lib/jp-vocab-ref-shared";
import type { JpVocabRef } from "@/lib/types";

type Props = {
  refMeta: JpVocabRef;
  cacheVersion?: string | null;
  /** 新课下载名（有关联 lesson 时由服务端传入） */
  downloadFilename?: string;
};

export function JpVocabRefViewer({
  refMeta,
  cacheVersion,
  downloadFilename,
}: Props) {
  const { isAdmin } = useEtrAuth();
  const v = cacheVersion ?? refMeta.updated_at;
  const mediaUrl = jpVocabRefApiPath(refMeta.ref_key, { v });
  const downloadUrl = jpVocabRefApiPath(refMeta.ref_key, { download: true, v });
  const filename =
    downloadFilename?.trim() ||
    jpVocabRefFilename(refMeta.ref_key, refMeta.media_type);
  const title = refMeta.title?.trim() || refMeta.ref_key;
  const isPdf = refMeta.media_type === "pdf";
  const zoomApi = useVocabRefImageZoom(isPdf ? undefined : `${refMeta.ref_key}:${v ?? ""}`);
  const [coarsePointer, setCoarsePointer] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const onChange = () => setCoarsePointer(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const zoomHint = coarsePointer
    ? "单指拖动 · 双指缩放 · ± 按钮"
    : "拖动平移 · 滚轮缩放 · ± 按钮";

  return (
    <div className="jp-ref-viewer">
      <header className="jp-ref-viewer-toolbar">
        <div className="jp-ref-viewer-title-wrap">
          <h1 className="jp-ref-viewer-title">{title}</h1>
          <p className="jp-ref-viewer-subtitle">
            {isPdf ? "教案预览" : `教案预览 · ${zoomHint}`}
          </p>
        </div>
        <div className="jp-ref-viewer-actions">
          {!isPdf ? (
            <VocabRefImageZoomButtons
              api={zoomApi}
              className="jp-ref-viewer-zoom-tools"
              buttonClassName="jp-ref-viewer-zoom-btn"
            />
          ) : null}
          <JpVocabRefDownloadMenu
            downloadUrl={downloadUrl}
            mediaUrl={mediaUrl}
            filename={filename}
            mediaType={refMeta.media_type}
            className="jp-ref-viewer-download"
            allowOriginalDownload={isAdmin}
          />
        </div>
      </header>
      <div className={`jp-ref-viewer-content${isPdf ? "" : " jp-ref-viewer-content--zoom"}`}>
        {isPdf ? (
          <iframe
            src={mediaUrl}
            title={title}
            className="jp-ref-viewer-pdf"
          />
        ) : (
          <VocabRefImageZoomStage
            api={zoomApi}
            mediaUrl={mediaUrl}
            title={title}
            stageClassName="jp-ref-viewer-zoom-stage"
            canvasClassName="jp-ref-viewer-zoom-canvas"
            imageClassName="jp-ref-viewer-img"
          />
        )}
      </div>
      <style jsx>{`
        .jp-ref-viewer {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: var(--bg);
          color: var(--text);
        }
        .jp-ref-viewer-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem 1rem;
          padding: 0.85rem 1rem;
          border-bottom: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .jp-ref-viewer-title-wrap {
          min-width: 0;
        }
        .jp-ref-viewer-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          line-height: 1.35;
          word-break: break-word;
        }
        .jp-ref-viewer-subtitle {
          margin: 0.15rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-ref-viewer-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }
        :global(.jp-ref-viewer-zoom-tools) {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        :global(.jp-ref-viewer-zoom-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 2rem;
          height: 2rem;
          padding: 0 0.55rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          cursor: pointer;
        }
        :global(.jp-ref-viewer-zoom-btn:disabled) {
          opacity: 0.45;
          cursor: not-allowed;
        }
        :global(.jp-ref-viewer-zoom-btn:not(:disabled):hover) {
          border-color: var(--accent);
          color: var(--accent);
        }
        .jp-ref-viewer-download {
          flex-shrink: 0;
        }
        .jp-ref-viewer-content {
          flex: 1;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 1rem;
          min-height: 0;
        }
        .jp-ref-viewer-content--zoom {
          padding: 0;
          overflow: hidden;
        }
        :global(.jp-ref-viewer-zoom-stage) {
          flex: 1;
          width: 100%;
          min-height: 0;
          overflow: auto;
          cursor: grab;
          touch-action: none;
          -webkit-overflow-scrolling: touch;
        }
        :global(.jp-ref-viewer-zoom-stage:active) {
          cursor: grabbing;
        }
        :global(.jp-ref-viewer-zoom-canvas) {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 100%;
          min-height: 100%;
          padding: 1rem;
          box-sizing: border-box;
        }
        :global(.jp-ref-viewer-img) {
          display: block;
          max-width: none;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: #fff;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
          user-select: none;
          -webkit-user-drag: none;
        }
        .jp-ref-viewer-pdf {
          width: min(100%, 960px);
          height: calc(100dvh - 5.5rem);
          min-height: 480px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
        }
        @media (max-width: 480px) {
          .jp-ref-viewer-toolbar {
            padding: 0.75rem;
          }
          .jp-ref-viewer-actions {
            width: 100%;
            justify-content: space-between;
          }
          :global(.jp-ref-viewer-zoom-btn) {
            min-width: 2.75rem;
            height: 2.75rem;
          }
          .jp-ref-viewer-download {
            flex: 1;
            justify-content: center;
          }
          :global(.jp-ref-viewer-zoom-canvas) {
            padding: 0.75rem;
          }
          .jp-ref-viewer-pdf {
            width: 100%;
            min-height: calc(100dvh - 6.5rem);
          }
        }
      `}</style>
    </div>
  );
}
