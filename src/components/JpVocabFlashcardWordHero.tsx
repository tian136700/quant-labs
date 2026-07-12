"use client";

import { useCallback, useState, type ReactNode } from "react";
import { CopyToast } from "@/components/CopyToast";
import { copyTextToClipboard } from "@/lib/copy-text";
import type { JpVocabRef } from "@/lib/types";

type Props = {
  readingTrim: string;
  wordTrim: string;
  refKey?: string | null;
  ref?: JpVocabRef;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  titleId?: string;
};

function FlashcardCopyBtn({
  text,
  onCopied,
}: {
  text: string;
  onCopied: (message: string) => void;
}) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  return (
    <button
      type="button"
      className="jp-vocab-flashcard-copy-btn"
      title={`复制「${trimmed}」`}
      aria-label={`复制「${trimmed}」`}
      onClick={(e) => {
        e.stopPropagation();
        void copyTextToClipboard(trimmed).then((ok) =>
          onCopied(ok ? "已复制" : "复制失败")
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
  );
}

function HeroTerm({
  children,
  copyText,
  onCopied,
}: {
  children: ReactNode;
  copyText: string;
  onCopied: (message: string) => void;
}) {
  return (
    <span className="jp-vocab-teacher-quiz__hero-term">
      {children}
      <FlashcardCopyBtn text={copyText} onCopied={onCopied} />
    </span>
  );
}

export function JpVocabFlashcardWordHero({
  readingTrim,
  wordTrim,
  refKey,
  ref,
  onOpenRef,
  titleId,
}: Props) {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const onCopied = useCallback((message: string) => setCopyToast(message), []);

  const showReadingPrimary = Boolean(readingTrim);
  const showKanjiAside =
    showReadingPrimary && Boolean(wordTrim) && wordTrim !== readingTrim;

  const renderReading = () =>
    refKey ? (
      <button
        type="button"
        className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__reading"
        title={ref?.title ? `教案：${ref.title}` : "查看教案"}
        onClick={() => onOpenRef(refKey, ref)}
      >
        {readingTrim}
      </button>
    ) : (
      <span className="jp-vocab-teacher-quiz__reading">{readingTrim}</span>
    );

  const renderKanji = () =>
    refKey ? (
      <button
        type="button"
        className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__kanji"
        title={ref?.title ? `教案：${ref.title}` : "查看教案"}
        onClick={() => onOpenRef(refKey, ref)}
      >
        {wordTrim}
      </button>
    ) : (
      <span className="jp-vocab-teacher-quiz__kanji">{wordTrim}</span>
    );

  const renderWordMain = () =>
    refKey ? (
      <button
        type="button"
        className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__word-main"
        title={ref?.title ? `教案：${ref.title}` : "查看教案"}
        onClick={() => onOpenRef(refKey, ref)}
      >
        {wordTrim || "—"}
      </button>
    ) : (
      <span className="jp-vocab-teacher-quiz__word-main">{wordTrim || "—"}</span>
    );

  return (
    <>
      <div className="jp-vocab-teacher-quiz__hero" id={titleId}>
        {showReadingPrimary ? (
          <div className="jp-vocab-teacher-quiz__reading-row">
            <HeroTerm copyText={readingTrim} onCopied={onCopied}>
              {renderReading()}
            </HeroTerm>
            {showKanjiAside ? (
              <HeroTerm copyText={wordTrim} onCopied={onCopied}>
                {renderKanji()}
              </HeroTerm>
            ) : null}
          </div>
        ) : (
          <HeroTerm copyText={wordTrim} onCopied={onCopied}>
            {renderWordMain()}
          </HeroTerm>
        )}
        {refKey ? (
          <button
            type="button"
            className="jp-vocab-teacher-quiz__ref-hint"
            title={ref?.title ? `教案：${ref.title}` : "查看教案"}
            onClick={() => onOpenRef(refKey, ref)}
          >
            （点击查看教案）
          </button>
        ) : null}
      </div>

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />
    </>
  );
}
