"use client";

import { EnVocabRefDownloadMenu } from "@/components/EnVocabRefDownloadMenu";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import {
  enVocabRefApiPath,
  enVocabRefFilename,
} from "@/lib/en-vocab-ref-shared";
import type { EnVocabRef } from "@/lib/types";

type Props = {
  refMeta: EnVocabRef;
  cacheVersion?: string | null;
  /** 新课下载名（有关联 lesson 时由服务端传入） */
  downloadFilename?: string;
  /** 关联新课类型：语法/单词分页切段分路径 */
  cropKind?: "word" | "grammar" | null;
};

export function EnVocabRefViewer({
  refMeta,
  cacheVersion,
  downloadFilename,
  cropKind = null,
}: Props) {
  const { isAdmin } = useEtrAuth();
  const v = cacheVersion ?? refMeta.updated_at;
  const mediaUrl = enVocabRefApiPath(refMeta.ref_key, { v });
  const downloadUrl = enVocabRefApiPath(refMeta.ref_key, { download: true, v });
  const filename =
    downloadFilename?.trim() ||
    enVocabRefFilename(refMeta.ref_key, refMeta.media_type);
  const title = refMeta.title?.trim() || refMeta.ref_key;

  return (
    <div className="jp-ref-viewer">
      <header className="jp-ref-viewer-toolbar">
        <div className="jp-ref-viewer-title-wrap">
          <h1 className="jp-ref-viewer-title">{title}</h1>
          <p className="jp-ref-viewer-subtitle">教案预览</p>
        </div>
        <EnVocabRefDownloadMenu
          downloadUrl={downloadUrl}
          mediaUrl={mediaUrl}
          filename={filename}
          mediaType={refMeta.media_type}
          className="jp-ref-viewer-download"
          allowOriginalDownload={isAdmin}
          cropKind={cropKind}
        />
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
