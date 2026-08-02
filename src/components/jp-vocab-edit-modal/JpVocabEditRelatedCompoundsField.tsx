"use client";

import type { RefObject } from "react";
import type { JpVocabWord } from "@/lib/types";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { JP_VOCAB_RELATED_COMPOUNDS_LABEL } from "@/lib/jp-vocab-related-compounds";

type Props = {
  canEdit: boolean;
  relatedCompounds: string;
  word: JpVocabWord | null | undefined;
  relatedCompoundsRef: RefObject<HTMLTextAreaElement | null>;
  onRelatedCompoundsChange: (value: string) => void;
};

/** 编辑弹窗：相关构词（仅单词） */
export function JpVocabEditRelatedCompoundsField({
  canEdit,
  relatedCompounds,
  word,
  relatedCompoundsRef,
  onRelatedCompoundsChange,
}: Props) {
  return (
    <label className="jp-vocab-edit-field">
      <span className="jp-vocab-edit-label">{JP_VOCAB_RELATED_COMPOUNDS_LABEL}</span>
      <textarea
        ref={relatedCompoundsRef}
        className="jp-vocab-edit-textarea"
        rows={4}
        value={relatedCompounds}
        disabled={!canEdit}
        placeholder={
          "每行：漢字(かな)：中文\n例：\n入口(いりぐち)：入口\n出口(でぐち)：出口\n目上(めうえ)：上级，长辈"
        }
        onChange={(e) => onRelatedCompoundsChange(e.target.value)}
      />
      {word?.related_compounds_source ? (
        <span className="jp-vocab-edit-source-footer">
          <JpVocabSourceLabel source={word.related_compounds_source} />
        </span>
      ) : null}
      <span className="jp-vocab-edit-hint">
        含本词汉字、同读（含连浊）的简单词；一词多义用「，」。语法词条可留空。
      </span>
    </label>
  );
}
