/** 教案长图按「第 N 部分」标题栏切分，并导出带页码的分页 PDF / Word（留白供老师备注） */

import type { SaveVocabRefPdfResult } from "@/lib/vocab-ref-save-pdf";

export type LessonSectionBounds = { y0: number; y1: number };

function calcSectionDrawSize(
  imgW: number,
  imgH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  let drawW = maxW;
  let drawH = (imgH / imgW) * drawW;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = (imgW / imgH) * drawH;
  }
  return { width: drawW, height: drawH };
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("无效图片数据");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function paginatedExportBasename(filenameBase: string): string {
  return filenameBase.replace(/\.(png|pdf|jpe?g|docx)$/i, "");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("教案图片加载失败"));
    img.src = url;
  });
}

function isSectionBadgeColor(r: number, g: number, b: number): boolean {
  if (b > 100 && r < 85 && g < 105 && b > r + 50) return true;
  if (r > 90 && b > 130 && g < 100 && b > r) return true;
  return false;
}

function isSectionTitleColor(r: number, g: number, b: number): boolean {
  if (b > 80 && r < 100 && g < 130 && b > r + 20) return true;
  if (r > 80 && b > 80 && g < 130 && (r > g + 15 || b > g + 15)) return true;
  return false;
}

function sectionHeaderScore(
  data: Uint8ClampedArray,
  width: number,
  y: number
): number {
  const bandH = 35;
  const bandW = Math.min(400, width);
  let badgeMatch = 0;
  let badgeTotal = 0;
  let titleMatch = 0;
  let titleTotal = 0;

  for (let dy = 0; dy < bandH; dy++) {
    const row = y + dy;
    for (let x = 0; x < bandW; x++) {
      const i = (row * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (x < 40) {
        badgeTotal++;
        if (isSectionBadgeColor(r, g, b)) badgeMatch++;
      } else if (x < 350) {
        titleTotal++;
        if (isSectionTitleColor(r, g, b)) titleMatch++;
      }
    }
  }

  const badgeScore = badgeTotal ? badgeMatch / badgeTotal : 0;
  const titleScore = titleTotal ? titleMatch / titleTotal : 0;
  if (badgeScore < 0.1 || titleScore < 0.02) return 0;
  return badgeScore + titleScore * 2;
}

function rowWhiteFraction(
  data: Uint8ClampedArray,
  width: number,
  y: number,
  x0: number,
  x1: number
): number {
  let white = 0;
  let total = 0;
  for (let x = x0; x < x1; x++) {
    const i = (y * width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    total++;
    if (r > 240 && g > 240 && b > 240) white++;
  }
  return total ? white / total : 0;
}

export type EnVocabRefCropKind = "word" | "grammar";

/** 从下载名推断：`12. Grammar Learn (…)` / `3. Word Learn (…)` */
export function inferEnVocabRefCropKind(
  filenameBase: string
): EnVocabRefCropKind | null {
  const name = filenameBase || "";
  if (/Grammar\s+Learn/i.test(name) || name.includes("语法学习")) return "grammar";
  if (/Word\s+Learn/i.test(name) || name.includes("单词学习")) return "word";
  return null;
}

/**
 * 语法教案：按左侧蓝色/紫色序号方块竖条定位「部分」起点。
 * 比颜色分数峰更稳——漫画衣服/气泡不会被当成下一节标题。
 *
 * 真·部分序号方块在左侧 40px 内色条平均占比通常 ≥0.34；
 * 例文漫画蓝衣服/气泡只有约 0.15–0.20，会误当下一节起点（见 lesson-68）。
 * 因此对整段 run 要求平均占比达标，同间隙内取更密者。
 */
function detectGrammarSectionPeaks(
  data: Uint8ClampedArray,
  width: number,
  height: number
): number[] {
  const bandW = Math.min(40, width);
  const minRun = 20;
  const minGap = 150;
  /** 过滤漫画误触发；真方块约 0.34+，lesson-68 假峰约 0.19 */
  const minAvgBadgeFrac = 0.25;
  const minY = Math.min(80, Math.floor(height * 0.07));

  const rowBadgeFrac = (y: number): number => {
    let match = 0;
    let total = 0;
    for (let x = 0; x < bandW; x++) {
      const i = (y * width + x) * 4;
      total++;
      if (isSectionBadgeColor(data[i], data[i + 1], data[i + 2])) match++;
    }
    return total ? match / total : 0;
  };

  const peaks: number[] = [];
  const peakAvgs: number[] = [];
  let runStart: number | null = null;

  const considerRun = (start: number, end: number) => {
    const len = end - start;
    if (len < minRun || start < minY) return;
    let sum = 0;
    for (let y = start; y < end; y++) sum += rowBadgeFrac(y);
    const avg = sum / len;
    if (avg < minAvgBadgeFrac) return;
    if (!peaks.length || start - peaks[peaks.length - 1] >= minGap) {
      peaks.push(start);
      peakAvgs.push(avg);
    } else if (avg > peakAvgs[peakAvgs.length - 1]) {
      peaks[peaks.length - 1] = start;
      peakAvgs[peakAvgs.length - 1] = avg;
    }
  };

  for (let y = 0; y < height; y++) {
    const on = rowBadgeFrac(y) > 0.15;
    if (on) {
      if (runStart === null) runStart = y;
    } else if (runStart !== null) {
      considerRun(runStart, y);
      runStart = null;
    }
  }
  if (runStart !== null) {
    considerRun(runStart, height);
  }
  return peaks;
}

/**
 * 单词教案：按「1 / 2 / 3…」标题栏颜色分数找峰。
 * 单词图无大面积漫画，色分峰足够稳；勿套用语法的切段逻辑。
 */
function detectWordSectionPeaks(
  data: Uint8ClampedArray,
  width: number,
  height: number
): number[] {
  const minSectionY = Math.min(80, Math.floor(height * 0.07));
  const scores: { y: number; score: number }[] = [];
  for (let y = minSectionY; y < height - 35; y++) {
    scores.push({ y, score: sectionHeaderScore(data, width, y) });
  }

  const peaks: number[] = [];
  for (let i = 1; i < scores.length - 1; i++) {
    const { y, score } = scores[i];
    if (score <= 0.15) continue;
    if (score < scores[i - 1].score || score < scores[i + 1].score) continue;
    if (peaks.length && y - peaks[peaks.length - 1] <= 150) continue;
    peaks.push(y);
  }
  return peaks;
}

function peaksToSectionBounds(
  peaks: number[],
  height: number
): LessonSectionBounds[] {
  if (peaks.length < 2) {
    return [{ y0: 0, y1: height }];
  }
  return peaks.map((peakY, i) => ({
    y0: i === 0 ? 0 : peakY,
    y1: i + 1 < peaks.length ? peaks[i + 1] : height,
  }));
}

/** 检测教案各「部分」的纵向边界；语法 / 单词分路径，互不干扰 */
export function detectLessonSectionBounds(
  img: HTMLImageElement,
  cropKind: EnVocabRefCropKind = "word"
): LessonSectionBounds[] {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return [{ y0: 0, y1: h }];

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [{ y0: 0, y1: h }];
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  const peaks =
    cropKind === "grammar"
      ? detectGrammarSectionPeaks(data, w, h)
      : detectWordSectionPeaks(data, w, h);

  return peaksToSectionBounds(peaks, h);
}

/** 第一部分单词区若有两行卡片，按行间空白切成上下两块（5+5） */
function detectVocabRowSplitY(
  data: Uint8ClampedArray,
  width: number,
  section: LessonSectionBounds,
  sectionCount: number
): number | null {
  const { y0, y1 } = section;
  const sectionH = y1 - y0;
  // 仅「3 段式单词教案」且第一节足够高（10 词两行）时才拆分；旧版 5 词单行不拆
  if (sectionCount !== 3 || sectionH < 400) return null;

  const scanStart = y0 + Math.floor(sectionH * 0.25);
  const scanEnd = y0 + Math.floor(sectionH * 0.85);
  const x0 = Math.min(50, Math.floor(width * 0.05));
  const x1 = width - x0;

  let bestRun: { start: number; end: number; len: number } | null = null;
  let runStart: number | null = null;

  for (let y = scanStart; y < scanEnd; y++) {
    const whiteFrac = rowWhiteFraction(data, width, y, x0, x1);
    if (whiteFrac > 0.9) {
      if (runStart === null) runStart = y;
    } else if (runStart !== null) {
      const len = y - runStart;
      if (!bestRun || len > bestRun.len) {
        bestRun = { start: runStart, end: y, len };
      }
      runStart = null;
    }
  }
  if (runStart !== null) {
    const len = scanEnd - runStart;
    if (!bestRun || len > bestRun.len) {
      bestRun = { start: runStart, end: scanEnd, len };
    }
  }

  // 两行卡片之间的空白带比标题下方空白更宽
  if (!bestRun || bestRun.len < 14) return null;

  const splitY = Math.floor((bestRun.start + bestRun.end) / 2);
  const topH = splitY - y0;
  const bottomH = y1 - splitY;
  if (topH < sectionH * 0.35 || bottomH < sectionH * 0.35) return null;

  return splitY;
}

function splitFirstSectionIfTwoRows(
  data: Uint8ClampedArray,
  width: number,
  sections: LessonSectionBounds[]
): { sections: LessonSectionBounds[]; firstSectionSplit: boolean } {
  if (sections.length === 0) {
    return { sections, firstSectionSplit: false };
  }

  const splitY = detectVocabRowSplitY(data, width, sections[0], sections.length);
  if (splitY === null) {
    return { sections, firstSectionSplit: false };
  }

  const first = sections[0];
  return {
    sections: [
      { y0: first.y0, y1: splitY },
      { y0: splitY, y1: first.y1 },
      ...sections.slice(1),
    ],
    firstSectionSplit: true,
  };
}

function readImagePixelData(
  img: HTMLImageElement
): { data: Uint8ClampedArray; width: number; height: number } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  return { data, width: w, height: h };
}

/**
 * Word 分页：
 * - 10 词两行时：第一块 5 词 + 第二块 5 词同页，其余部分各一页
 * - 旧版 5 词单行时：仍合并相邻两节同页
 */
function groupLessonSectionsIntoWordPages(
  sections: LessonSectionBounds[],
  firstSectionSplit: boolean
): LessonSectionBounds[][] {
  if (firstSectionSplit) {
    const pages: LessonSectionBounds[][] = [];
    if (sections.length >= 2) {
      pages.push([sections[0], sections[1]]);
      for (let i = 2; i < sections.length; i++) {
        pages.push([sections[i]]);
      }
    } else if (sections.length === 1) {
      pages.push([sections[0]]);
    }
    return pages;
  }

  const pages: LessonSectionBounds[][] = [];
  for (let i = 0; i < sections.length; i += 2) {
    pages.push(sections.slice(i, i + 2));
  }
  return pages;
}

function cropSectionToDataUrl(
  img: HTMLImageElement,
  bounds: LessonSectionBounds
): string {
  const w = img.naturalWidth;
  const h = bounds.y1 - bounds.y0;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, bounds.y0, w, h, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

function imageToPngDataUrl(img: HTMLImageElement): string {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export type EnVocabRefFullImagePdfBuild = {
  blob: Blob;
  filename: string;
};

/**
 * 整图 PDF：不拆分，按图片像素尺寸建一页（不触发下载）。
 * iPhone 须再走 saveVocabRefPdfToDevice（系统分享 →「存储到文件」），勿直接 pdf.save()。
 */
export async function buildEnVocabRefFullImagePdf(
  imageUrl: string,
  filenameBase: string
): Promise<EnVocabRefFullImagePdfBuild> {
  const [{ jsPDF }, img] = await Promise.all([
    import("jspdf"),
    loadImage(imageUrl),
  ]);

  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  if (!imgW || !imgH) throw new Error("教案图片无效");

  // 96dpi px → mm，页尺寸与整张图一致
  const pxToMm = (px: number) => (px * 25.4) / 96;
  const pageW = pxToMm(imgW);
  const pageH = pxToMm(imgH);
  const orientation = pageW >= pageH ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: [pageW, pageH],
  });
  pdf.addImage(imageToPngDataUrl(img), "PNG", 0, 0, pageW, pageH);
  const filename = `${paginatedExportBasename(filenameBase)}.pdf`;
  const arrayBuffer = pdf.output("arraybuffer");
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  return { blob, filename };
}

/**
 * 整图 PDF 导出：生成后优先系统分享（iPhone「存储到文件」），否则下载。
 * 桌面可直接调；iPhone 菜单路径会在确认手势后再 share，见 EnVocabRefDownloadMenu。
 */
export async function exportEnVocabRefFullImagePdf(
  imageUrl: string,
  filenameBase: string
): Promise<SaveVocabRefPdfResult> {
  const { saveVocabRefPdfToDevice } = await import("@/lib/vocab-ref-save-pdf");
  const { blob, filename } = await buildEnVocabRefFullImagePdf(
    imageUrl,
    filenameBase
  );
  return saveVocabRefPdfToDevice({ blob, filename });
}

function resolveEnVocabRefCropKind(
  filenameBase: string,
  cropKind?: EnVocabRefCropKind | null
): EnVocabRefCropKind {
  return cropKind ?? inferEnVocabRefCropKind(filenameBase) ?? "word";
}

/** 导出分页 PDF；返回页数 */
export async function exportEnVocabRefPaginatedPdf(
  imageUrl: string,
  filenameBase: string,
  cropKind?: EnVocabRefCropKind | null
): Promise<number> {
  const [{ jsPDF }, img] = await Promise.all([
    import("jspdf"),
    loadImage(imageUrl),
  ]);

  const sections = detectLessonSectionBounds(
    img,
    resolveEnVocabRefCropKind(filenameBase, cropKind)
  );
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const maxImgH = pageH * 0.52;
  const maxImgW = pageW - margin * 2;

  for (let i = 0; i < sections.length; i++) {
    if (i > 0) pdf.addPage();

    const dataUrl = cropSectionToDataUrl(img, sections[i]);
    const imgW = img.naturalWidth;
    const imgH = sections[i].y1 - sections[i].y0;
    const { width: drawW, height: drawH } = calcSectionDrawSize(
      imgW,
      imgH,
      maxImgW,
      maxImgH
    );
    const x = (pageW - drawW) / 2;
    pdf.addImage(dataUrl, "PNG", x, margin, drawW, drawH);

    pdf.setFontSize(10);
    pdf.setTextColor(130, 130, 130);
    pdf.text(`${i + 1} / ${sections.length}`, pageW / 2, pageH - 8, {
      align: "center",
    });
  }

  pdf.save(`${paginatedExportBasename(filenameBase)}-paginated.pdf`);
  return sections.length;
}

/** 导出分页 Word；10 词时第一页上下两块，其余各一页；中间留白供板书 */
export async function exportEnVocabRefPaginatedDocx(
  imageUrl: string,
  filenameBase: string,
  cropKind?: EnVocabRefCropKind | null
): Promise<number> {
  const [
    {
      AlignmentType,
      convertMillimetersToTwip,
      Document,
      Footer,
      ImageRun,
      Packer,
      PageBreak,
      PageNumber,
      Paragraph,
      TextRun,
    },
    img,
  ] = await Promise.all([import("docx"), loadImage(imageUrl)]);

  const kind = resolveEnVocabRefCropKind(filenameBase, cropKind);
  const sections = detectLessonSectionBounds(img, kind);
  const { data, width } = readImagePixelData(img);
  const { sections: wordSections, firstSectionSplit } =
    kind === "word"
      ? splitFirstSectionIfTwoRows(data, width, sections)
      : { sections, firstSectionSplit: false };
  const sectionPages = groupLessonSectionsIntoWordPages(
    wordSections,
    firstSectionSplit
  );
  const pageWpx = 794;
  const pageHpx = 1123;
  const marginPx = 45;
  const partGapMm = 25;
  const partGapPx = (partGapMm / 25.4) * 96;
  const maxImgH =
    (pageHpx - marginPx * 2 - partGapPx) /
    Math.max(...sectionPages.map((p) => p.length));
  const maxImgW = pageWpx - marginPx * 2;
  const children: Array<InstanceType<typeof Paragraph>> = [];

  for (let pageIdx = 0; pageIdx < sectionPages.length; pageIdx++) {
    if (pageIdx > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    const pageSections = sectionPages[pageIdx];
    for (let partIdx = 0; partIdx < pageSections.length; partIdx++) {
      if (partIdx > 0) {
        children.push(
          new Paragraph({
            spacing: {
              before: convertMillimetersToTwip(partGapMm),
              after: convertMillimetersToTwip(4),
            },
            children: [],
          })
        );
      }

      const bounds = pageSections[partIdx];
      const dataUrl = cropSectionToDataUrl(img, bounds);
      const imgW = img.naturalWidth;
      const imgH = bounds.y1 - bounds.y0;
      const { width: drawW, height: drawH } = calcSectionDrawSize(
        imgW,
        imgH,
        maxImgW,
        maxImgH
      );

      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: "png",
              data: dataUrlToUint8Array(dataUrl),
              transformation: {
                width: Math.round(drawW),
                height: Math.round(drawH),
              },
            }),
          ],
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(12),
              bottom: convertMillimetersToTwip(12),
              left: convertMillimetersToTwip(12),
              right: convertMillimetersToTwip(12),
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES],
                    size: 20,
                    color: "828282",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  await downloadBlobAsFile(
    blob,
    `${paginatedExportBasename(filenameBase)}-paginated.docx`
  );
  return sectionPages.length;
}

export async function downloadBlobAsFile(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
