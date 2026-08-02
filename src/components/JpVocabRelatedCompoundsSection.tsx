"use client";

import { useCallback, useMemo, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { copyTextToClipboard } from "@/lib/copy-text";
import {
  JP_VOCAB_RELATED_COMPOUNDS_EMPTY_CHECKED,
  JP_VOCAB_RELATED_COMPOUNDS_LABEL,
  filterJpVocabRelatedCompoundsSameReading,
  jpVocabRelatedCompoundsCopyText,
  parseJpVocabRelatedCompounds,
} from "@/lib/jp-vocab-related-compounds";

/** 抽问/带读/学生/复习卡：例句后展示「相关构词」 */
export function JpVocabRelatedCompoundsSection({
  relatedCompounds,
  relatedCompoundsSource,
  word,
  reading,
  /** 语法词条不展示 */
  kind,
}: {
  relatedCompounds?: string | null;
  relatedCompoundsSource?: string | null;
  /** 本词（用于过滤不同音读的脏数据） */
  word?: string | null;
  reading?: string | null;
  kind?: string | null;
}) {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const onCopied = useCallback((message: string) => setCopyToast(message), []);

  const items = useMemo(() => {
    const parsed = parseJpVocabRelatedCompounds(relatedCompounds);
    if (!word) return parsed;
    return filterJpVocabRelatedCompoundsSameReading(parsed, word, reading);
  }, [relatedCompounds, word, reading]);

  const sourceTrim = String(relatedCompoundsSource || "").trim();
  const checkedEmpty = items.length === 0 && Boolean(sourceTrim);

  if (kind === "grammar") return null;
  if (items.length === 0 && !checkedEmpty) return null;

  const copyText = jpVocabRelatedCompoundsCopyText(items);

  return (
    <section
      className="jp-vocab-teacher-quiz__related-compounds"
      aria-label={JP_VOCAB_RELATED_COMPOUNDS_LABEL}
    >
      <div className="jp-vocab-teacher-quiz__related-compounds-head">
        <div className="jp-vocab-teacher-quiz__related-compounds-head-left">
          <h3 className="jp-vocab-teacher-quiz__related-compounds-title">
            {JP_VOCAB_RELATED_COMPOUNDS_LABEL}
          </h3>
          {copyText ? (
            <button
              type="button"
              className="jp-vocab-flashcard-copy-btn jp-vocab-related-compounds-copy-all-btn"
              title="复制全部相关构词"
              aria-label="复制全部相关构词"
              onClick={(e) => {
                e.stopPropagation();
                void copyTextToClipboard(copyText).then((ok) =>
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
              <span>复制全部</span>
            </button>
          ) : null}
        </div>
      </div>

      {checkedEmpty ? (
        <p className="jp-vocab-teacher-quiz__related-compounds-empty">
          {JP_VOCAB_RELATED_COMPOUNDS_EMPTY_CHECKED}
        </p>
      ) : (
        <p className="jp-vocab-teacher-quiz__related-compounds-flow">
          {items.map((item) => (
            <span
              key={item.line}
              className="jp-vocab-teacher-quiz__related-compounds-unit"
            >
              {/* 整词一块：假名居中在词面正下方（勿再拼括号走解析，避免焚き火拆坏） */}
              <span
                className="jp-vocab-teacher-quiz__related-compounds-jp jp-vocab-furigana-unit"
                title={item.reading}
              >
                <span className="jp-vocab-furigana-base">{item.surface}</span>
                <span
                  className="jp-vocab-furigana-reading"
                  aria-hidden="true"
                >
                  {item.reading}
                </span>
              </span>
              <span className="jp-vocab-teacher-quiz__related-compounds-zh">
                {item.gloss}
              </span>
              <span className="jp-vocab-teacher-quiz__related-compounds-semi">
                ；
              </span>
            </span>
          ))}
        </p>
      )}

      {/* 来源固定在块底右下（文档流 text-align:right，勿 absolute） */}
      {sourceTrim ? (
        <div className="jp-vocab-teacher-quiz__related-compounds-source">
          <JpVocabSourceLabel source={relatedCompoundsSource} />
        </div>
      ) : null}

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />

      <style jsx global>{`
        .jp-vocab-related-compounds-copy-all-btn.jp-vocab-flashcard-copy-btn {
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
        .jp-vocab-related-compounds-copy-all-btn.jp-vocab-flashcard-copy-btn:hover {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }
        @media (max-width: 1024px) {
          .jp-vocab-related-compounds-copy-all-btn.jp-vocab-flashcard-copy-btn {
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
