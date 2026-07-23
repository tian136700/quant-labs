"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { enVocabRefApiPath } from "@/lib/en-vocab-ref-shared";
import type { EnVocabRef } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.15;

type Props = {
  open: boolean;
  refMeta: EnVocabRef | null;
  cacheVersion?: string | null;
  onClose: () => void;
};

type PointerPoint = { x: number; y: number };

function pointerDistance(a: PointerPoint, b: PointerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function EnVocabRefPreviewModal({
  open,
  refMeta,
  cacheVersion,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [imgReady, setImgReady] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const zoomRef = useRef(1);
  const activePointersRef = useRef(new Map<number, PointerPoint>());
  const panSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const pinchSessionRef = useRef<{
    startDistance: number;
    startZoom: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  const title = refMeta?.title?.trim() || refMeta?.ref_key || "教案";
  const v = cacheVersion ?? refMeta?.updated_at;
  const mediaUrl = refMeta ? enVocabRefApiPath(refMeta.ref_key, { v }) : "";
  const isPdf = refMeta?.media_type === "pdf";
  const displayScale = fitScale * zoom;

  const computeFitScale = useCallback(() => {
    const img = imgRef.current;
    const stage = stageRef.current;
    if (!img?.naturalWidth || !img.naturalHeight || !stage) return 1;
    const rect = stage.getBoundingClientRect();
    return Math.min(
      (rect.width - 32) / img.naturalWidth,
      (rect.height - 32) / img.naturalHeight,
      1
    );
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    zoomRef.current = 1;
    setFitScale(1);
    setImgReady(false);
    activePointersRef.current.clear();
    panSessionRef.current = null;
    pinchSessionRef.current = null;
    stageRef.current?.scrollTo({ left: 0, top: 0 });
  }, []);

  const applyZoomAtPointer = useCallback(
    (clientX: number, clientY: number, nextZoom: number) => {
      const stage = stageRef.current;
      const img = imgRef.current;
      if (!stage || !img || isPdf) return;

      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
      const prevZoom = zoomRef.current;
      if (Math.abs(clamped - prevZoom) < 0.0001) return;

      const imgRect = img.getBoundingClientRect();
      const fx = (clientX - imgRect.left) / imgRect.width;
      const fy = (clientY - imgRect.top) / imgRect.height;
      const prevW = imgRect.width;
      const prevH = imgRect.height;
      const nextW = prevW * (clamped / prevZoom);
      const nextH = prevH * (clamped / prevZoom);

      zoomRef.current = clamped;
      setZoom(clamped);
      requestAnimationFrame(() => {
        stage.scrollLeft += fx * (nextW - prevW);
        stage.scrollTop += fy * (nextH - prevH);
      });
    },
    [isPdf]
  );

  const zoomAtPointer = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      applyZoomAtPointer(clientX, clientY, zoomRef.current * factor);
    },
    [applyZoomAtPointer]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (open) resetView();
  }, [open, refMeta?.ref_key, resetView]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setCoarsePointer(coarse);
    const mq = window.matchMedia("(pointer: coarse)");
    const onChange = () => setCoarsePointer(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open]);

  useEffect(() => {
    if (!open || !imgReady) return;
    const onResize = () => {
      const nextFit = computeFitScale();
      setFitScale((prev) => (Math.abs(nextFit - prev) > 0.001 ? nextFit : prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, imgReady, computeFitScale]);

  const onStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (isPdf) return;
    // Mac 双指滑动 = 普通 wheel → 原生滚动；捏合 / Ctrl·⌘+滚轮才缩放
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor =
      e.deltaMode === 0
        ? Math.exp(-e.deltaY * 0.01)
        : e.deltaY < 0
          ? ZOOM_STEP
          : 1 / ZOOM_STEP;
    applyZoomAtPointer(e.clientX, e.clientY, zoomRef.current * factor);
  };

  const onStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPdf || e.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);

    if (activePointersRef.current.size === 2) {
      const pts = [...activePointersRef.current.values()];
      panSessionRef.current = null;
      pinchSessionRef.current = {
        startDistance: pointerDistance(pts[0], pts[1]),
        startZoom: zoomRef.current,
        centerX: (pts[0].x + pts[1].x) / 2,
        centerY: (pts[0].y + pts[1].y) / 2,
      };
      return;
    }

    if (activePointersRef.current.size === 1) {
      pinchSessionRef.current = null;
      panSessionRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
      };
    }
  };

  const onStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || !activePointersRef.current.has(e.pointerId)) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pinch = pinchSessionRef.current;
    if (pinch && activePointersRef.current.size >= 2) {
      const pts = [...activePointersRef.current.values()];
      const dist = pointerDistance(pts[0], pts[1]);
      if (pinch.startDistance > 0) {
        applyZoomAtPointer(
          pinch.centerX,
          pinch.centerY,
          pinch.startZoom * (dist / pinch.startDistance)
        );
      }
      return;
    }

    const session = panSessionRef.current;
    if (!session || session.pointerId !== e.pointerId || activePointersRef.current.size !== 1) {
      return;
    }
    stage.scrollLeft = session.scrollLeft - (e.clientX - session.startX);
    stage.scrollTop = session.scrollTop - (e.clientY - session.startY);
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchSessionRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      panSessionRef.current = null;
    } else if (activePointersRef.current.size === 1 && !pinchSessionRef.current) {
      const remaining = [...activePointersRef.current.entries()][0];
      if (remaining && stage) {
        panSessionRef.current = {
          pointerId: remaining[0],
          startX: remaining[1].x,
          startY: remaining[1].y,
          scrollLeft: stage.scrollLeft,
          scrollTop: stage.scrollTop,
        };
      }
    }
    stage?.releasePointerCapture(e.pointerId);
  };

  if (!open || !mounted || !refMeta) return null;

  const hint = isPdf
    ? "滚动查看 · Esc 关闭"
    : coarsePointer
      ? "单指拖动 · 双指缩放 · ± 按钮 · Esc 关闭"
      : "拖动/双指滚动 · Ctrl+滚轮缩放 · Esc 关闭";

  return createPortal(
    <div
      className="jp-ref-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`教案：${title}`}
      onClick={onClose}
    >
      <div className="jp-ref-preview-bar" onClick={(e) => e.stopPropagation()}>
        <div className="jp-ref-preview-title-wrap">
          <span className="jp-ref-preview-title">{title}</span>
          <span className="jp-ref-preview-hint">{hint}</span>
        </div>
        <div className="jp-ref-preview-tools">
          {!isPdf ? (
            <>
              <button
                type="button"
                className="jp-ref-preview-tool-btn"
                disabled={zoom <= ZOOM_MIN}
                onClick={() => {
                  const stage = stageRef.current;
                  if (!stage) return;
                  const rect = stage.getBoundingClientRect();
                  zoomAtPointer(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / ZOOM_STEP);
                }}
                aria-label="缩小"
              >
                −
              </button>
              <button
                type="button"
                className="jp-ref-preview-tool-btn"
                disabled={zoom >= ZOOM_MAX}
                onClick={() => {
                  const stage = stageRef.current;
                  if (!stage) return;
                  const rect = stage.getBoundingClientRect();
                  zoomAtPointer(rect.left + rect.width / 2, rect.top + rect.height / 2, ZOOM_STEP);
                }}
                aria-label="放大"
              >
                +
              </button>
              <button
                type="button"
                className="jp-ref-preview-tool-btn"
                disabled={zoom <= ZOOM_MIN && fitScale >= 1}
                onClick={resetView}
              >
                重置
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="jp-ref-preview-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      </div>
      <div
        ref={stageRef}
        className={`jp-ref-preview-stage${isPdf ? " jp-ref-preview-stage--pdf" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onWheel={onStageWheel}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {isPdf ? (
          <iframe src={mediaUrl} title={title} className="jp-ref-preview-pdf" />
        ) : (
          <div
            className="jp-ref-preview-canvas"
            style={{
              width: imgReady && imgRef.current
                ? imgRef.current.naturalWidth * displayScale
                : undefined,
              height: imgReady && imgRef.current
                ? imgRef.current.naturalHeight * displayScale
                : undefined,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={mediaUrl}
              alt={title}
              draggable={false}
              style={{
                width: imgReady && imgRef.current ? imgRef.current.naturalWidth * displayScale : "auto",
                height: imgReady && imgRef.current ? imgRef.current.naturalHeight * displayScale : "auto",
              }}
              onLoad={() => {
                setFitScale(computeFitScale());
                zoomRef.current = 1;
                setZoom(1);
                setImgReady(true);
                stageRef.current?.scrollTo({ left: 0, top: 0 });
              }}
            />
          </div>
        )}
      </div>
      <style jsx global>{`
        .jp-ref-preview-overlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          flex-direction: column;
          background: rgba(8, 12, 18, 0.88);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding-top: env(safe-area-inset-top, 0px);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .jp-ref-preview-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
          background: color-mix(in srgb, var(--panel) 88%, var(--bg));
          flex-shrink: 0;
        }
        .jp-ref-preview-title-wrap {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .jp-ref-preview-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text);
          word-break: break-word;
        }
        .jp-ref-preview-hint {
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.35;
        }
        .jp-ref-preview-tools {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-shrink: 0;
        }
        .jp-ref-preview-tool-btn,
        .jp-ref-preview-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 2rem;
          height: 2rem;
          padding: 0 0.55rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          cursor: pointer;
        }
        .jp-ref-preview-tool-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .jp-ref-preview-tool-btn:not(:disabled):hover,
        .jp-ref-preview-close:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .jp-ref-preview-close {
          font-size: 1.125rem;
          line-height: 1;
        }
        .jp-ref-preview-stage {
          flex: 1;
          min-height: 0;
          overflow: auto;
          cursor: grab;
          touch-action: none;
          -webkit-overflow-scrolling: touch;
        }
        .jp-ref-preview-stage:active {
          cursor: grabbing;
        }
        .jp-ref-preview-stage--pdf {
          cursor: default;
          padding: 1rem;
        }
        .jp-ref-preview-canvas {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 100%;
          min-height: 100%;
          padding: 1rem;
          box-sizing: border-box;
        }
        .jp-ref-preview-canvas img {
          display: block;
          max-width: none;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: #fff;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
          user-select: none;
          -webkit-user-drag: none;
        }
        .jp-ref-preview-pdf {
          display: block;
          width: min(100%, 960px);
          height: calc(100dvh - 4.5rem);
          min-height: 480px;
          margin: 0 auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
        }
        @media (max-width: 480px) {
          .jp-ref-preview-bar {
            padding: 0.65rem 0.75rem;
          }
          .jp-ref-preview-tool-btn,
          .jp-ref-preview-close {
            min-width: 2.75rem;
            height: 2.75rem;
          }
          .jp-ref-preview-pdf {
            width: 100%;
            min-height: calc(100dvh - 5.5rem);
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
