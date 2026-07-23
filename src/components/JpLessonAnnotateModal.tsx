"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { uploadFormWithProgress } from "@/lib/upload-form-progress";
import { notifyVocabRefUpdated } from "@/lib/vocab-ref-live";
import type { JpLessonRecord, JpVocabRef } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

type Tool = "brush" | "smear" | "line" | "text" | "zoom";

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.35;
const PAN_THRESHOLD = 6;

type BrushStroke = {
  type: "brush";
  points: { x: number; y: number }[];
  color: string;
  width: number;
};

type LineStroke = {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
};

type RectStroke = {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  /** 涂抹块上说明文字（如 AI 不准确已涂抹） */
  label: string;
  labelColor: string;
};

type TextStroke = {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
};

type Stroke = BrushStroke | LineStroke | RectStroke | TextStroke;

type PreviewRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type Props = {
  open: boolean;
  imageUrl: string;
  refKey: string;
  lessonId: number;
  lessonContent: string;
  locale: "en" | "zh";
  canSave: boolean;
  onClose: () => void;
  onSaved?: (ref: JpVocabRef, lesson: JpLessonRecord) => void;
  onNeedAuth?: () => void;
};

const ANNOTATE_COLOR = "#e85d6f";
const BRUSH_WIDTH = 4;
/**
 * 涂抹：框选矩形后用不透明深色盖住原文，并写上说明。
 * 勿用白色（像 AI 缺图）；纯黑无字也怪——必须带 label。
 */
const SMEAR_COLOR = "#2a3140";
const SMEAR_LABEL_COLOR = "#f4f6f9";
const SMEAR_BORDER_COLOR = "#e85d6f";
const SMEAR_LABEL = "此内容由AI生成，经核验不准确，已涂抹";
const SMEAR_MIN_SIZE = 4;
const LINE_WIDTH = 3;
const DEFAULT_TEXT_SIZE = 16;
const TEXT_SIZE_MIN = 12;
const TEXT_SIZE_MAX = 96;
const TEXT_SIZE_STEP = 4;

function clampTextSize(size: number): number {
  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, size));
}

function normalizeRect(x1: number, y1: number, x2: number, y2: number) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return {
    x,
    y,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (maxWidth <= 0) return [text];
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = "";
  for (const ch of chars) {
    const next = current + ch;
    if (ctx.measureText(next).width <= maxWidth || current.length === 0) {
      current = next;
      continue;
    }
    lines.push(current);
    current = ch;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

function pickSmearLabelFontSize(width: number, height: number): number {
  const byBox = Math.floor(Math.min(width, height) / 5.5);
  const byWidth = Math.floor(width / 14);
  return Math.min(32, Math.max(11, Math.min(byBox, byWidth)));
}

function drawSmearLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  labelColor: string
) {
  if (!label || width < 8 || height < 8) return;
  const pad = Math.max(6, Math.min(14, Math.floor(Math.min(width, height) * 0.08)));
  const maxWidth = Math.max(8, width - pad * 2);
  let fontSize = pickSmearLabelFontSize(width, height);
  let lines: string[] = [];
  let lineHeight = fontSize * 1.35;

  for (let attempt = 0; attempt < 8; attempt++) {
    ctx.font = `600 ${fontSize}px "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", sans-serif`;
    lines = wrapTextLines(ctx, label, maxWidth);
    lineHeight = fontSize * 1.35;
    const blockHeight = lines.length * lineHeight;
    if (blockHeight <= height - pad * 2 || fontSize <= 11) break;
    fontSize -= 1;
  }

  const blockHeight = lines.length * lineHeight;
  let startY = y + (height - blockHeight) / 2;
  if (startY < y + pad) startY = y + pad;

  ctx.fillStyle = labelColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const cx = x + width / 2;
  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * lineHeight;
    if (ly + fontSize > y + height - pad / 2) break;
    ctx.fillText(lines[i], cx, ly, maxWidth);
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawSmearRect(
  ctx: CanvasRenderingContext2D,
  stroke: Pick<
    RectStroke,
    "x" | "y" | "width" | "height" | "color" | "label" | "labelColor"
  >,
  opts?: { preview?: boolean }
) {
  const { x, y, width, height } = stroke;
  if (opts?.preview) {
    ctx.fillStyle = "rgba(42, 49, 64, 0.72)";
  } else {
    ctx.fillStyle = stroke.color;
  }
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = SMEAR_BORDER_COLOR;
  ctx.lineWidth = Math.max(2, Math.min(4, Math.floor(Math.min(width, height) / 40)));
  if (opts?.preview) {
    ctx.setLineDash([6, 4]);
  }
  ctx.strokeRect(x + 1, y + 1, Math.max(0, width - 2), Math.max(0, height - 2));
  ctx.setLineDash([]);
  drawSmearLabel(
    ctx,
    x,
    y,
    width,
    height,
    stroke.label || SMEAR_LABEL,
    stroke.labelColor || SMEAR_LABEL_COLOR
  );
}

function pointerToCanvas(
  e: React.PointerEvent<HTMLCanvasElement> | PointerEvent,
  canvas: HTMLCanvasElement
) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function screenToCanvasPoint(
  screenX: number,
  screenY: number,
  canvas: HTMLCanvasElement
) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (screenX - rect.left) * scaleX,
    y: (screenY - rect.top) * scaleY,
  };
}

async function renderAnnotatedBlob(
  img: HTMLImageElement,
  strokes: Stroke[]
): Promise<Blob> {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = img.naturalWidth;
  exportCanvas.height = img.naturalHeight;
  const ctx = exportCanvas.getContext("2d");
  if (!ctx) throw new Error("无法导出图片");
  ctx.drawImage(img, 0, 0);
  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    exportCanvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new Error("导出失败");
  return blob;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;

  if (stroke.type === "brush") {
    if (stroke.points.length < 2) {
      const p = stroke.points[0];
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    return;
  }

  if (stroke.type === "line") {
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(stroke.x1, stroke.y1);
    ctx.lineTo(stroke.x2, stroke.y2);
    ctx.stroke();
    return;
  }

  if (stroke.type === "rect") {
    drawSmearRect(ctx, stroke);
    return;
  }

  ctx.font = `${stroke.fontSize}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(stroke.text, stroke.x, stroke.y);
}

function drawPreviewSmearRect(ctx: CanvasRenderingContext2D, preview: PreviewRect) {
  const { x, y, width, height } = normalizeRect(
    preview.x1,
    preview.y1,
    preview.x2,
    preview.y2
  );
  if (width < 1 && height < 1) return;
  drawSmearRect(
    ctx,
    {
      x,
      y,
      width,
      height,
      color: SMEAR_COLOR,
      label: SMEAR_LABEL,
      labelColor: SMEAR_LABEL_COLOR,
    },
    { preview: true }
  );
}

function drawAllStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  previewLine?: { x1: number; y1: number; x2: number; y2: number } | null,
  activeTextIndex?: number | null,
  previewRect?: PreviewRect | null
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let i = 0; i < strokes.length; i++) {
    drawStroke(ctx, strokes[i]);
    const stroke = strokes[i];
    if (i === activeTextIndex && stroke.type === "text") {
      ctx.font = `${stroke.fontSize}px sans-serif`;
      ctx.textBaseline = "top";
      const width = ctx.measureText(stroke.text).width;
      const height = stroke.fontSize * 1.25;
      const pad = 4;
      ctx.strokeStyle = ANNOTATE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        stroke.x - pad,
        stroke.y - pad,
        width + pad * 2,
        height + pad * 2
      );
      ctx.setLineDash([]);
    }
  }
  if (previewLine) {
    ctx.strokeStyle = ANNOTATE_COLOR;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(previewLine.x1, previewLine.y1);
    ctx.lineTo(previewLine.x2, previewLine.y2);
    ctx.stroke();
  }
  if (previewRect) {
    drawPreviewSmearRect(ctx, previewRect);
  }
}

function downloadFilename(refKey: string, lessonId: number): string {
  return `${refKey}-lesson-${lessonId}-annotate.png`;
}

function hitTestTextStroke(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  point: { x: number; y: number }
): number {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    if (stroke.type !== "text") continue;
    ctx.font = `${stroke.fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    const width = ctx.measureText(stroke.text).width;
    const height = stroke.fontSize * 1.25;
    const pad = 8;
    if (
      point.x >= stroke.x - pad &&
      point.x <= stroke.x + width + pad &&
      point.y >= stroke.y - pad &&
      point.y <= stroke.y + height + pad
    ) {
      return i;
    }
  }
  return -1;
}

export function JpLessonAnnotateModal({
  open,
  imageUrl,
  refKey,
  lessonId,
  lessonContent,
  locale,
  canSave,
  onClose,
  onSaved,
  onNeedAuth,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [imgReady, setImgReady] = useState(false);
  const [imgLoadError, setImgLoadError] = useState("");
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

  const computeFitScale = useCallback(() => {
    const img = imgRef.current;
    const stage = stageRef.current;
    if (!img?.naturalWidth || !img.naturalHeight || !stage) return 1;
    const stageRect = stage.getBoundingClientRect();
    return Math.min(
      (stageRect.width - 24) / img.naturalWidth,
      (stageRect.height - 24) / img.naturalHeight,
      1
    );
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
    setImgLoadError("教案图片加载失败。请关闭后重试；若仍失败请检查教案是否为图片。");
  }, []);

  useEffect(() => {
    if (!open || !imageUrl) return;
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      syncCanvasSize();
    }
  }, [open, imageUrl, syncCanvasSize]);

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
      const blob = await renderAnnotatedBlob(img, strokes);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename(refKey, lessonId);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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
      const blob = await renderAnnotatedBlob(img, strokes);
      const file = new File([blob], `${refKey || `lesson-${lessonId}`}.png`, {
        type: "image/png",
      });
      const form = new FormData();
      form.append("lesson_id", String(lessonId));
      form.append("file", file);
      form.append("media_type", "image");

      const result = await uploadFormWithProgress({
        url: "/api/jp-lesson/ref/replace",
        form,
        headers: { [LOCALE_HEADER]: locale },
      });

      const data = result.data as {
        ok?: boolean;
        ref?: JpVocabRef;
        lesson?: JpLessonRecord;
        error?: string;
      };

      if (result.status === 401) {
        onNeedAuth?.();
        throw new Error("请登录后再保存教案。");
      }
      if (!result.ok || !data.ok || !data.ref || !data.lesson) {
        throw new Error(data.error || "保存失败");
      }

      setSaveStatus("已保存为最新教案");
      notifyVocabRefUpdated({
        subject: "jp",
        refKey: data.ref.ref_key,
        updatedAt: data.ref.updated_at,
      });
      onSaved?.(data.ref, data.lesson);
      window.setTimeout(() => setSaveStatus(""), 2500);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div className="jp-annotate" role="dialog" aria-modal="true" aria-label="随手画">
        <div className="jp-annotate-bar">
          <div className="jp-annotate-bar-main">
            <span className="jp-annotate-title">随手画</span>
            <span className="jp-annotate-subtitle" title={lessonContent}>
              {lessonContent}
            </span>
          </div>
          <div className="jp-annotate-tools">
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
                onClick={() => setTool(id)}
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
                  onClick={() => applyTextFontSize(textFontSize - TEXT_SIZE_STEP)}
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
                  onChange={(e) => applyTextFontSize(Number(e.target.value))}
                />
                <span className="jp-annotate-text-size-value">{textFontSize}</span>
                <button
                  type="button"
                  className="jp-annotate-tool jp-annotate-text-size-btn"
                  disabled={textFontSize >= TEXT_SIZE_MAX}
                  aria-label="增大字号"
                  onClick={() => applyTextFontSize(textFontSize + TEXT_SIZE_STEP)}
                >
                  +
                </button>
              </div>
            ) : null}
            <span className="jp-annotate-tool-sep" aria-hidden="true" />
            <button
              type="button"
              className="jp-annotate-tool"
              disabled={!imgReady || zoom >= ZOOM_MAX}
              onClick={() => {
                const canvas = canvasRef.current;
                const stage = stageRef.current;
                if (!canvas || !stage) return;
                const rect = stage.getBoundingClientRect();
                zoomAtPointer(rect.left + rect.width / 2, rect.top + rect.height / 2, ZOOM_STEP);
              }}
            >
              放大
            </button>
            <button
              type="button"
              className="jp-annotate-tool"
              disabled={!imgReady || zoom <= ZOOM_MIN}
              onClick={() => {
                const canvas = canvasRef.current;
                const stage = stageRef.current;
                if (!canvas || !stage) return;
                const rect = stage.getBoundingClientRect();
                zoomAtPointer(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / ZOOM_STEP);
              }}
            >
              缩小
            </button>
            <button
              type="button"
              className="jp-annotate-tool"
              disabled={!imgReady || zoom <= ZOOM_MIN}
              onClick={resetZoom}
            >
              适应
            </button>
            <span className="jp-annotate-tool-sep" aria-hidden="true" />
            <button
              type="button"
              className="jp-annotate-tool"
              disabled={strokes.length === 0}
              onClick={undo}
            >
              撤销
            </button>
            <button
              type="button"
              className="jp-annotate-tool"
              disabled={strokes.length === 0}
              onClick={clearAll}
            >
              清空
            </button>
            <button
              type="button"
              className="jp-annotate-tool jp-annotate-tool--accent"
              disabled={!imgReady || downloading || saving}
              onClick={() => void downloadAnnotated()}
            >
              {downloading ? "下载中…" : "下载到本地"}
            </button>
            <button
              type="button"
              className="jp-annotate-tool jp-annotate-tool--save"
              disabled={!imgReady || downloading || saving}
              onClick={() => void saveAsLatestRef()}
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
          「涂抹」：拖拽框选正方/长方形，松手后用不透明深色盖住原文，并自动写上「此内容由AI生成，经核验不准确，已涂抹」。「文字」下点击空白添加文字，拖动输入框可移到目标位置；点击已有文字可选中并拖动，按 Backspace / Delete 删除选中文字；字号滑条调节新文字或选中文字大小。保存为最新教案会覆盖线上图片；关闭后未保存的批注即消失。
        </p>

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

      <style jsx global>{`
        .jp-annotate {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          flex-direction: column;
          background: rgba(8, 12, 18, 0.92);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }

        .jp-annotate-bar {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.65rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
        }

        .jp-annotate-bar-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .jp-annotate-title {
          font-size: 0.9375rem;
          color: var(--text);
          font-weight: 600;
        }

        .jp-annotate-subtitle {
          font-size: 0.75rem;
          color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .jp-annotate-tools {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 0.35rem;
          max-width: min(100%, 42rem);
        }

        .jp-annotate-tool {
          min-height: 2rem;
          padding: 0.25rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font: inherit;
          font-size: 0.8125rem;
          cursor: pointer;
        }

        .jp-annotate-tool:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }

        .jp-annotate-tool.is-active {
          color: var(--rise);
          border-color: color-mix(in srgb, var(--rise) 55%, var(--border));
          background: color-mix(in srgb, var(--rise) 12%, var(--panel));
        }

        .jp-annotate-tool:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .jp-annotate-tool--accent {
          color: var(--accent);
        }

        .jp-annotate-tool--save {
          color: var(--fall);
          border-color: color-mix(in srgb, var(--fall) 50%, var(--border));
          background: color-mix(in srgb, var(--fall) 10%, var(--panel));
        }

        .jp-annotate-tool--save:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--fall) 65%, var(--border));
          background: color-mix(in srgb, var(--fall) 16%, var(--panel));
        }

        .jp-annotate-save-status {
          align-self: center;
          font-size: 0.75rem;
          color: var(--fall);
          white-space: nowrap;
        }

        .jp-annotate-tool-sep {
          width: 1px;
          height: 1.25rem;
          background: color-mix(in srgb, var(--border) 80%, transparent);
          margin-inline: 0.1rem;
        }

        .jp-annotate-text-size {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.1rem 0.35rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--rise) 8%, var(--panel));
        }

        .jp-annotate-text-size-label {
          font-size: 0.75rem;
          color: var(--muted);
          white-space: nowrap;
        }

        .jp-annotate-text-size-btn {
          min-width: 1.75rem;
          padding-inline: 0.35rem;
        }

        .jp-annotate-text-size-value {
          min-width: 1.5rem;
          font-size: 0.75rem;
          color: var(--text);
          text-align: center;
          font-variant-numeric: tabular-nums;
        }

        .jp-annotate-text-size-range {
          width: 4.5rem;
          accent-color: var(--rise);
          cursor: pointer;
        }

        .jp-annotate-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }

        .jp-annotate-close:hover {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        }

        .jp-annotate-hint {
          margin: 0;
          padding: 0.45rem 0.85rem;
          font-size: 0.75rem;
          color: var(--muted);
          border-bottom: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
        }

        .jp-annotate-stage {
          flex: 1;
          min-height: 0;
          padding: 0.75rem;
          overflow: auto;
          position: relative;
        }

        .jp-annotate-stage-inner {
          min-width: 100%;
          min-height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jp-annotate-loading {
          position: absolute;
          z-index: 1;
          margin: 0;
          color: var(--muted);
          font-size: 0.875rem;
        }

        .jp-annotate-canvas-wrap {
          position: relative;
          display: block;
          flex-shrink: 0;
          opacity: 0;
          pointer-events: none;
        }

        .jp-annotate-canvas-wrap.is-ready {
          opacity: 1;
          pointer-events: auto;
        }

        .jp-annotate-img,
        .jp-annotate-canvas {
          display: block;
          width: 100%;
          height: 100%;
        }

        .jp-annotate-canvas {
          position: absolute;
          inset: 0;
          cursor: crosshair;
          touch-action: none;
        }

        .jp-annotate-canvas-wrap.is-zoom-tool .jp-annotate-canvas {
          cursor: zoom-in;
        }

        .jp-annotate-canvas-wrap.is-zoom-tool.is-zoomed .jp-annotate-canvas {
          cursor: grab;
        }

        .jp-annotate-canvas-wrap.is-zoom-tool.is-zoomed .jp-annotate-canvas:active {
          cursor: grabbing;
        }

        .jp-annotate-canvas-wrap.is-text-tool .jp-annotate-canvas {
          cursor: text;
        }

        .jp-annotate-canvas-wrap.is-smear-tool .jp-annotate-canvas {
          cursor: crosshair;
        }

        .jp-annotate-canvas-wrap.is-text-selected .jp-annotate-canvas {
          cursor: move;
        }

        .jp-annotate-text-pop {
          position: fixed;
          z-index: 1210;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          min-width: 12rem;
          max-width: min(90vw, 20rem);
          padding: 0.45rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--panel);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        }

        .jp-annotate-text-pop-handle {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 1.5rem;
          padding: 0.1rem 0.35rem;
          border-radius: 4px;
          border: 1px dashed color-mix(in srgb, var(--border) 85%, var(--muted));
          background: color-mix(in srgb, var(--muted) 8%, var(--panel));
          color: var(--muted);
          font-size: 0.6875rem;
          cursor: grab;
          touch-action: none;
          user-select: none;
        }

        .jp-annotate-text-pop-handle:active {
          cursor: grabbing;
        }

        .jp-annotate-text-input {
          width: 100%;
          min-height: 2rem;
          padding: 0.35rem 0.5rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
        }

        .jp-annotate-text-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.35rem;
        }

        .jp-annotate-text-btn {
          min-height: 1.75rem;
          padding: 0.15rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--accent);
          font: inherit;
          font-size: 0.8125rem;
          cursor: pointer;
        }

        @media (max-width: 768px) {
          .jp-annotate-bar {
            flex-wrap: wrap;
          }

          .jp-annotate-tools {
            width: 100%;
            justify-content: flex-start;
          }

          .jp-annotate-tool {
            min-height: var(--touch-min, 44px);
          }

          .jp-annotate-close {
            width: var(--touch-min, 44px);
            height: var(--touch-min, 44px);
          }
        }
      `}</style>
    </>,
    document.body
  );
}
