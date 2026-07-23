/**
 * 韩语发音勾选页：导出「随机抽问卡片」PNG。
 * 仅含韩语字母（乱序），不含罗马音 / 读音——供老师线下指着卡片抽问。
 * 纯 Canvas，禁止引入 html2canvas / jspdf 等重依赖。
 */

import { beijingDateTimeString } from "@/lib/jp-vocab-daily-check";

export type KoPronQuizCardLetter = {
  letter: string;
};

const CARD_PAD = 48;
const TITLE_H = 56;
const HINT_H = 36;
const FOOTER_H = 40;
const CELL_MIN = 96;
const CELL_MAX = 140;
const COLS_CAP = 5;

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function pickGrid(count: number): { cols: number; rows: number; cell: number } {
  const cols = Math.min(COLS_CAP, Math.max(2, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / cols);
  const cell =
    count <= 6 ? CELL_MAX : count <= 16 ? 120 : count <= 25 ? 108 : CELL_MIN;
  return { cols, rows, cell };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("生成图片失败"));
    }, "image/png");
  });
}

/** 乱序后画一张仅含字母的抽问卡，并触发下载 */
export async function exportKoPronRandomQuizCard(
  letters: KoPronQuizCardLetter[]
): Promise<{ count: number; filename: string }> {
  const glyphs = letters
    .map((row) => (row.letter || "").trim())
    .filter(Boolean);
  if (glyphs.length < 1) {
    throw new Error("没有可导出的字母");
  }

  const shuffled = shuffleInPlace([...glyphs]);
  const { cols, rows, cell } = pickGrid(shuffled.length);
  const gap = 16;
  const gridW = cols * cell + (cols - 1) * gap;
  const gridH = rows * cell + (rows - 1) * gap;
  const width = Math.max(gridW + CARD_PAD * 2, 480);
  const height = CARD_PAD + TITLE_H + HINT_H + gridH + FOOTER_H + CARD_PAD;
  const gridLeft = Math.round((width - gridW) / 2);
  const gridTop = CARD_PAD + TITLE_H + HINT_H;

  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.scale(dpr, dpr);

  // 导出图用浅色底，方便微信发送 / 打印（与站内暗色 UI 无关）
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 28px \"Apple SD Gothic Neo\", \"Malgun Gothic\", \"Noto Sans KR\", sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("韩语发音抽问", width / 2, CARD_PAD + TITLE_H / 2 - 4);

  ctx.fillStyle = "#64748b";
  ctx.font = "15px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    `共 ${shuffled.length} 个字母 · 乱序 · 请读出读音（不含罗马音）`,
    width / 2,
    CARD_PAD + TITLE_H + HINT_H / 2 - 2
  );

  const glyphFont = `bold ${Math.round(cell * 0.52)}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "AppleGothic", sans-serif`;
  for (let i = 0; i < shuffled.length; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridLeft + col * (cell + gap);
    const y = gridTop + row * (cell + gap);

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.5;
    const r = 12;
    roundRect(ctx, x, y, cell, cell, r);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.font = glyphFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shuffled[i]!, x + cell / 2, y + cell / 2 + 2);
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "随机抽问卡片 · 每次导出顺序不同",
    width / 2,
    height - CARD_PAD / 2 - 4
  );

  const blob = await canvasToPngBlob(canvas);
  const stamp = beijingDateTimeString()
    .replace(/[-:\s]/g, "")
    .slice(0, 12);
  const filename = `韩语发音抽问卡片-${stamp}.png`;
  downloadBlob(blob, filename);
  return { count: shuffled.length, filename };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
