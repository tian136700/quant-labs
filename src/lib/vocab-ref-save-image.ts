/**
 * 教案原图：iPhone 长按常被缩放层拦住；用系统分享进「存储图像」，否则下载。
 */

export type SaveVocabRefImageResult = "shared" | "downloaded" | "aborted";

function ensureImageFilename(filename: string, mime: string): string {
  const trimmed = filename.trim() || "lesson.png";
  if (/\.(png|jpe?g|webp|gif)$/i.test(trimmed)) return trimmed;
  if (mime.includes("jpeg") || mime.includes("jpg")) return `${trimmed}.jpg`;
  if (mime.includes("webp")) return `${trimmed}.webp`;
  if (mime.includes("gif")) return `${trimmed}.gif`;
  return `${trimmed}.png`;
}

async function downloadBlobAsFile(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * 拉取已登录可见的教案图 → 优先 Web Share（iOS 可选「存储图像」）→ 否则触发下载。
 */
export async function saveVocabRefImageToDevice(opts: {
  imageUrl: string;
  filename: string;
}): Promise<SaveVocabRefImageResult> {
  const res = await fetch(opts.imageUrl, { credentials: "include" });
  if (!res.ok) throw new Error("fetch_failed");
  const blob = await res.blob();
  const mime = blob.type || "image/png";
  const filename = ensureImageFilename(opts.filename, mime);
  const file = new File([blob], filename, { type: mime });

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

  await downloadBlobAsFile(blob, filename);
  return "downloaded";
}
