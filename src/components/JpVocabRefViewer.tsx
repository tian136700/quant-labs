"use client";

import { useCallback, useState } from "react";
import {
  jpVocabRefApiPath,
  jpVocabRefFilename,
} from "@/lib/jp-vocab-ref-shared";
import type { JpVocabRef } from "@/lib/types";

type Props = {
  refMeta: JpVocabRef;
  cacheVersion?: string | null;
};

export function JpVocabRefViewer({ refMeta, cacheVersion }: Props) {
  const [downloading, setDownloading] = useState(false);
  const v = cacheVersion ?? refMeta.updated_at;
  const mediaUrl = jpVocabRefApiPath(refMeta.ref_key, { v });
  const downloadUrl = jpVocabRefApiPath(refMeta.ref_key, { download: true, v });
  const filename = jpVocabRefFilename(refMeta.ref_key, refMeta.media_type);
  const title = refMeta.title?.trim() || refMeta.ref_key;

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(downloadUrl, { credentials: "include" });
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }, [downloadUrl, downloading, filename]);

  return (
    <div className="jp-ref-viewer">
      <header className="jp-ref-viewer-toolbar">
        <div className="jp-ref-viewer-title-wrap">
          <h1 className="jp-ref-viewer-title">{title}</h1>
          <p className="jp-ref-viewer-subtitle">教案预览</p>
        </div>
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--primary jp-ref-viewer-download"
          onClick={() => void handleDownload()}
          disabled={downloading}
        >
          {downloading ? "下载中…" : "下载"}
        </button>
      </header>
      <div className="jp-ref-viewer-content">
        {refMeta.media_type === "pdf" ? (
          <iframe
            src={mediaUrl}
            title={title}
            className="jp-ref-viewer-pdf"
          />
        ) : (
          <img src={mediaUrl} alt={title} className="jp-ref-viewer-img" />
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
        .jp-ref-viewer-img {
          display: block;
          max-width: min(100%, 1200px);
          width: auto;
          height: auto;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: #fff;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
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
          .jp-ref-viewer-content {
            padding: 0.75rem;
          }
          .jp-ref-viewer-download {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
