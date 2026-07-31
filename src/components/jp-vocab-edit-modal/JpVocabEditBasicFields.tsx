import type { JpVocabKind, JpVocabWord } from "@/lib/types";
import { formatJpVocabSourceDisplay } from "@/lib/jp-vocab-source-display";
import { KIND_OPTIONS } from "@/components/jp-vocab-edit-modal/helpers";

type Props = {
  canEdit: boolean;
  showMnemonic: boolean;
  kind: JpVocabKind;
  wordText: string;
  reading: string;
  meaning: string;
  pos: string;
  mnemonic: string;
  word: JpVocabWord;
  onKindChange: (kind: JpVocabKind) => void;
  onWordTextChange: (value: string) => void;
  onReadingChange: (value: string) => void;
  onMeaningChange: (value: string) => void;
  onPosChange: (value: string) => void;
  onMnemonicChange: (value: string) => void;
};

export function JpVocabEditBasicFields({
  canEdit,
  showMnemonic,
  kind,
  wordText,
  reading,
  meaning,
  pos,
  mnemonic,
  word,
  onKindChange,
  onWordTextChange,
  onReadingChange,
  onMeaningChange,
  onPosChange,
  onMnemonicChange,
}: Props) {
  return (
    <>
      {showMnemonic ? (
        <div className="field">
          <label htmlFor="jp-vocab-edit-mnemonic" className="jp-vocab-edit-label">
            巧记
          </label>
          <textarea
            id="jp-vocab-edit-mnemonic"
            className="jp-vocab-edit-textarea jp-vocab-edit-textarea--lg"
            rows={4}
            value={mnemonic}
            disabled={!canEdit}
            placeholder="联想记忆、谐音梗、拆分口诀等（仅管理员可见）"
            onChange={(e) => onMnemonicChange(e.target.value)}
          />
          <p className="jp-vocab-edit-hint">
            用于管理员复习与自查，不会展示给老师或学生端。
          </p>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="jp-vocab-edit-kind" className="jp-vocab-edit-label">
          类型
        </label>
        <select
          id="jp-vocab-edit-kind"
          className="jp-vocab-edit-select"
          value={kind}
          disabled={!canEdit}
          onChange={(e) => onKindChange(e.target.value as JpVocabKind)}
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="jp-vocab-edit-word" className="jp-vocab-edit-label">
          {kind === "grammar" ? "语法" : "单词 / 语法"}
          <span className="etr-required">*</span>
        </label>
        <textarea
          id="jp-vocab-edit-word"
          className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
          rows={2}
          value={wordText}
          disabled={!canEdit}
          placeholder={kind === "grammar" ? "例如：～ばかり" : "例如：勉強"}
          onChange={(e) => onWordTextChange(e.target.value)}
        />
      </div>

      {kind === "word" ? (
        <div className="field">
          <label htmlFor="jp-vocab-edit-reading" className="jp-vocab-edit-label">
            读音（可选）
          </label>
          <input
            id="jp-vocab-edit-reading"
            type="text"
            className="jp-vocab-edit-input"
            value={reading}
            disabled={!canEdit}
            placeholder="例如：べんきょう"
            onChange={(e) => onReadingChange(e.target.value)}
          />
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="jp-vocab-edit-meaning" className="jp-vocab-edit-label">
          释义
        </label>
        <textarea
          id="jp-vocab-edit-meaning"
          className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
          rows={2}
          value={meaning}
          disabled={!canEdit}
          placeholder="例如：休息；假期（多义用中文分号；分隔，最多 3 个）"
          onChange={(e) => onMeaningChange(e.target.value)}
        />
        <p className="jp-vocab-edit-hint">
          {word?.meaning_source?.trim()
            ? `当前释义来源：${formatJpVocabSourceDisplay(word.meaning_source)}（在此修改并保存后记为「手动」）。`
            : "人手填写并保存后，释义来源记为「手动」。多义用「；」分隔，最多 3 个常用义。"}
        </p>
      </div>

      <div className="field">
        <label htmlFor="jp-vocab-edit-pos" className="jp-vocab-edit-label">
          词性
        </label>
        <textarea
          id="jp-vocab-edit-pos"
          className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
          rows={2}
          value={pos}
          disabled={!canEdit}
          placeholder="例如：名词、动词、形容词"
          onChange={(e) => onPosChange(e.target.value)}
        />
      </div>
    </>
  );
}
