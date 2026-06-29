/** 教案长图按「第 N 部分」标题栏切分，并导出带页码的分页 PDF（留白供老师备注） */

export type LessonSectionBounds = { y0: number; y1: number };

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
    let drawW = maxImgW;
    let drawH = (imgH / imgW) * drawW;
    if (drawH > maxImgH) {
      drawH = maxImgH;
      drawW = (imgW / imgH) * drawH;
    }
    const x = (pageW - drawW) / 2;
    pdf.addImage(dataUrl, "PNG", x, margin, drawW, drawH);

    pdf.setFontSize(10);
    pdf.setTextColor(130, 130, 130);
    pdf.text(`${i + 1} / ${sections.length}`, pageW / 2, pageH - 8, {
      align: "center",
    });
  }

  const safeName = filenameBase.replace(/\.(png|pdf|jpe?g)$/i, "");
  pdf.save(`${safeName}-分页.pdf`);
  return sections.length;
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
