export type BrushStroke = {
  type: "brush";
  points: { x: number; y: number }[];
  color: string;
  width: number;
};

export type LineStroke = {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
};

export type RectStroke = {
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

export type TextStroke = {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
};

export type Stroke = BrushStroke | LineStroke | RectStroke | TextStroke;

export type PreviewRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export const ANNOTATE_COLOR = "#e85d6f";
export const BRUSH_WIDTH = 4;
/**
 * 涂抹：框选矩形后用不透明深色盖住原文，并写上说明。
 * 勿用白色（像 AI 缺图）；纯黑无字也怪——必须带 label。
 */
export const SMEAR_COLOR = "#2a3140";
export const SMEAR_LABEL_COLOR = "#f4f6f9";
export const SMEAR_BORDER_COLOR = "#e85d6f";
export const SMEAR_LABEL = "此内容由AI生成，经核验不准确，已涂抹";
export const SMEAR_MIN_SIZE = 4;
export const LINE_WIDTH = 3;
export const DEFAULT_TEXT_SIZE = 16;
export const TEXT_SIZE_MIN = 12;
export const TEXT_SIZE_MAX = 96;
export const TEXT_SIZE_STEP = 4;

export function clampTextSize(size: number): number {
  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, size));
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number) {
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

export function drawSmearLabel(
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

export type CanvasPointerLike = { clientX: number; clientY: number };

export function pointerToCanvas(e: CanvasPointerLike, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

export function screenToCanvasPoint(
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

export async function renderAnnotatedBlob(
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

export function drawAllStrokes(
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

export function downloadFilename(refKey: string, lessonId: number): string {
  return `${refKey}-lesson-${lessonId}-annotate.png`;
}

export function hitTestTextStroke(
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
