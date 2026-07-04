/** 教案长图按「第 N 部分」标题栏切分，并导出带页码的分页 PDF / Word（留白供老师备注） */

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

function sectionHeaderScore(
  data: Uint8ClampedArray,
  width: number,
  y: number
): number {
  const bandH = 35;
  const bandW = Math.min(400, width);
  let badgeBlue = 0;
  let badgeTotal = 0;
  let titleBlue = 0;
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
        if (b > 100 && r < 85 && g < 105 && b > r + 50) badgeBlue++;
      } else if (x < 350) {
        titleTotal++;
        if (b > 80 && r < 100 && g < 130 && b > r + 20) titleBlue++;
      }
    }
  }

  const badgeScore = badgeTotal ? badgeBlue / badgeTotal : 0;
  const titleScore = titleTotal ? titleBlue / titleTotal : 0;
  if (badgeScore < 0.1 || titleScore < 0.02) return 0;
  return badgeScore + titleScore * 2;
}

/** 检测教案各「部分」的纵向边界（基于左侧蓝色序号标题栏） */
export function detectLessonSectionBounds(
  img: HTMLImageElement
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

  const scores: { y: number; score: number }[] = [];
  for (let y = 0; y < h - 35; y++) {
    scores.push({ y, score: sectionHeaderScore(data, w, y) });
  }

  const peaks: number[] = [];
  for (let i = 1; i < scores.length - 1; i++) {
    const { y, score } = scores[i];
    if (score <= 0.15) continue;
    if (score < scores[i - 1].score || score < scores[i + 1].score) continue;
    if (peaks.length && y - peaks[peaks.length - 1] <= 150) continue;
    peaks.push(y);
  }

  if (peaks.length < 2) {
    return [{ y0: 0, y1: h }];
  }

  return peaks.map((y0, i) => ({
    y0,
    y1: i + 1 < peaks.length ? peaks[i + 1] : h,
  }));
}

/** 每页 Word 合并相邻两个「部分」（第一+第二部分同页）；奇数时最后一页仅一节 */
function groupLessonSectionsIntoWordPages(
  sections: LessonSectionBounds[]
): LessonSectionBounds[][] {
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

/** 导出分页 PDF；返回页数 */
export async function exportJpVocabRefPaginatedPdf(
  imageUrl: string,
  filenameBase: string
): Promise<number> {
  const [{ jsPDF }, img] = await Promise.all([
    import("jspdf"),
    loadImage(imageUrl),
  ]);

  const sections = detectLessonSectionBounds(img);
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

  pdf.save(`${paginatedExportBasename(filenameBase)}-分页.pdf`);
  return sections.length;
}

/** 导出分页 Word；相邻两部分同页，中间留白供板书；页脚仍带页码 */
export async function exportJpVocabRefPaginatedDocx(
  imageUrl: string,
  filenameBase: string
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

  const sections = detectLessonSectionBounds(img);
  const sectionPages = groupLessonSectionsIntoWordPages(sections);
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
    `${paginatedExportBasename(filenameBase)}-分页.docx`
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
