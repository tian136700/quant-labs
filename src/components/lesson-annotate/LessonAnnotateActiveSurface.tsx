"use client";

import type { RefObject, PointerEvent as ReactPointerEvent } from "react";

type Props = {
  wrapRef: RefObject<HTMLDivElement | null>;
  imgRef: RefObject<HTMLImageElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  displayUrl: string;
  alt: string;
  imgReady: boolean;
  tool: string;
  zoom: number;
  selectedTextIndex: number | null;
  widthPx?: number;
  heightPx?: number;
  onImgLoad: () => void;
  onImgError: () => void;
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
};

/** 当前可编辑页：底图 + 画布（图片教案 / PDF 活动页共用）。 */
export function LessonAnnotateActiveSurface({
  wrapRef,
  imgRef,
  canvasRef,
  displayUrl,
  alt,
  imgReady,
  tool,
  zoom,
  selectedTextIndex,
  widthPx,
  heightPx,
  onImgLoad,
  onImgError,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}: Props) {
  return (
    <div
      ref={wrapRef}
      className={`jp-annotate-canvas-wrap${imgReady ? " is-ready" : ""}${
        tool === "zoom" ? " is-zoom-tool" : ""
      }${zoom > 1.01 ? " is-zoomed" : ""}${
        tool === "text" ? " is-text-tool" : ""
      }${tool === "smear" ? " is-smear-tool" : ""}${
        selectedTextIndex != null ? " is-text-selected" : ""
      }`}
      style={
        widthPx != null && heightPx != null
          ? { width: widthPx, height: heightPx }
          : undefined
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {displayUrl ? (
        <img
          key={displayUrl}
          ref={imgRef}
          src={displayUrl}
          alt={alt}
          className="jp-annotate-img"
          onLoad={onImgLoad}
          onError={onImgError}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className="jp-annotate-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      />
    </div>
  );
}
