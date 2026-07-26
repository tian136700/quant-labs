"use client";

import { JpVocabUsageExamplesPairedContent } from "@/components/JpVocabUsageExamplesPairedContent";

type Props = {
  usage: string;
  exampleSentences: string;
  wordLabel?: string | null;
};

/** 语法编辑：用法/例句分栏录入时，下方即时预览 1:1 配对（防只填用法看不到缺例句） */
export function JpVocabEditGrammarPairPreview({
  usage,
  exampleSentences,
  wordLabel,
}: Props) {
  return (
    <div className="field jp-vocab-edit-grammar-pair-preview">
      <div className="jp-vocab-edit-label">用法 / 例句预览（保存后卡片同款）</div>
      <JpVocabUsageExamplesPairedContent
        usage={usage}
        exampleSentences={exampleSentences}
        wordLabel={wordLabel}
        emptyText="请同时填写用法与对应例句（每条用法下一条例句）"
      />
      <p className="jp-vocab-edit-hint">
        上面「用法」「例句」是两个编辑框；这里按 1:1 合并预览。若某条下出现「暂无对应用例」，说明例句条数不够。
      </p>
    </div>
  );
}
