"use client";

import { useCallback, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabFlashcardCopyButton } from "@/components/JpVocabFlashcardCopyButton";
import type { JpVocabKind, JpVocabRef } from "@/lib/types";

type Props = {
  readingTrim: string;
  wordTrim: string;
  /** 单词/语法：显示在词条旁的醒目前缀（「单词：」「语法：」） */
  kind?: JpVocabKind;
  refKey?: string | null;
  ref?: JpVocabRef;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  titleId?: string;
  /** 复习卡片：先隐藏假名/读音，展开后再显示（仅影响语法主行读音） */
  hideReading?: boolean;
};

/**
 * 卡片顶部词条：原封不动显示 word（汉字/片假名）。
 * 单词读音 + OJAD 横线改在信息区「词性」右侧，不在此处替换词条。
 */
export function JpVocabFlashcardWordHero({
  readingTrim,
  wordTrim,
  kind,
  refKey,
  ref,
  onOpenRef,
  titleId,
  hideReading = false,
}: Props) {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const onCopied = useCallback((message: string) => setCopyToast(message), []);

  const kindLabel =
    kind === "grammar" ? "语法：" : kind === "word" ? "单词：" : null;
  const copyReadingTrim = hideReading ? "" : readingTrim;
  const isWordKind = kind === "word";

  /** 语法：仍可优先展示读音；单词：永远展示原词条 */
  const primaryText = isWordKind
    ? wordTrim || "—"
    : hideReading
      ? wordTrim || "—"
      : readingTrim || wordTrim || "—";

  const renderPrimary = () =>
    refKey ? (
      <button
        type="button"
        className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__word-main"
        title={ref?.title ? `教案：${ref.title}` : "查看教案"}
        onClick={() => onOpenRef(refKey, ref)}
      >
        {primaryText}
      </button>
    ) : (
      <span className="jp-vocab-teacher-quiz__word-main">{primaryText}</span>
    );

  return (
    <>
      <div className="jp-vocab-teacher-quiz__hero" id={titleId}>
        <div className="jp-vocab-teacher-quiz__reading-row">
          {kindLabel ? (
            <span
              className={`jp-vocab-teacher-quiz__kind-prefix${
                kind === "grammar"
                  ? " jp-vocab-teacher-quiz__kind-prefix--grammar"
                  : ""
              }`}
            >
              {kindLabel}
            </span>
          ) : null}
          {renderPrimary()}
          <JpVocabFlashcardCopyButton
            readingTrim={copyReadingTrim}
            wordTrim={wordTrim}
            onCopied={onCopied}
          />
        </div>
      </div>

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />
    </>
  );
}
