"use client";

import { useEffect, useRef } from "react";
import {
  drawAllStrokes,
  type Stroke,
} from "@/components/lesson-annotate/lesson-annotate-draw";
import type { AnnotatePdfPage } from "@/components/lesson-annotate/useLessonAnnotatePdfPages";

/** PDF 非编辑页：只展示底图 + 已有笔迹，点击整页可切到编辑。 */
export function LessonAnnotatePdfPagePreview(props: {
  page: AnnotatePdfPage;
  pageIndex: number;
  pageCount: number;
  strokes: Stroke[];
  displayScale: number;
  onSelect: () => void;
}) {
  const { page, pageIndex, pageCount, strokes, displayScale, onSelect } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = page.width;
    canvas.height = page.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawAllStrokes(ctx, strokes, null, null, null);
  }, [page.width, page.height, strokes]);

  return (
    <div className="jp-annotate-page">
      <button
        type="button"
        className="jp-annotate-page-tab"
        onClick={onSelect}
      >
        第 {pageIndex + 1} / {pageCount} 页 · 点击编辑
      </button>
      <div
        className="jp-annotate-canvas-wrap is-ready is-preview"
        style={{
          width: page.width * displayScale,
          height: page.height * displayScale,
        }}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={page.dataUrl} alt={`第 ${pageIndex + 1} 页`} className="jp-annotate-img" draggable={false} />
        <canvas ref={canvasRef} className="jp-annotate-canvas" />
      </div>
    </div>
  );
}
