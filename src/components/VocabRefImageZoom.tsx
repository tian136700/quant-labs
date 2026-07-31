"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const VOCAB_REF_ZOOM_MIN = 0.4;
export const VOCAB_REF_ZOOM_MAX = 6;
export const VOCAB_REF_ZOOM_STEP = 1.15;
/** 长按保存：缩放层 touch-action:none 会拦系统「存储图像」，改走业务回调 */
export const VOCAB_REF_IMAGE_LONG_PRESS_MS = 550;
export const VOCAB_REF_IMAGE_LONG_PRESS_MOVE_PX = 12;

type PointerPoint = { x: number; y: number };

function pointerDistance(a: PointerPoint, b: PointerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export type VocabRefImageZoomApi = {
  zoom: number;
  fitScale: number;
  imgReady: boolean;
  displayScale: number;
  stageRef: RefObject<HTMLDivElement | null>;
  imgRef: RefObject<HTMLImageElement | null>;
  zoomAtCenter: (factor: number) => void;
  resetView: () => void;
  onStageWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  onStagePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onStagePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  endPointer: (e: React.PointerEvent<HTMLDivElement>) => void;
  onImageLoad: () => void;
};

export function useVocabRefImageZoom(
  mediaKey?: string,
  onImageLongPress?: () => void
): VocabRefImageZoomApi {
  const [zoom, setZoom] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [imgReady, setImgReady] = useState(false);
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
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<PointerPoint | null>(null);
  const longPressFiredRef = useRef(false);
  const onImageLongPressRef = useRef(onImageLongPress);
  onImageLongPressRef.current = onImageLongPress;

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearLongPressTimer();
  }, [clearLongPressTimer]);

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
    clearLongPressTimer();
    longPressFiredRef.current = false;
    longPressOriginRef.current = null;
    stageRef.current?.scrollTo({ left: 0, top: 0 });
  }, [clearLongPressTimer]);

  const applyZoomAtPointer = useCallback(
    (clientX: number, clientY: number, nextZoom: number) => {
      const stage = stageRef.current;
      const img = imgRef.current;
      if (!stage || !img) return;

      const clamped = Math.min(VOCAB_REF_ZOOM_MAX, Math.max(VOCAB_REF_ZOOM_MIN, nextZoom));
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
    []
  );

  const zoomAtPointer = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      applyZoomAtPointer(clientX, clientY, zoomRef.current * factor);
    },
    [applyZoomAtPointer]
  );

  const zoomAtCenter = useCallback(
    (factor: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      zoomAtPointer(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    },
    [zoomAtPointer]
  );

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    resetView();
  }, [mediaKey, resetView]);

  useEffect(() => {
    if (!imgReady) return;
    const onResize = () => {
      const nextFit = computeFitScale();
      setFitScale((prev) => (Math.abs(nextFit - prev) > 0.001 ? nextFit : prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [imgReady, computeFitScale]);

  const onImageLoad = useCallback(() => {
    setFitScale(computeFitScale());
    zoomRef.current = 1;
    setZoom(1);
    setImgReady(true);
    stageRef.current?.scrollTo({ left: 0, top: 0 });
  }, [computeFitScale]);

  const onStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Mac 触控板双指滑动是普通 wheel（无 ctrl）→ 交给 overflow 原生滚动平移。
    // 触控板捏合 / Ctrl·⌘+滚轮带 ctrlKey/metaKey → 缩放（勿把双指滑动绑成缩放）。
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    const factor =
      e.deltaMode === 0
        ? Math.exp(-e.deltaY * 0.01)
        : e.deltaY < 0
          ? VOCAB_REF_ZOOM_STEP
          : 1 / VOCAB_REF_ZOOM_STEP;
    applyZoomAtPointer(e.clientX, e.clientY, zoomRef.current * factor);
  };

  const onStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);

    if (activePointersRef.current.size === 2) {
      clearLongPressTimer();
      longPressOriginRef.current = null;
      longPressFiredRef.current = false;
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
      longPressFiredRef.current = false;
      // 先不立刻平移：留给长按保存；手指移动超过阈值后再开 pan
      panSessionRef.current = null;
      clearLongPressTimer();
      longPressOriginRef.current = { x: e.clientX, y: e.clientY };
      if (onImageLongPressRef.current) {
        const pointerId = e.pointerId;
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          if (!activePointersRef.current.has(pointerId)) return;
          if (activePointersRef.current.size !== 1) return;
          longPressFiredRef.current = true;
          panSessionRef.current = null;
          onImageLongPressRef.current?.();
        }, VOCAB_REF_IMAGE_LONG_PRESS_MS);
      }
    }
  };

  const onStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || !activePointersRef.current.has(e.pointerId)) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pinch = pinchSessionRef.current;
    if (pinch && activePointersRef.current.size >= 2) {
      clearLongPressTimer();
      longPressOriginRef.current = null;
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

    if (longPressFiredRef.current) return;

    if (
      !panSessionRef.current &&
      longPressOriginRef.current &&
      activePointersRef.current.size === 1
    ) {
      const origin = longPressOriginRef.current;
      const moved = Math.hypot(e.clientX - origin.x, e.clientY - origin.y);
      if (moved >= VOCAB_REF_IMAGE_LONG_PRESS_MOVE_PX) {
        clearLongPressTimer();
        longPressOriginRef.current = null;
        panSessionRef.current = {
          pointerId: e.pointerId,
          startX: origin.x,
          startY: origin.y,
          scrollLeft: stage.scrollLeft,
          scrollTop: stage.scrollTop,
        };
      } else {
        return;
      }
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
    clearLongPressTimer();
    longPressOriginRef.current = null;
    if (activePointersRef.current.size < 2) {
      pinchSessionRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      panSessionRef.current = null;
      longPressFiredRef.current = false;
    } else if (activePointersRef.current.size === 1 && !pinchSessionRef.current) {
      const remaining = [...activePointersRef.current.entries()][0];
      if (remaining && stage) {
        longPressFiredRef.current = false;
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

  return {
    zoom,
    fitScale,
    imgReady,
    displayScale,
    stageRef,
    imgRef,
    zoomAtCenter,
    resetView,
    onStageWheel,
    onStagePointerDown,
    onStagePointerMove,
    endPointer,
    onImageLoad,
  };
}

type ZoomButtonsProps = {
  api: VocabRefImageZoomApi;
  className?: string;
  buttonClassName?: string;
};

export function VocabRefImageZoomButtons({ api, className, buttonClassName }: ZoomButtonsProps) {
  return (
    <div className={className}>
      <button
        type="button"
        className={buttonClassName}
        disabled={api.zoom <= VOCAB_REF_ZOOM_MIN}
        onClick={() => api.zoomAtCenter(1 / VOCAB_REF_ZOOM_STEP)}
        aria-label="缩小"
      >
        −
      </button>
      <button
        type="button"
        className={buttonClassName}
        disabled={api.zoom >= VOCAB_REF_ZOOM_MAX}
        onClick={() => api.zoomAtCenter(VOCAB_REF_ZOOM_STEP)}
        aria-label="放大"
      >
        +
      </button>
      <button
        type="button"
        className={buttonClassName}
        disabled={api.zoom <= VOCAB_REF_ZOOM_MIN && api.fitScale >= 1}
        onClick={api.resetView}
      >
        重置
      </button>
    </div>
  );
}

type ZoomStageProps = {
  api: VocabRefImageZoomApi;
  mediaUrl: string;
  title: string;
  stageClassName?: string;
  canvasClassName?: string;
  imageClassName?: string;
};

export function VocabRefImageZoomStage({
  api,
  mediaUrl,
  title,
  stageClassName,
  canvasClassName,
  imageClassName,
}: ZoomStageProps) {
  const { imgRef, displayScale, imgReady } = api;

  return (
    <div
      ref={api.stageRef}
      className={stageClassName}
      onWheel={api.onStageWheel}
      onPointerDown={api.onStagePointerDown}
      onPointerMove={api.onStagePointerMove}
      onPointerUp={api.endPointer}
      onPointerCancel={api.endPointer}
    >
      <div
        className={canvasClassName}
        style={{
          width: imgReady && imgRef.current ? imgRef.current.naturalWidth * displayScale : undefined,
          height: imgReady && imgRef.current ? imgRef.current.naturalHeight * displayScale : undefined,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={api.imgRef}
          src={mediaUrl}
          alt={title}
          draggable={false}
          className={imageClassName}
          style={{
            width: imgReady && imgRef.current ? imgRef.current.naturalWidth * displayScale : "auto",
            height: imgReady && imgRef.current ? imgRef.current.naturalHeight * displayScale : "auto",
            WebkitTouchCallout: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onContextMenu={(e) => e.preventDefault()}
          onLoad={api.onImageLoad}
        />
      </div>
    </div>
  );
}
