import { autoGrowTextarea } from "@/components/jp-vocab-edit-modal/helpers";
import type { JpVocabWord } from "@/lib/types";

type Props = {
  canEdit: boolean;
  connection: string;
  word: JpVocabWord;
  connectionRef: React.RefObject<HTMLTextAreaElement | null>;
  onConnectionChange: (value: string) => void;
};

/** 词条编辑：接序（接续形态 / 活用要点） */
export function JpVocabEditConnectionField({
  canEdit,
  connection,
  word,
  connectionRef,
  onConnectionChange,
}: Props) {
  return (
    <div className="field">
      <label htmlFor="jp-vocab-edit-connection" className="jp-vocab-edit-label">
        接序
      </label>
      <textarea
        ref={connectionRef}
        id="jp-vocab-edit-connection"
        className="jp-vocab-edit-textarea jp-vocab-edit-textarea--expand"
        rows={3}
        value={connection}
        disabled={!canEdit}
        placeholder={
          word.kind === "grammar"
            ? "例：\n动词辞书形（动词原形）＋「～前に」\n名词＋の＋「前に」"
            : "例：\n一类动词（五段）／辞书形（动词原形）：「書く」；ます形：「書きます」；て形：「書いて」"
        }
        onChange={(e) => {
          onConnectionChange(e.target.value);
          autoGrowTextarea(e.currentTarget);
        }}
      />
      <p className="jp-vocab-edit-hint">
        接续形态或活用要点；与用法分开写。写「动词辞书形」请写成「动词辞书形（动词原形）」。
        定时补全会与用法/例句同一次写入。
        {word?.connection_source?.trim()
          ? ` 当前接序来源：${word.connection_source.trim()}（你在此修改并保存后会记为「手动」）。`
          : " 人手填写并保存后，接序来源记为「手动」。"}
      </p>
    </div>
  );
}
