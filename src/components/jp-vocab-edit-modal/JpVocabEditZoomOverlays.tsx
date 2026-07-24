type Props = {
  zoomTarget: "current" | "new" | null;
  currentRefMediaUrl: string;
  currentRefIsPdf: boolean;
  newRefPreviewUrl: string | null;
  newRefFile: File | null;
  noteZoomSrc: string | null;
  onCloseZoomTarget: () => void;
  onCloseNoteZoom: () => void;
};

export function JpVocabEditZoomOverlays({
  zoomTarget,
  currentRefMediaUrl,
  currentRefIsPdf,
  newRefPreviewUrl,
  newRefFile,
  noteZoomSrc,
  onCloseZoomTarget,
  onCloseNoteZoom,
}: Props) {
  return (
    <>
      {zoomTarget &&
      ((zoomTarget === "current" && currentRefMediaUrl && !currentRefIsPdf) ||
        (zoomTarget === "new" && newRefPreviewUrl && newRefFile?.type.startsWith("image/"))) ? (
        <div
          className="jp-vocab-edit-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="教案大图预览"
          onClick={onCloseZoomTarget}
        >
          <div className="jp-vocab-edit-zoom-bar">
            <span>
              {zoomTarget === "current"
                ? "旧教案 · 点击空白处或按 Esc 关闭"
                : "新教案 · 点击空白处或按 Esc 关闭"}
            </span>
            <button
              type="button"
              className="jp-vocab-edit-close"
              onClick={onCloseZoomTarget}
              aria-label="关闭大图预览"
            >
              ×
            </button>
          </div>
          <div className="jp-vocab-edit-zoom-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomTarget === "current" ? currentRefMediaUrl : newRefPreviewUrl || ""}
              alt="教案大图预览"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}

      {noteZoomSrc ? (
        <div
          className="jp-vocab-edit-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="备注图片大图预览"
          onClick={onCloseNoteZoom}
        >
          <div className="jp-vocab-edit-zoom-bar">
            <span>备注图片 · 点击空白处或按 Esc 关闭</span>
            <button
              type="button"
              className="jp-vocab-edit-close"
              onClick={onCloseNoteZoom}
              aria-label="关闭大图预览"
            >
              ×
            </button>
          </div>
          <div className="jp-vocab-edit-zoom-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={noteZoomSrc} alt="备注图片大图" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      ) : null}
    </>
  );
}
