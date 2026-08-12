/**
 * 教案 PDF 保存：
 * - iPhone：`<a download>` / jsPDF.save() 常被 Google Drive 等 PDF App 抢走；优先 Web Share →「存储到文件」
 * - 电脑 / 不支持分享：直接下载 PDF（禁止再弹「保存到手机」）
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

/**
 * 仅手机（尤其 iPhone）才走系统分享；电脑端即使 canShare 也要直接下载。
 * Mac Chrome 等桌面浏览器 canShare(files) 常为 true，若优先 share 会误成「像手机一样分享」。
 */
export function prefersVocabRefPdfShare(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  // iPadOS 13+ 桌面 UA：Macintosh + 多点触控
  if (
    /Macintosh/i.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
  return false;
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
 * 已有 PDF Blob → 手机优先系统分享 → 电脑直接下载。
 * 手机分享须在用户手势内调用（如确认框点「确定」之后）。
 */
export async function saveVocabRefPdfToDevice(opts: {
  blob: Blob;
  filename: string;
}): Promise<SaveVocabRefPdfResult> {
  const filename = ensurePdfFilename(opts.filename);
  const mime = "application/pdf";
  const file = new File([opts.blob], filename, { type: mime });

  if (prefersVocabRefPdfShare()) {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: filename });
        return "shared";
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return "aborted";
      }
    }
  }

  await downloadBlobAsFile(opts.blob, filename);
  return "downloaded";
}
