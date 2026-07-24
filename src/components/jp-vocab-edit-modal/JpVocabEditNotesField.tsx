import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import {
  mergeJpVocabClassNotesBlobFromEdit,
  removeJpVocabClassNotesBlobImageAt,
  type JpVocabClassNotesBlobEditImages,
} from "@/lib/jp-vocab-class-notes";
import type { UploadProgressEvent } from "@/lib/upload-form-progress";
import {
  autoGrowTextarea,
  noteImageUploadLabel,
  noteImageUploadPercent,
} from "@/components/jp-vocab-edit-modal/helpers";

type Props = {
  canEdit: boolean;
  classNotesLoading: boolean;
  noteImageUploading: boolean;
  noteImageUploadProgress: UploadProgressEvent | null;
  classNotesText: string;
  classNotesImageSrcs: string[];
  classNotes: string;
  classNotesImages: JpVocabClassNotesBlobEditImages;
  classNotesRef: React.RefObject<HTMLTextAreaElement | null>;
  noteImageInputRef: React.RefObject<HTMLInputElement | null>;
  onNotesPaste: (e: React.ClipboardEvent) => void;
  onNotesDrop: (e: React.DragEvent) => void;
  onClassNotesChange: (value: string) => void;
  onNoteZoom: (src: string) => void;
  onRemoveNoteImage: (index: number) => void;
  onUploadNoteImages: (files: File[]) => void;
};

export function JpVocabEditNotesField({
  canEdit,
  classNotesLoading,
  noteImageUploading,
  noteImageUploadProgress,
  classNotesText,
  classNotesImageSrcs,
  classNotes,
  classNotesImages,
  classNotesRef,
  noteImageInputRef,
  onNotesPaste,
  onNotesDrop,
  onClassNotesChange,
  onNoteZoom,
  onRemoveNoteImage,
  onUploadNoteImages,
}: Props) {
  return (
    <div
      className="field jp-vocab-edit-notes-field"
      onPaste={onNotesPaste}
      onDragOver={(e) => {
        if (!canEdit || classNotesLoading || noteImageUploading) return;
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        e.currentTarget.classList.add("is-dragover");
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove("is-dragover");
      }}
      onDrop={onNotesDrop}
    >
      <label htmlFor="jp-vocab-edit-notes" className="jp-vocab-edit-label">
        备注
      </label>
      {canEdit ? (
        <div className="jp-vocab-edit-notes-toolbar">
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact"
            disabled={noteImageUploading || classNotesLoading}
            onClick={() => noteImageInputRef.current?.click()}
          >
            {noteImageUploading ? "上传中…" : "上传图片"}
          </button>
          <span className="jp-vocab-edit-notes-toolbar-hint">
            {noteImageUploading
              ? "上传完成前不可再贴图或选图"
              : "可多选；支持拖拽 / Ctrl+V / ⌘V 粘贴截图；相同图片不会重复加入"}
          </span>
          <input
            ref={noteImageInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={noteImageUploading || classNotesLoading}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (files.length) onUploadNoteImages(files);
            }}
          />
        </div>
      ) : null}
      {noteImageUploading && noteImageUploadProgress ? (
        <JpVocabSaveProgressBar
          label={noteImageUploadLabel(noteImageUploadProgress)}
          percent={noteImageUploadPercent(noteImageUploadProgress)}
          fullWidth
        />
      ) : null}
      <textarea
        ref={classNotesRef}
        id="jp-vocab-edit-notes"
        className="jp-vocab-edit-textarea jp-vocab-edit-textarea--expand"
        rows={5}
        value={classNotesLoading ? "" : classNotesText}
        disabled={!canEdit || classNotesLoading || noteImageUploading}
        placeholder={
          classNotesLoading
            ? "正在加载备注…"
            : "点击此处修改备注文字（时间戳行可保留；可粘贴/上传多张图片，见下方缩略图）"
        }
        onPaste={onNotesPaste}
        onChange={(e) => {
          onClassNotesChange(
            mergeJpVocabClassNotesBlobFromEdit(e.target.value, classNotesImages)
          );
          autoGrowTextarea(e.currentTarget);
        }}
      />
      {classNotesImageSrcs.length ? (
        <div className="jp-vocab-edit-notes-images" aria-label="备注图片">
          {classNotesImageSrcs.map((src, index) => (
            <div key={`${src}-${index}`} className="jp-vocab-edit-notes-image-item">
              <button
                type="button"
                className="jp-vocab-edit-notes-image-preview"
                title="点击放大预览"
                onClick={() => onNoteZoom(src)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`备注图片 ${index + 1}`} loading="lazy" />
                <span className="jp-vocab-edit-notes-image-hint">点击放大</span>
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="jp-vocab-edit-notes-image-remove"
                  disabled={noteImageUploading}
                  onClick={() => {
                    if (!window.confirm(`确定移除第 ${index + 1} 张备注图片吗？`)) return;
                    onRemoveNoteImage(index);
                  }}
                >
                  移除图片
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <p className="jp-vocab-edit-hint">
        {canEdit
          ? "上方文本框可直接改字；图片与「修改备注」弹窗相同：居中展示、可点放大。备注保存后会同步到日语新课。图片地址已隐藏，避免误改；可用「移除图片」删除。"
          : "备注保存后会同步到日语新课。图片居中展示；地址已隐藏，避免误改。"}
      </p>
    </div>
  );
}
