"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  EnLessonRecord,
  EnVocabRef,
  JpLessonRecord,
  JpVocabRef,
} from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import {
  ANNOTATE_COLOR,
  BRUSH_WIDTH,
  DEFAULT_TEXT_SIZE,
  LINE_WIDTH,
  SMEAR_COLOR,
  SMEAR_LABEL,
  SMEAR_LABEL_COLOR,
  SMEAR_MIN_SIZE,
  clampTextSize,
  drawAllStrokes,
  hitTestTextStroke,
  normalizeRect,
  pointerToCanvas,
  screenToCanvasPoint,
  type BrushStroke,
  type PreviewRect,
  type Stroke,
} from "@/components/lesson-annotate/lesson-annotate-draw";
import {
  downloadAnnotatedImage,
  downloadAnnotatedPdf,
  saveAnnotatedLessonPdfRef,
  saveAnnotatedLessonRef,
} from "@/components/lesson-annotate/lesson-annotate-save";
import { composeAnnotatedPdfBlob } from "@/components/lesson-annotate/lesson-annotate-pdf";
import {
  useLessonAnnotatePdfPages,
  type LessonAnnotateMediaType,
} from "@/components/lesson-annotate/useLessonAnnotatePdfPages";
import { useLessonAnnotateBrowserBack } from "@/lib/lesson-annotate-browser-back";
import { LessonAnnotateModalStyles } from "@/components/lesson-annotate/LessonAnnotateModalStyles";
import { LessonAnnotateToolbar } from "@/components/lesson-annotate/LessonAnnotateToolbar";

type Tool = "brush" | "smear" | "line" | "text" | "zoom";

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.35;
const PAN_THRESHOLD = 6;

export type LessonAnnotateSubject = "jp" | "en";

export type LessonAnnotateModalProps = {
  open: boolean;
  imageUrl: string;
  /** 教案介质；PDF 按页转图批注后再存回 PDF */
  mediaType?: LessonAnnotateMediaType;
  refKey: string;
  lessonId: number;
  lessonContent: string;
  locale: "en" | "zh";
  canSave: boolean;
  subject: LessonAnnotateSubject;
  onClose: () => void;
  onSaved?: (
    ref: JpVocabRef | EnVocabRef,
    lesson: JpLessonRecord | EnLessonRecord
  ) => void;
  onNeedAuth?: () => void;
};

export function LessonAnnotateModal({
  open,
  imageUrl,
  mediaType = "image",
  refKey,
  lessonId,
  lessonContent,
  locale,
  canSave,
  subject,
  onClose,
  onSaved,
  onNeedAuth,
}: LessonAnnotateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [imgReady, setImgReady] = useState(false);
  const [imgLoadError, setImgLoadError] = useState("");
  const pdf = useLessonAnnotatePdfPages({
    open,
    mediaType,
    sourceUrl: imageUrl,
  });
  const displayUrl = pdf.isPdf ? pdf.pageDataUrl : imageUrl;
  const [tool, setTool] = useState<Tool>("brush");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [previewLine, setPreviewLine] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [previewRect, setPreviewRect] = useState<PreviewRect | null>(null);
  const [textDraft, setTextDraft] = useState<{
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    value: string;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [textFontSize, setTextFontSize] = useState(DEFAULT_TEXT_SIZE);
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lineStartRef = useRef<{ x: number; y: number } | null>(null);
  const smearStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeBrushRef = useRef<BrushStroke | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const panSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
  } | null>(null);
  const dragTextRef = useRef<{
    index: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const dragTextPopRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origScreenX: number;
    origScreenY: number;
  } | null>(null);

  const resetSession = useCallback(() => {
    setImgReady(false);
    setImgLoadError("");
    setTool("brush");
    setStrokes([]);
    setPreviewLine(null);
    setPreviewRect(null);
    setTextDraft(null);
    setFitScale(1);
    setZoom(1);
    setTextFontSize(DEFAULT_TEXT_SIZE);
    setSelectedTextIndex(null);
    lineStartRef.current = null;
    smearStartRef.current = null;
    activeBrushRef.current = null;
    panSessionRef.current = null;
    dragTextRef.current = null;
    dragTextPopRef.current = null;
  }, []);

  const displayScale = fitScale * zoom;

  useLessonAnnotateBrowserBack(open, lessonId, onClose);

  const computeFitScale = useCallback(() => {
    const img = imgRef.current;
    const stage = stageRef.current;
    if (!img?.naturalWidth || !img.naturalHeight || !stage) return 1;
    const stageRect = stage.getBoundingClientRect();
    // 按舞台宽度铺满（可纵向滚动）；不再用「完整塞进视口」把图压得很小。
    // 小图允许放大超过 1，避免一进来还要点两次「放大」。
    const widthFit = (stageRect.width - 24) / img.naturalWidth;
    return Math.min(Math.max(widthFit, 0.08), 4);
  }, []);

  const scrollToKeepCanvasPoint = useCallback(
    (clientX: number, clientY: number, prevZoom: number, nextZoom: number) => {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage || prevZoom === nextZoom) return;
      const canvasRect = canvas.getBoundingClientRect();
      const fx = (clientX - canvasRect.left) / canvasRect.width;
      const fy = (clientY - canvasRect.top) / canvasRect.height;
      const prevW = canvasRect.width;
      const prevH = canvasRect.height;
      const nextW = prevW * (nextZoom / prevZoom);
      const nextH = prevH * (nextZoom / prevZoom);
      stage.scrollLeft += fx * (nextW - prevW);
      stage.scrollTop += fy * (nextH - prevH);
    },
    []
  );

  const zoomAtPointer = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      setZoom((prevZoom) => {
        const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZoom * factor));
        if (nextZoom === prevZoom) return prevZoom;
        requestAnimationFrame(() => {
          scrollToKeepCanvasPoint(clientX, clientY, prevZoom, nextZoom);
        });
        return nextZoom;
      });
    },
    [scrollToKeepCanvasPoint]
  );

  const resetZoom = useCallback(() => {
    setZoom(1);
    stageRef.current?.scrollTo({ left: 0, top: 0 });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) resetSession();
  }, [open, imageUrl, resetSession]);

  const deleteSelectedStroke = useCallback(() => {
    if (selectedTextIndex == null) return;
    setStrokes((prev) => prev.filter((_, index) => index !== selectedTextIndex));
    setSelectedTextIndex(null);
  }, [selectedTextIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (textDraft) {
          setTextDraft(null);
          dragTextPopRef.current = null;
          return;
        }
        if (selectedTextIndex != null) {
          setSelectedTextIndex(null);
          return;
        }
        onClose();
        return;
      }

      if (textDraft) return;

      if (
        (e.key === "Backspace" || e.key === "Delete") &&
        selectedTextIndex != null
      ) {
        e.preventDefault();
        deleteSelectedStroke();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, textDraft, selectedTextIndex, deleteSelectedStroke]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (textDraft) {
      textInputRef.current?.focus();
    }
  }, [textDraft]);

  const syncCanvasSize = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.naturalWidth || !img.naturalHeight) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    setFitScale(computeFitScale());
    setZoom(1);
    setImgLoadError("");
    setImgReady(true);
  }, [computeFitScale]);

  const handleImgError = useCallback(() => {
    setImgReady(false);
    setImgLoadError(
      pdf.isPdf
        ? "PDF 页加载失败。请关闭后重试。"
        : "教案图片加载失败。请关闭后重试；若仍失败请检查教案是否为图片。"
    );
  }, [pdf.isPdf]);

  useEffect(() => {
    if (!open || !displayUrl) return;
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      syncCanvasSize();
    }
  }, [open, displayUrl, syncCanvasSize]);

  useEffect(() => {
    if (!open || !pdf.isPdf) return;
    if (pdf.error) {
      setImgReady(false);
      setImgLoadError(pdf.error);
      return;
    }
    if (pdf.loading && !pdf.pageDataUrl) {
      setImgReady(false);
      setImgLoadError("");
    }
  }, [open, pdf.isPdf, pdf.error, pdf.loading, pdf.pageDataUrl]);

  useEffect(() => {
    if (!open || !imgReady) return;
    const onResize = () => {
      const prevFit = fitScale;
      const nextFit = computeFitScale();
      if (Math.abs(nextFit - prevFit) > 0.001) {
        setFitScale(nextFit);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, imgReady, fitScale, computeFitScale]);

  const redraw = useCallback(
    (
      nextStrokes: Stroke[],
      nextPreview = previewLine,
      activeTextIndex = selectedTextIndex,
      nextPreviewRect = previewRect
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawAllStrokes(ctx, nextStrokes, nextPreview, activeTextIndex, nextPreviewRect);
    },
    [previewLine, previewRect, selectedTextIndex]
  );

  useEffect(() => {
    if (!imgReady) return;
    redraw(strokes, previewLine, selectedTextIndex, previewRect);
  }, [imgReady, strokes, previewLine, previewRect, selectedTextIndex, redraw]);

  const applyTextFontSize = useCallback(
    (nextSize: number) => {
      const clamped = clampTextSize(nextSize);
      setTextFontSize(clamped);
      if (selectedTextIndex == null) return;
      setStrokes((prev) => {
        const stroke = prev[selectedTextIndex];
        if (!stroke || stroke.type !== "text" || stroke.fontSize === clamped) return prev;
        const next = prev.map((item, index) =>
          index === selectedTextIndex && item.type === "text"
            ? { ...item, fontSize: clamped }
            : item
        );
        redraw(next, previewLine, selectedTextIndex);
        return next;
      });
    },
    [selectedTextIndex, previewLine, redraw]
  );

  const commitBrush = useCallback(() => {
    const brush = activeBrushRef.current;
    activeBrushRef.current = null;
    if (!brush || brush.points.length === 0) return;
    setStrokes((prev) => {
      const next = [...prev, brush];
      redraw(next, previewLine);
      return next;
    });
  }, [previewLine, redraw]);

  const handleZoomPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imgReady || textDraft) return;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    canvas.setPointerCapture(e.pointerId);
    panSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
      moved: false,
    };
  };

  const handleZoomPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const session = panSessionRef.current;
    const stage = stageRef.current;
    if (!session || !stage || session.pointerId !== e.pointerId) return;
    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;
    if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) {
      session.moved = true;
    }
    if (session.moved && zoom > 1) {
      stage.scrollLeft = session.scrollLeft - dx;
      stage.scrollTop = session.scrollTop - dy;
    }
  };

  const handleZoomPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    const session = panSessionRef.current;
    panSessionRef.current = null;
    if (!session || session.pointerId !== e.pointerId) return;
    if (!session.moved) {
      zoomAtPointer(e.clientX, e.clientY, ZOOM_STEP);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imgReady || textDraft) return;
    if (tool === "zoom") {
      handleZoomPointerDown(e);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const point = pointerToCanvas(e, canvas);

    if (tool === "text") {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const hitIndex = hitTestTextStroke(ctx, strokes, point);
        if (hitIndex >= 0) {
          const stroke = strokes[hitIndex];
          if (stroke.type === "text") {
            setSelectedTextIndex(hitIndex);
            setTextFontSize(stroke.fontSize);
            dragTextRef.current = {
              index: hitIndex,
              offsetX: point.x - stroke.x,
              offsetY: point.y - stroke.y,
            };
            return;
          }
        }
      }
      setSelectedTextIndex(null);
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;
      setTextDraft({
        x: point.x,
        y: point.y,
        screenX: rect.left + point.x * scaleX,
        screenY: rect.top + point.y * scaleY,
        value: "",
      });
      return;
    }

    if (tool === "line") {
      lineStartRef.current = point;
      setPreviewLine({
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
      });
      return;
    }

    if (tool === "smear") {
      smearStartRef.current = point;
      setPreviewRect({
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
      });
      return;
    }

    activeBrushRef.current = {
      type: "brush",
      points: [point],
      color: ANNOTATE_COLOR,
      width: BRUSH_WIDTH,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imgReady || textDraft) return;
    if (tool === "zoom") {
      handleZoomPointerMove(e);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = pointerToCanvas(e, canvas);

    const dragText = dragTextRef.current;
    if (tool === "text" && dragText) {
      const newX = point.x - dragText.offsetX;
      const newY = point.y - dragText.offsetY;
      setStrokes((prev) => {
        const next = prev.map((stroke, index) =>
          index === dragText.index && stroke.type === "text"
            ? { ...stroke, x: newX, y: newY }
            : stroke
        );
        redraw(next, previewLine, dragText.index);
        return next;
      });
      setSelectedTextIndex(dragText.index);
      return;
    }

    if (tool === "line" && lineStartRef.current) {
      const nextPreview = {
        x1: lineStartRef.current.x,
        y1: lineStartRef.current.y,
        x2: point.x,
        y2: point.y,
      };
      setPreviewLine(nextPreview);
      redraw(strokes, nextPreview);
      return;
    }

    if (tool === "smear" && smearStartRef.current) {
      const nextPreviewRect: PreviewRect = {
        x1: smearStartRef.current.x,
        y1: smearStartRef.current.y,
        x2: point.x,
        y2: point.y,
      };
      setPreviewRect(nextPreviewRect);
      redraw(strokes, previewLine, selectedTextIndex, nextPreviewRect);
      return;
    }

    const brush = activeBrushRef.current;
    if (tool === "brush" && brush) {
      brush.points.push(point);
      redraw([...strokes, brush], previewLine);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "zoom") {
      handleZoomPointerUp(e);
      return;
    }
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (tool === "text" && dragTextRef.current) {
      dragTextRef.current = null;
      return;
    }

    if (tool === "line" && lineStartRef.current) {
      const end = canvas ? pointerToCanvas(e, canvas) : null;
      const start = lineStartRef.current;
      lineStartRef.current = null;
      setPreviewLine(null);
      if (end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (Math.hypot(dx, dy) > 2) {
          setStrokes((prev) => {
            const next: Stroke[] = [
              ...prev,
              {
                type: "line",
                x1: start.x,
                y1: start.y,
                x2: end.x,
                y2: end.y,
                color: ANNOTATE_COLOR,
                width: LINE_WIDTH,
              },
            ];
            redraw(next, null);
            return next;
          });
        } else {
          redraw(strokes, null);
        }
      }
      return;
    }

    if (tool === "smear" && smearStartRef.current) {
      const end = canvas ? pointerToCanvas(e, canvas) : null;
      const start = smearStartRef.current;
      smearStartRef.current = null;
      setPreviewRect(null);
      if (end) {
        const rect = normalizeRect(start.x, start.y, end.x, end.y);
        if (rect.width >= SMEAR_MIN_SIZE && rect.height >= SMEAR_MIN_SIZE) {
          setStrokes((prev) => {
            const next: Stroke[] = [
              ...prev,
              {
                type: "rect",
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                color: SMEAR_COLOR,
                label: SMEAR_LABEL,
                labelColor: SMEAR_LABEL_COLOR,
              },
            ];
            redraw(next, null, selectedTextIndex, null);
            return next;
          });
        } else {
          redraw(strokes, null, selectedTextIndex, null);
        }
      }
      return;
    }

    if (tool === "brush") {
      commitBrush();
    }
  };

  const confirmText = () => {
    if (!textDraft) return;
    const trimmed = textDraft.value.trim();
    if (trimmed) {
      setStrokes((prev) => {
        const next: Stroke[] = [
          ...prev,
          {
            type: "text",
            x: textDraft.x,
            y: textDraft.y,
            text: trimmed,
            color: ANNOTATE_COLOR,
            fontSize: textFontSize,
          },
        ];
        const nextIndex = next.length - 1;
        redraw(next, previewLine, nextIndex);
        setSelectedTextIndex(nextIndex);
        setTextFontSize(textFontSize);
        return next;
      });
    }
    setTextDraft(null);
    dragTextPopRef.current = null;
  };

  const handleTextPopDragDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!textDraft) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragTextPopRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origScreenX: textDraft.screenX,
      origScreenY: textDraft.screenY,
    };
  };

  const handleTextPopDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragTextPopRef.current;
    const canvas = canvasRef.current;
    if (!session || session.pointerId !== e.pointerId || !textDraft || !canvas) return;
    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;
    const screenX = session.origScreenX + dx;
    const screenY = session.origScreenY + dy;
    const canvasPoint = screenToCanvasPoint(screenX, screenY, canvas);
    setTextDraft((prev) =>
      prev
        ? {
            ...prev,
            screenX,
            screenY,
            x: canvasPoint.x,
            y: canvasPoint.y,
          }
        : prev
    );
  };

  const handleTextPopDragUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragTextPopRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragTextPopRef.current = null;
  };

  const undo = () => {
    setSelectedTextIndex(null);
    setStrokes((prev) => {
      const next = prev.slice(0, -1);
      redraw(next, previewLine, null);
      return next;
    });
  };

  const clearAll = () => {
    setSelectedTextIndex(null);
    setStrokes([]);
    setPreviewLine(null);
    setPreviewRect(null);
    redraw([], null, null, null);
  };

  const downloadAnnotated = async () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || downloading || saving) return;
    setDownloading(true);
    try {
      await downloadAnnotatedImage(img, strokes, refKey, lessonId);
    } catch {
      window.alert("下载失败，请重试");
    } finally {
      setDownloading(false);
    }
  };

  const saveAsLatestRef = async () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || downloading || saving) return;
    if (!canSave) {
      onNeedAuth?.();
      return;
    }
    if (
      !window.confirm(
        "将用当前批注覆盖线上教案图片，其他新课不受影响。确定保存吗？"
      )
    ) {
      return;
    }

    setSaving(true);
    setSaveStatus("");
    try {
      await saveAnnotatedLessonRef({
        img,
        strokes,
        refKey,
        lessonId,
        subject,
        locale,
        onNeedAuth,
        onSaved,
      });
      setSaveStatus("已保存为最新教案");
      window.setTimeout(() => setSaveStatus(""), 2500);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleZoomInCenter = () => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const rect = stage.getBoundingClientRect();
    zoomAtPointer(rect.left + rect.width / 2, rect.top + rect.height / 2, ZOOM_STEP);
  };

  const handleZoomOutCenter = () => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const rect = stage.getBoundingClientRect();
    zoomAtPointer(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / ZOOM_STEP);
  };

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div className="jp-annotate" role="dialog" aria-modal="true" aria-label="随手画">
        <LessonAnnotateToolbar
          lessonContent={lessonContent}
          tool={tool}
          textFontSize={textFontSize}
          imgReady={imgReady}
          zoom={zoom}
          zoomMin={ZOOM_MIN}
          zoomMax={ZOOM_MAX}
          strokesCount={strokes.length}
          downloading={downloading}
          saving={saving}
          saveStatus={saveStatus}
          onToolChange={setTool}
          onTextFontSizeChange={applyTextFontSize}
          onZoomIn={handleZoomInCenter}
          onZoomOut={handleZoomOutCenter}
          onResetZoom={resetZoom}
          onUndo={undo}
          onClearAll={clearAll}
          onDownload={() => void downloadAnnotated()}
          onSave={() => void saveAsLatestRef()}
          onClose={onClose}
        />

        <div className="jp-annotate-stage" ref={stageRef}>
          {!imgReady && !imgLoadError ? (
            <p className="jp-annotate-loading">教案加载中…</p>
          ) : null}
          {imgLoadError ? (
            <p className="jp-annotate-loading" role="alert">
              {imgLoadError}
            </p>
          ) : null}
          <div className="jp-annotate-stage-inner">
            <div
              ref={wrapRef}
              className={`jp-annotate-canvas-wrap${imgReady ? " is-ready" : ""}${
                tool === "zoom" ? " is-zoom-tool" : ""
              }${zoom > 1 ? " is-zoomed" : ""}${
                tool === "text" ? " is-text-tool" : ""
              }${tool === "smear" ? " is-smear-tool" : ""}${
                selectedTextIndex != null ? " is-text-selected" : ""
              }`}
              style={
                imgReady && imgRef.current
                  ? {
                      width: imgRef.current.naturalWidth * displayScale,
                      height: imgRef.current.naturalHeight * displayScale,
                    }
                  : undefined
              }
            >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={imageUrl}
              ref={imgRef}
              src={imageUrl}
              alt="教案"
              className="jp-annotate-img"
              onLoad={syncCanvasSize}
              onError={handleImgError}
            />
            <canvas
              ref={canvasRef}
              className="jp-annotate-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={(e) => {
                if (tool === "zoom") {
                  if (panSessionRef.current?.pointerId === e.pointerId) {
                    handleZoomPointerUp(e);
                  }
                  return;
                }
                if (tool === "text" && dragTextRef.current) {
                  return;
                }
                if (tool === "brush" && activeBrushRef.current) {
                  commitBrush();
                }
                if (tool === "line" && lineStartRef.current) {
                  lineStartRef.current = null;
                  setPreviewLine(null);
                  redraw(strokes, null);
                }
                if (tool === "smear" && smearStartRef.current) {
                  smearStartRef.current = null;
                  setPreviewRect(null);
                  redraw(strokes, null, selectedTextIndex, null);
                }
                if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
                  canvasRef.current.releasePointerCapture(e.pointerId);
                }
              }}
            />
          </div>
          </div>
        </div>

        {textDraft ? (
          <div
            className="jp-annotate-text-pop"
            style={{ left: textDraft.screenX, top: textDraft.screenY }}
          >
            <div
              className="jp-annotate-text-pop-handle"
              onPointerDown={handleTextPopDragDown}
              onPointerMove={handleTextPopDragMove}
              onPointerUp={handleTextPopDragUp}
              onPointerCancel={handleTextPopDragUp}
            >
              拖动
            </div>
            <input
              ref={textInputRef}
              type="text"
              className="jp-annotate-text-input"
              value={textDraft.value}
              placeholder="输入文字，Enter 确认"
              onChange={(e) =>
                setTextDraft((prev) => (prev ? { ...prev, value: e.target.value } : prev))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmText();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setTextDraft(null);
                  dragTextPopRef.current = null;
                }
              }}
            />
            <div className="jp-annotate-text-actions">
              <button type="button" className="jp-annotate-text-btn" onClick={confirmText}>
                确定
              </button>
              <button
                type="button"
                className="jp-annotate-text-btn"
                onClick={() => {
                  setTextDraft(null);
                  dragTextPopRef.current = null;
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <LessonAnnotateModalStyles />
    </>,
    document.body
  );
}
