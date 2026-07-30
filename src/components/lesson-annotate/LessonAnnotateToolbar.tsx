"use client";

import {
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TEXT_SIZE_STEP,
} from "@/components/lesson-annotate/lesson-annotate-draw";

type AnnotateTool = "brush" | "smear" | "line" | "text" | "zoom";

export type LessonAnnotateToolbarProps = {
  lessonContent: string;
  tool: AnnotateTool;
  textFontSize: number;
  imgReady: boolean;
  zoom: number;
  zoomMin: number;
  zoomMax: number;
  /** 「适应」目标倍率（通常为打开默认 / 中位） */
  zoomDefault: number;
  strokesCount: number;
  downloading: boolean;
  saving: boolean;
  saveStatus: string;
  /** PDF 翻页；非 PDF 时传 null */
  pdfPager: {
    pageIndex: number;
    pageCount: number;
    busy: boolean;
    onPrev: () => void;
    onNext: () => void;
  } | null;
  onToolChange: (tool: AnnotateTool) => void;
  onTextFontSizeChange: (size: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onUndo: () => void;
  onClearAll: () => void;
  onDownload: () => void;
  onSave: () => void;
  onClose: () => void;
};

export function LessonAnnotateToolbar({
  lessonContent,
  tool,
  textFontSize,
  imgReady,
  zoom,
  zoomMin,
  zoomMax,
  zoomDefault,
  strokesCount,
  downloading,
  saving,
  saveStatus,
  pdfPager,
  onToolChange,
  onTextFontSizeChange,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onUndo,
  onClearAll,
  onDownload,
  onSave,
  onClose,
}: LessonAnnotateToolbarProps) {
  return (
    <>
      <div className="jp-annotate-bar">
        <div className="jp-annotate-bar-main">
          <span className="jp-annotate-title">随手画</span>
          <span className="jp-annotate-subtitle" title={lessonContent}>
            {lessonContent}
          </span>
        </div>
        <div className="jp-annotate-tools">
          {pdfPager && pdfPager.pageCount > 1 ? (
            <>
              <button
                type="button"
                className="jp-annotate-tool"
                disabled={pdfPager.busy || pdfPager.pageIndex <= 0}
                onClick={pdfPager.onPrev}
              >
                上一页
              </button>
              <span className="jp-annotate-text-size-value" aria-live="polite">
                {pdfPager.pageIndex + 1} / {pdfPager.pageCount}
              </span>
              <button
                type="button"
                className="jp-annotate-tool"
                disabled={
                  pdfPager.busy || pdfPager.pageIndex >= pdfPager.pageCount - 1
                }
                onClick={pdfPager.onNext}
              >
                下一页
              </button>
              <span className="jp-annotate-tool-sep" aria-hidden="true" />
            </>
          ) : null}
          {(
            [
              ["brush", "画笔"],
              ["smear", "涂抹"],
              ["line", "直线"],
              ["text", "文字"],
              ["zoom", "缩放"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`jp-annotate-tool${tool === id ? " is-active" : ""}`}
              onClick={() => onToolChange(id)}
            >
              {label}
            </button>
          ))}
          {tool === "text" ? (
            <div className="jp-annotate-text-size">
              <span className="jp-annotate-text-size-label">字号</span>
              <button
                type="button"
                className="jp-annotate-tool jp-annotate-text-size-btn"
                disabled={textFontSize <= TEXT_SIZE_MIN}
                aria-label="减小字号"
                onClick={() => onTextFontSizeChange(textFontSize - TEXT_SIZE_STEP)}
              >
                −
              </button>
              <input
                type="range"
                className="jp-annotate-text-size-range"
                min={TEXT_SIZE_MIN}
                max={TEXT_SIZE_MAX}
                step={TEXT_SIZE_STEP}
                value={textFontSize}
                aria-label="字号"
                onChange={(e) => onTextFontSizeChange(Number(e.target.value))}
              />
              <span className="jp-annotate-text-size-value">{textFontSize}</span>
              <button
                type="button"
                className="jp-annotate-tool jp-annotate-text-size-btn"
                disabled={textFontSize >= TEXT_SIZE_MAX}
                aria-label="增大字号"
                onClick={() => onTextFontSizeChange(textFontSize + TEXT_SIZE_STEP)}
              >
                +
              </button>
            </div>
          ) : null}
          <span className="jp-annotate-tool-sep" aria-hidden="true" />
          <button
            type="button"
            className="jp-annotate-tool"
            disabled={!imgReady || zoom >= zoomMax}
            onClick={onZoomIn}
          >
            放大
          </button>
          <button
            type="button"
            className="jp-annotate-tool"
            disabled={!imgReady || zoom <= zoomMin}
            onClick={onZoomOut}
          >
            缩小
          </button>
          <button
            type="button"
            className="jp-annotate-tool"
            disabled={!imgReady || Math.abs(zoom - zoomDefault) < 0.02}
            onClick={onResetZoom}
          >
            适应
          </button>
          <span className="jp-annotate-tool-sep" aria-hidden="true" />
          <button
            type="button"
            className="jp-annotate-tool"
            disabled={strokesCount === 0}
            onClick={onUndo}
          >
            撤销
          </button>
          <button
            type="button"
            className="jp-annotate-tool"
            disabled={strokesCount === 0}
            onClick={onClearAll}
          >
            清空
          </button>
          <button
            type="button"
            className="jp-annotate-tool jp-annotate-tool--accent"
            disabled={!imgReady || downloading || saving}
            onClick={onDownload}
          >
            {downloading ? "下载中…" : "下载到本地"}
          </button>
          <button
            type="button"
            className="jp-annotate-tool jp-annotate-tool--save"
            disabled={!imgReady || downloading || saving}
            onClick={onSave}
          >
            {saving ? "保存中…" : "保存为最新教案"}
          </button>
        </div>
        {saveStatus ? (
          <span className="jp-annotate-save-status">{saveStatus}</span>
        ) : null}
        <button type="button" className="jp-annotate-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </div>

      <p className="jp-annotate-hint">
        「涂抹」：拖拽框选正方/长方形，松手后用不透明深色盖住原文，并自动写上「此内容由AI生成，经核验不准确，已涂抹」。「文字」下点击空白添加文字，拖动输入框可移到目标位置；点击已有文字可选中并拖动，按 Backspace / Delete 删除选中文字；字号滑条调节新文字或选中文字大小。
        {pdfPager
          ? " PDF 教案按页批注，翻页会保留各页未保存笔画；「保存为最新教案」会把全部页重新合成 PDF 覆盖线上文件。"
          : " 保存为最新教案会覆盖线上图片；关闭后未保存的批注即消失。"}
        关闭后未保存的批注即消失。
      </p>
    </>
  );
}
