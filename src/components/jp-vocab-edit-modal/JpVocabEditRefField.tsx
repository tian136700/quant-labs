import { formatUploadBytes, type UploadProgressEvent } from "@/lib/upload-form-progress";
import type { JpVocabRef } from "@/lib/types";
import { uploadProgressLabel } from "@/components/jp-vocab-edit-modal/helpers";

type Props = {
  canEdit: boolean;
  currentRefKey: string | null;
  currentRefMeta: JpVocabRef | null;
  currentRefMediaUrl: string;
  currentRefViewerUrl: string;
  currentRefIsPdf: boolean;
  newRefFile: File | null;
  newRefPreviewUrl: string | null;
  uploadingRef: boolean;
  uploadProgress: UploadProgressEvent | null;
  refError: string;
  refFileInputRef: React.RefObject<HTMLInputElement | null>;
  onRefPaste: (e: React.ClipboardEvent) => void;
  onOpenCurrentRefPreview: () => void;
  onOpenNewRefPreview: () => void;
  onSetZoomTarget: (target: "current" | "new") => void;
  onApplyRefFile: (file: File) => void;
  onClearRefFile: () => void;
};

export function JpVocabEditRefField({
  canEdit,
  currentRefKey,
  currentRefMeta,
  currentRefMediaUrl,
  currentRefViewerUrl,
  currentRefIsPdf,
  newRefFile,
  newRefPreviewUrl,
  uploadingRef,
  uploadProgress,
  refError,
  refFileInputRef,
  onRefPaste,
  onOpenCurrentRefPreview,
  onOpenNewRefPreview,
  onSetZoomTarget,
  onApplyRefFile,
  onClearRefFile,
}: Props) {
  return (
    <div className="field jp-vocab-edit-ref-field" onPaste={onRefPaste}>
      <div className="jp-vocab-edit-ref-head">
        <label className="jp-vocab-edit-label">教案</label>
        {currentRefKey ? (
          <span className="jp-vocab-edit-ref-key">共享地址：`{currentRefKey}`</span>
        ) : (
          <span className="jp-vocab-edit-ref-key">当前词条还没绑定教案</span>
        )}
      </div>
      <p className="jp-vocab-edit-hint">
        同一个教案地址被多个语法 / 单词共用时，这里替换后会一起更新。
      </p>

      <div className="jp-vocab-edit-ref-grid">
        <div className="jp-vocab-edit-ref-col">
          <div className="jp-vocab-edit-ref-title-row">
            <span className="jp-vocab-edit-ref-title">旧教案</span>
            {currentRefViewerUrl ? (
              <a
                href={currentRefViewerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="jp-vocab-edit-ref-link"
              >
                新标签页打开
              </a>
            ) : null}
          </div>
          {currentRefKey && currentRefMeta ? (
            currentRefIsPdf ? (
              <button
                type="button"
                className="jp-vocab-edit-ref-card jp-vocab-edit-ref-card--pdf"
                onClick={onOpenCurrentRefPreview}
              >
                <span className="jp-vocab-edit-ref-pdf-badge">PDF</span>
                <span className="jp-vocab-edit-ref-card-title">当前 PDF 教案</span>
                <span className="jp-vocab-edit-ref-card-hint">点击预览</span>
              </button>
            ) : (
              <button
                type="button"
                className="jp-vocab-edit-ref-card"
                onClick={onOpenCurrentRefPreview}
                title="点击放大预览旧教案"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentRefMediaUrl}
                  alt="旧教案预览"
                  className="jp-vocab-edit-ref-current-img"
                />
                <span className="jp-vocab-edit-ref-card-hint">点击放大预览</span>
              </button>
            )
          ) : (
            <div className="jp-vocab-edit-ref-empty">暂无旧教案</div>
          )}
        </div>

        <div className="jp-vocab-edit-ref-col">
          <div className="jp-vocab-edit-ref-title-row">
            <span className="jp-vocab-edit-ref-title">新教案</span>
            <span className="jp-vocab-edit-ref-mini-hint">支持上传或直接粘贴截图</span>
          </div>

          <div
            className={`jp-vocab-edit-ref-drop${newRefFile ? " has-file" : ""}${
              uploadingRef ? " is-disabled" : ""
            }`}
            onPaste={onRefPaste}
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploadingRef) e.currentTarget.classList.add("is-dragover");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("is-dragover");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("is-dragover");
              if (uploadingRef) return;
              const picked = e.dataTransfer.files[0];
              if (picked) onApplyRefFile(picked);
            }}
          >
            {newRefFile ? (
              <div className="jp-vocab-edit-ref-picked">
                {newRefPreviewUrl && newRefFile.type.startsWith("image/") ? (
                  <button
                    type="button"
                    className="jp-vocab-edit-ref-preview-btn"
                    onClick={() => onSetZoomTarget("new")}
                    title="点击放大预览新教案"
                    disabled={uploadingRef}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={newRefPreviewUrl}
                      alt="新教案预览"
                      className="jp-vocab-edit-ref-preview"
                    />
                    <span className="jp-vocab-edit-ref-preview-hint">点击放大</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="jp-vocab-edit-ref-pdf-icon"
                    onClick={onOpenNewRefPreview}
                    disabled={uploadingRef}
                  >
                    PDF
                  </button>
                )}
                <div className="jp-vocab-edit-ref-picked-meta">
                  <span className="jp-vocab-edit-ref-picked-name">{newRefFile.name}</span>
                  <span className="jp-vocab-edit-ref-picked-size">
                    {formatUploadBytes(newRefFile.size)}
                  </span>
                  {newRefPreviewUrl ? (
                    <button
                      type="button"
                      className="jp-vocab-edit-ref-link-btn"
                      onClick={onOpenNewRefPreview}
                      disabled={uploadingRef}
                    >
                      {newRefFile.type.startsWith("image/") ? "放大预览" : "预览 PDF"}
                    </button>
                  ) : null}
                </div>
                {!uploadingRef ? (
                  <button
                    type="button"
                    className="jp-vocab-edit-ref-remove"
                    onClick={onClearRefFile}
                  >
                    移除
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <p className="jp-vocab-edit-ref-drop-title">拖拽、粘贴或选择图片 / PDF</p>
                <p className="jp-vocab-edit-ref-drop-hint">
                  支持 PNG / JPG / PDF，最大 20MB；弹窗内可按 Ctrl+V / ⌘V 粘贴截图
                </p>
                <button
                  type="button"
                  className="jp-vocab-edit-ref-pick-btn"
                  disabled={!canEdit || uploadingRef || !currentRefKey}
                  onClick={() => refFileInputRef.current?.click()}
                >
                  选择文件
                </button>
              </>
            )}
            <input
              ref={refFileInputRef}
              type="file"
              accept="image/*,application/pdf"
              hidden
              disabled={!canEdit || uploadingRef || !currentRefKey}
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) onApplyRefFile(picked);
              }}
            />
          </div>
        </div>
      </div>

      {uploadingRef && uploadProgress ? (
        <div className="jp-vocab-edit-ref-progress" aria-live="polite">
          <div className="jp-vocab-edit-ref-progress-head">
            <span>{uploadProgressLabel(uploadProgress)}</span>
            <span>
              {uploadProgress.phase === "uploading" && uploadProgress.total > 0
                ? `${uploadProgress.percent}%`
                : uploadProgress.phase === "processing"
                  ? "处理中"
                  : "100%"}
            </span>
          </div>
          <div
            className={`jp-vocab-edit-ref-progress-track${
              uploadProgress.phase === "processing" ? " is-processing" : ""
            }`}
          >
            <div
              className="jp-vocab-edit-ref-progress-bar"
              style={{
                width:
                  uploadProgress.phase === "processing"
                    ? "100%"
                    : `${uploadProgress.percent}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {refError ? <p className="jp-vocab-edit-error">{refError}</p> : null}
    </div>
  );
}
