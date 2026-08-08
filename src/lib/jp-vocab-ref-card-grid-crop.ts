/**
 * 标日「图片版单词教案」词卡网格：按行间通栏白缝横切。
 * 旧版「第 N 部分」标题栏切段见 jp-vocab-ref-pdf-export.ts。
 */

export type CardGridRowSplit = number;

function rowInkFraction(
  data: Uint8ClampedArray,
  width: number,
  y: number
): number {
  const x0 = Math.max(0, Math.floor(width * 0.04));
  const x1 = Math.min(width, Math.ceil(width * 0.96));
  let ink = 0;
  let total = 0;
  for (let x = x0; x < x1; x += 2) {
    const i = (y * width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    total++;
    if (!(r > 245 && g > 245 && b > 245)) ink++;
  }
  return total ? ink / total : 0;
}

function meanInk(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  y0: number,
  y1: number
): number {
  const a = Math.max(0, y0);
  const b = Math.min(height, y1);
  if (b <= a) return 0;
  let sum = 0;
  for (let y = a; y < b; y++) sum += rowInkFraction(data, width, y);
  return sum / (b - a);
}

function darkFrac(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  y0: number,
  y1: number
): number {
  const a = Math.max(0, y0);
  const b = Math.min(height, y1);
  if (b <= a) return 0;
  const x0 = Math.max(0, Math.floor(width * 0.04));
  const x1 = Math.min(width, Math.ceil(width * 0.96));
  let dark = 0;
  let total = 0;
  for (let y = a; y < b; y++) {
    for (let x = x0; x < x1; x += 4) {
      const i = (y * width + x) * 4;
      total++;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 90) dark++;
    }
  }
  return total ? dark / total : 0;
}

/**
 * 找词卡网格的行间切点（通栏近白缝中点）。
 * 返回 null = 不像词卡网格，应回退旧「部分标题」切段。
 * 返回 [] = 只有一行（含课头），不必再切。
 * 返回 [y…] = 第 2 行起的起点（第一节从 0 含课头）。
 */
export function detectWordCardGridRowSplits(
  data: Uint8ClampedArray,
  width: number,
  height: number
): number[] | null {
  if (width < 200 || height < 280) return null;

  const ink: number[] = new Array(height);
  for (let y = 0; y < height; y++) {
    ink[y] = rowInkFraction(data, width, y);
  }
  const smooth: number[] = new Array(height);
  for (let y = 0; y < height; y++) {
    const a = Math.max(0, y - 1);
    const b = Math.min(height, y + 2);
    let sum = 0;
    for (let i = a; i < b; i++) sum += ink[i];
    smooth[y] = sum / (b - a);
  }

  const gutters: { start: number; end: number }[] = [];
  let runStart: number | null = null;
  for (let y = 0; y < height; y++) {
    const on = smooth[y] < 0.08;
    if (on) {
      if (runStart === null) runStart = y;
    } else if (runStart !== null) {
      if (y - runStart >= 3) gutters.push({ start: runStart, end: y - 1 });
      runStart = null;
    }
  }
  if (runStart !== null && height - runStart >= 3) {
    gutters.push({ start: runStart, end: height - 1 });
  }

  const splits: number[] = [];
  for (const g of gutters) {
    const mid = Math.floor((g.start + g.end) / 2);
    if (mid <= 40) continue;
    const above = meanInk(data, width, height, mid - 90, mid - 8);
    const below = meanInk(data, width, height, mid + 8, mid + 90);
    if (above < 0.25 || below < 0.25) continue;
    // 课头深蓝横幅 → 第一行词卡之间的白缝：并进第一节，不切开
    const darkAbove = darkFrac(data, width, height, mid - 120, mid - 8);
    if (mid < height * 0.28 && darkAbove > 0.25) continue;
    if (splits.length && mid - splits[splits.length - 1] < 80) continue;
    splits.push(mid);
  }

  // 至少两行词卡（≥1 个切点）才算网格；否则回退旧逻辑
  if (splits.length < 1) return null;

  // 行高应大致接近（排除偶然通栏白线）；允许末行略短/略长
  if (splits.length >= 2) {
    const edges = [0, ...splits, height];
    const heights: number[] = [];
    for (let i = 1; i < edges.length; i++) {
      // 跳过含课头的第一节高度比
      if (i === 1) continue;
      heights.push(edges[i] - edges[i - 1]);
    }
    if (heights.length >= 2) {
      const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
      const weird = heights.filter((hh) => hh < avg * 0.45 || hh > avg * 1.85);
      if (weird.length > heights.length / 2) return null;
    }
  }

  return splits;
}

export function cardGridSplitsToSectionBounds(
  splits: number[],
  height: number
): { y0: number; y1: number }[] {
  if (!splits.length) return [{ y0: 0, y1: height }];
  const bounds: { y0: number; y1: number }[] = [];
  let y0 = 0;
  for (const y of splits) {
    const y1 = Math.max(y0 + 1, Math.min(height, y));
    bounds.push({ y0, y1 });
    y0 = y1;
  }
  if (y0 < height) bounds.push({ y0, y1: height });
  return bounds;
}
