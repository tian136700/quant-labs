"use client";

import { useCallback, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { copyTextToClipboard } from "@/lib/copy-text";
import { hasJpVocabConnection } from "@/lib/jp-vocab-connection-ai";

type Props = {
  connection: string | null | undefined;
  connectionSource?: string | null;
  emptyText?: string;
  /** 无内容时是否仍渲染区块（编辑预览用） */
  showWhenEmpty?: boolean;
};

/** 抽问卡：用法/例句下方的「接序」模块 */
export function JpVocabConnectionSection({
  connection,
  connectionSource,
  emptyText = "暂无接序",
  showWhenEmpty = false,
}: Props) {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const onCopied = useCallback((message: string) => setCopyToast(message), []);
  const text = String(connection ?? "").trim();
  const has = hasJpVocabConnection(text);
  if (!has && !showWhenEmpty) return null;

  return (
    <section
      className="jp-vocab-teacher-quiz__connection"
      aria-label="接序"
    >
      <div className="jp-vocab-teacher-quiz__connection-head">
        <h3 className="jp-vocab-teacher-quiz__connection-title">接序</h3>
        {has ? (
          <button
            type="button"
            className="jp-vocab-flashcard-copy-btn jp-vocab-connection-copy-btn"
            title="复制接序"
            aria-label="复制接序"
            onClick={(e) => {
              e.stopPropagation();
              void copyTextToClipboard(text).then((ok) =>
                onCopied(ok ? "复制成功" : "复制失败")
              );
            }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
              <rect
                x="7"
                y="7"
                width="9"
                height="9"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M5 13H4.5A1.5 1.5 0 0 1 3 11.5v-8A1.5 1.5 0 0 1 4.5 2h8A1.5 1.5 0 0 1 14 3.5V4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            <span>复制</span>
          </button>
        ) : null}
      </div>
      <div className="jp-vocab-teacher-quiz__connection-body">
        {has ? (
          <pre className="jp-vocab-teacher-quiz__connection-text">{text}</pre>
        ) : (
          <p className="jp-vocab-teacher-quiz__connection-empty">{emptyText}</p>
        )}
        {connectionSource?.trim() ? (
          <JpVocabSourceLabel source={connectionSource.trim()} />
        ) : null}
      </div>

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />

      <style jsx global>{`
        .jp-vocab-flashcard-copy-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 0.2rem;
          padding: 0.2rem 0.45rem;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg) 70%, var(--panel));
          color: var(--muted);
          font-size: 0.6875rem;
          font-weight: 500;
          line-height: 1;
          cursor: pointer;
        }
        .jp-vocab-flashcard-copy-btn:hover {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }
        @media (max-width: 1024px) {
          .jp-vocab-flashcard-copy-btn.jp-vocab-connection-copy-btn {
            min-height: 2.75rem;
            padding: 0.4rem 0.65rem;
            font-size: 0.8125rem;
            touch-action: manipulation;
          }
        }
      `}</style>
    </section>
  );
}
