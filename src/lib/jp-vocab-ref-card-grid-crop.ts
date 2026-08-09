/**
 * 标日「图片版单词教案」词卡网格：按行间通栏白缝横切。
 * 支持三卡一行（lesson-148）与双列左右对照（lesson-149 / 第26课）。
 * 旧版「第 N 部分」标题栏切段见 jp-vocab-ref-pdf-export.ts。
 */

export type CardGridRowSplit = number;

function bandInkFraction(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  x0: number,
  x1: number
): number {
  const a = Math.max(0, Math.floor(x0));
  const b = Math.min(width, Math.ceil(x1));
  let ink = 0;
  let total = 0;
  for (let x = a; x < b; x += 2) {
    const i = (y * width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const bch = data[i + 2];
    total++;
    if (!(r > 245 && g > 245 && bch > 245)) ink++;
  }
  return total ? ink / total : 0;
}

function meanBandInk(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  y0: number,
  y1: number,
  x0: number,
  x1: number
): number {
  const a = Math.max(0, y0);
  const b = Math.min(height, y1);
  if (b <= a) return 0;
  let sum = 0;
  for (let y = a; y < b; y++) sum += bandInkFraction(data, width, y, x0, x1);
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
 * 估计每行词卡列数：2 = 左右对照；3 = 标日三卡一行。
 * 取画面中部最长竖向白缝：靠近中线 → 2，靠近 1/3·2/3 → 3。
 */
export function estimateWordCardColumns(
  data: Uint8ClampedArray,
  width: number,
  height: number
): 2 | 3 {
  const y0 = Math.floor(height * 0.22);
  const y1 = Math.floor(height * 0.45);
  const prof = new Array<number>(width);
  for (let x = 0; x < width; x++) {
    let ink = 0;
    let total = 0;
    for (let y = y0; y < y1; y += 2) {
      const i = (y * width + x) * 4;
      total++;
      if (!(data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245)) ink++;
    }
    prof[x] = total ? ink / total : 0;
  }
  const sm = new Array<number>(width);
  for (let x = 0; x < width; x++) {
    const a = Math.max(0, x - 1);
    const b = Math.min(width, x + 2);
    let sum = 0;
    for (let i = a; i < b; i++) sum += prof[i];
    sm[x] = sum / (b - a);
  }
  const runs: { start: number; end: number; len: number }[] = [];
  let runStart: number | null = null;
  const xLo = Math.floor(width * 0.2);
  const xHi = Math.floor(width * 0.8);
  for (let x = xLo; x < xHi; x++) {
    const on = sm[x] < 0.06;
    if (on) {
      if (runStart === null) runStart = x;
    } else if (runStart !== null) {
      runs.push({ start: runStart, end: x - 1, len: x - runStart });
      runStart = null;
    }
  }
  if (runStart !== null) {
    runs.push({ start: runStart, end: xHi - 1, len: xHi - runStart });
  }
  if (!runs.length) return 3;
  runs.sort((a, b) => b.len - a.len);
  const bestMid = (runs[0].start + runs[0].end) / 2 / width;
  if (Math.abs(bestMid - 0.5) < 0.08) return 2;
  const mids = runs
    .filter((r) => r.len >= 3)
    .slice(0, 4)
    .map((r) => (r.start + r.end) / 2 / width);
  const nearT1 = mids.some((m) => Math.abs(m - 1 / 3) < 0.08);
  const nearT2 = mids.some((m) => Math.abs(m - 2 / 3) < 0.08);
  if (nearT1 && nearT2) return 3;
  return 3;
}

/**
 * 找词卡网格的行间切点。
 * 左右两列插图区同时近白才算通栏行缝（避免「造个句子」线造成假缝）。
 * 返回 null = 不像词卡网格；[] = 只有一行；[y…] = 第 2 行起的起点（第一节含课头）。
 */
export function detectWordCardGridRowSplits(
  data: Uint8ClampedArray,
  width: number,
  height: number
): number[] | null {
  if (width < 200 || height < 280) return null;

  const L0 = width * 0.05;
  const L1 = width * 0.32;
  const R0 = width * 0.52;
  const R1 = width * 0.79;
  const gutterThr = 0.1;
  const inkFloor = 0.12;
  const minGap = Math.max(80, Math.floor(height * 0.065));
  const minFirst = Math.max(140, Math.floor(height * 0.12));
  const band = Math.max(24, Math.floor(height * 0.032));

  const inkL = new Array<number>(height);
  const inkR = new Array<number>(height);
  for (let y = 0; y < height; y++) {
    inkL[y] = bandInkFraction(data, width, y, L0, L1);
    inkR[y] = bandInkFraction(data, width, y, R0, R1);
  }
  const smoothL = new Array<number>(height);
  const smoothR = new Array<number>(height);
  for (let y = 0; y < height; y++) {
    const a = Math.max(0, y - 1);
    const b = Math.min(height, y + 2);
    let sumL = 0;
    let sumR = 0;
    for (let i = a; i < b; i++) {
      sumL += inkL[i];
      sumR += inkR[i];
    }
    const n = b - a;
    smoothL[y] = sumL / n;
    smoothR[y] = sumR / n;
  }

  const gutters: { start: number; end: number }[] = [];
  let runStart: number | null = null;
  for (let y = 0; y < height; y++) {
    const on = smoothL[y] < gutterThr && smoothR[y] < gutterThr;
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
  let skippedHeader = false;
  for (const g of gutters) {
    const mid = Math.floor((g.start + g.end) / 2);
    if (mid <= Math.max(40, Math.floor(height * 0.03))) continue;

    // 第一节须含课头+第一行：过早的缝（切到第一行腰）一律跳过
    if (!splits.length && mid < minFirst) {
      const darkAbove = darkFrac(data, width, height, mid - Math.floor(height * 0.065), mid - 8);
      if (!skippedHeader && darkAbove > 0.12 && mid < height * 0.22) {
        skippedHeader = true;
      }
      continue;
    }

    const aboveL = meanBandInk(data, width, height, mid - band, mid - 10, L0, L1);
    const belowL = meanBandInk(data, width, height, mid + 10, mid + band, L0, L1);
    const aboveR = meanBandInk(data, width, height, mid - band, mid - 10, R0, R1);
    const belowR = meanBandInk(data, width, height, mid + 10, mid + band, R0, R1);
    if (Math.min(aboveL, aboveR, belowL, belowR) < inkFloor) continue;

    const darkAbove = darkFrac(data, width, height, mid - Math.floor(height * 0.065), mid - 8);
    if (!skippedHeader && darkAbove > 0.12 && mid < height * 0.22) {
      skippedHeader = true;
      continue;
    }
    if (splits.length && mid - splits[splits.length - 1] < minGap) continue;
    splits.push(mid);
  }

  if (splits.length < 1) return null;

  if (splits.length >= 2) {
    const edges = [0, ...splits, height];
    const heights: number[] = [];
    for (let i = 1; i < edges.length; i++) {
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

/**
 * 已知词卡行数时，把候选缝吸附到均匀目标行（板书 Word 有 content 词表时用）。
 */
export function refineCardGridSplitsForRowCount(
  candidates: number[],
  height: number,
  nRows: number
): number[] | null {
  if (nRows < 2 || !candidates.length) return null;
  const nSplits = nRows - 1;
  const minFirst = Math.max(140, Math.floor(height * 0.12));
  const span = Math.max(1, height - minFirst);
  const targets: number[] = [];
  for (let i = 0; i < nSplits; i++) {
    targets.push(Math.floor(minFirst + (span * (i + 1)) / nRows));
  }
  const cand = [...candidates].sort((a, b) => a - b);
  const used: number[] = [];
  const maxSnap = span / nRows / 2;
  const minSep = Math.max(60, Math.floor(height * 0.045));
  for (const t of targets) {
    let best: number | null = null;
    let bestD = Infinity;
    for (const c of cand) {
      if (used.length && c <= used[used.length - 1] + minSep) continue;
      const d = Math.abs(c - t);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best != null && bestD <= maxSnap) used.push(best);
  }
  return used.length >= Math.max(1, nSplits - 1) ? used : null;
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
