/**
 * 教案原图保存：
 * - Web 无法静默写入系统相册（无 Photos API）
 * - iPhone：用户确认后走 share，在面板点「存储图像」；share 成功后只提示「已保存到相册」
 * - 禁止再提示用户「还要去分享面板再选一次」（像要保存两次）
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

/** share/download 完成后的短提示；取消分享不提示 */
export function vocabRefSaveResultToast(
  result: SaveVocabRefImageResult
): string | null {
  if (result === "aborted") return null;
  if (result === "shared") return "已保存到相册";
  return "图片已保存";
}

/**
 * 拉取已登录可见的教案图 → 优先 Web Share（进相册）→ 否则下载。
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
