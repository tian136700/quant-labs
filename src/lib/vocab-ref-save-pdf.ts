/**
 * 教案 PDF 保存到手机：
 * - iPhone 上 `<a download>` / jsPDF.save() 常被 Google Drive 等 PDF App 抢走，进不了「文件」
 * - 优先 Web Share：用户在系统面板选「存储到文件」
 * - 桌面或不支持分享时再走下载
 */

export type SaveVocabRefPdfResult = "shared" | "downloaded" | "aborted";

function ensurePdfFilename(filename: string): string {
  const trimmed = filename.trim() || "lesson.pdf";
  if (/\.pdf$/i.test(trimmed)) return trimmed;
  return `${trimmed}.pdf`;
}

async function downloadBlobAsFile(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** share/download 完成后的短提示；取消分享不提示 */
export function vocabRefPdfSaveResultToast(
  result: SaveVocabRefPdfResult
): string | null {
  if (result === "aborted") return null;
  if (result === "shared") return "PDF 已保存";
  return "PDF 已下载";
}

/**
 * 已有 PDF Blob → 优先系统分享（iPhone「存储到文件」）→ 否则下载。
 * 须在用户手势内调用（如确认框点「确定」之后），否则 Safari 可能拒绝 share。
 */
export async function saveVocabRefPdfToDevice(opts: {
  blob: Blob;
  filename: string;
}): Promise<SaveVocabRefPdfResult> {
  const filename = ensurePdfFilename(opts.filename);
  const mime = "application/pdf";
  const file = new File([opts.blob], filename, { type: mime });

  try {
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return "aborted";
    }
  }

  await downloadBlobAsFile(opts.blob, filename);
  return "downloaded";
}
