import type { JpVocabWord } from "@/lib/types";
import { formatJpVocabSourceDisplay } from "@/lib/jp-vocab-source-display";
import { autoGrowTextarea } from "@/components/jp-vocab-edit-modal/helpers";

type Props = {
  canEdit: boolean;
  usage: string;
  word: JpVocabWord;
  usageRef: React.RefObject<HTMLTextAreaElement | null>;
  onUsageChange: (value: string) => void;
};

/** 语法词条：编号用法（驱动卡片 1:1 例句） */
export function JpVocabEditUsageField({
  canEdit,
  usage,
  word,
  usageRef,
  onUsageChange,
}: Props) {
  return (
    <div className="field">
      <label htmlFor="jp-vocab-edit-usage" className="jp-vocab-edit-label">
        用法
      </label>
      <textarea
        ref={usageRef}
        id="jp-vocab-edit-usage"
        className="jp-vocab-edit-textarea jp-vocab-edit-textarea--expand"
        rows={3}
        value={usage}
        disabled={!canEdit}
        placeholder={
          "例：\n1. 表示原因、理由：前句说明原因，后句说明结果。\n2. 表示接续：承接上文，引出下一句。"
        }
        onChange={(e) => {
          onUsageChange(e.target.value);
          autoGrowTextarea(e.currentTarget);
        }}
      />
      <p className="jp-vocab-edit-hint">
        仅语法：半角「1.」「2.」编号中文说明，按常用程度排序；例句须与用法条数一一对应。单词不填此栏。
        {word?.usage_source?.trim()
          ? ` 当前用法来源：${formatJpVocabSourceDisplay(word.usage_source)}（你在此修改并保存后会记为「手动」）。`
          : " 人手填写并保存后，用法来源记为「手动」。"}
      </p>
    </div>
  );
}
