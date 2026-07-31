import type { JpVocabWord } from "@/lib/types";
import { formatJpVocabSourceDisplay } from "@/lib/jp-vocab-source-display";
import { autoGrowTextarea } from "@/components/jp-vocab-edit-modal/helpers";

type Props = {
  canEdit: boolean;
  exampleSentences: string;
  word: JpVocabWord;
  exampleSentencesRef: React.RefObject<HTMLTextAreaElement | null>;
  onExampleSentencesChange: (value: string) => void;
};

export function JpVocabEditExamplesField({
  canEdit,
  exampleSentences,
  word,
  exampleSentencesRef,
  onExampleSentencesChange,
}: Props) {
  return (
    <div className="field">
      <label htmlFor="jp-vocab-edit-example-sentences" className="jp-vocab-edit-label">
        例句
      </label>
      <textarea
        ref={exampleSentencesRef}
        id="jp-vocab-edit-example-sentences"
        className="jp-vocab-edit-textarea jp-vocab-edit-textarea--expand"
        rows={4}
        value={exampleSentences}
        disabled={!canEdit}
        placeholder="例：&#10;日本語を習います。&#10;译文：我学习日语。&#10;ピアノを習いたいです。&#10;译文：我想学钢琴。"
        onChange={(e) => {
          onExampleSentencesChange(e.target.value);
          autoGrowTextarea(e.currentTarget);
        }}
      />
      <p className="jp-vocab-edit-hint">
        格式：日语句下一行写「译文：…」。列表展示时日语自动带 1、2、3…，译义行不占序号。两条例句完全相同会在保存前提醒。课堂带读会展示；日语抽问表格不显示此列。
        {word?.example_sentences_source?.trim()
          ? ` 当前例句来源：${formatJpVocabSourceDisplay(word.example_sentences_source)}（你在此修改并保存后会记为「手动」）。`
          : " 人手填写并保存后，例句来源记为「手动」。"}
      </p>
    </div>
  );
}
