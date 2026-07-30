/** PDF 教案随手画：按页渲染成图 / 批注后拼回 PDF（pdfjs + jspdf 均懒加载）。 */

import type { Stroke } from "@/components/lesson-annotate/lesson-annotate-draw";
import { renderAnnotatedBlob } from "@/components/lesson-annotate/lesson-annotate-draw";

export type AnnotatePdfDoc = {
  numPages: number;
  /** 1-based page → data URL（原页，未批注） */
  getPageDataUrl: (pageNumber: number) => Promise<string>;
  destroy: () => void;
};

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  }
  return pdfjs;
}

const PAGE_RENDER_SCALE = 2;

export async function openAnnotatePdfFromUrl(
  url: string
): Promise<AnnotatePdfDoc> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`教案 PDF 加载失败（HTTP ${res.status}）`);
  }
  const data = await res.arrayBuffer();
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const cache = new Map<number, string>();

  return {
    numPages: pdf.numPages,
    async getPageDataUrl(pageNumber: number) {
      const cached = cache.get(pageNumber);
      if (cached) return cached;
      if (pageNumber < 1 || pageNumber > pdf.numPages) {
        throw new Error("页码无效");
      }
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PAGE_RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法渲染 PDF 页");
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const dataUrl = canvas.toDataURL("image/png");
      cache.set(pageNumber, dataUrl);
      return dataUrl;
    },
    destroy() {
      cache.clear();
      void pdf.cleanup();
    },
  };
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("PDF 页图片加载失败"));
    img.src = dataUrl;
  });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}

/** 各页 data URL（已含批注）→ 多页 PDF Blob；页尺寸跟原图像素走。 */
export async function buildPdfBlobFromPageDataUrls(
  pages: Array<{ dataUrl: string; width: number; height: number }>
): Promise<Blob> {
  if (!pages.length) throw new Error("没有可保存的页");
  const { jsPDF } = await import("jspdf");

  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (let i = 0; i < pages.length; i++) {
    const { dataUrl, width, height } = pages[i];
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const orientation = w >= h ? "landscape" : "portrait";
    if (!pdf) {
      pdf = new jsPDF({
        orientation,
        unit: "pt",
        format: [w, h],
        compress: true,
      });
    } else {
      pdf.addPage([w, h], orientation);
    }
    const format = dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    pdf.addImage(dataUrl, format, 0, 0, w, h);
  }

  return pdf!.output("blob");
}

export async function measureDataUrlSize(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  const img = await loadImageFromDataUrl(dataUrl);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

export async function composeAnnotatedPdfBlob(opts: {
  getPageDataUrl: (pageNumber1Based: number) => Promise<string>;
  pageCount: number;
  /** 0-based page index → strokes */
  strokesByPage: Map<number, Stroke[]>;
}): Promise<Blob> {
  const { getPageDataUrl, pageCount, strokesByPage } = opts;
  const pages: Array<{ dataUrl: string; width: number; height: number }> = [];

  for (let i = 0; i < pageCount; i++) {
    const baseUrl = await getPageDataUrl(i + 1);
    const strokes = strokesByPage.get(i) ?? [];
    if (!strokes.length) {
      const size = await measureDataUrlSize(baseUrl);
      pages.push({ dataUrl: baseUrl, ...size });
      continue;
    }
    const img = await loadImageFromDataUrl(baseUrl);
    const blob = await renderAnnotatedBlob(img, strokes);
    const dataUrl = await blobToDataUrl(blob);
    pages.push({
      dataUrl,
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
  }

  return buildPdfBlobFromPageDataUrls(pages);
}
