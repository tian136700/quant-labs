import type { CloudflareEnv } from "@/lib/types";

export const JP_REVIEW_LATEST_KEY = "latest.pdf";
export const JP_REVIEW_META_KEY = "meta.json";

export interface JpReviewMeta {
  updated_at: string;
  page_count: number;
  source_files: string[];
  pdf_bytes: number;
}

function uploadToken(env: CloudflareEnv): string {
  return (env.JP_REVIEW_UPLOAD_TOKEN || "").trim();
}

function downloadKey(env: CloudflareEnv): string {
  return (env.JP_REVIEW_DOWNLOAD_KEY || "").trim();
}

export function hasJpReviewBucket(
  env: CloudflareEnv
): env is CloudflareEnv & { JP_REVIEW: R2Bucket } {
  return Boolean(env.JP_REVIEW);
}

export function verifyUploadAuth(request: Request, env: CloudflareEnv): boolean {
  const expected = uploadToken(env);
  if (!expected) {
    const host = new URL(request.url).hostname;
    return host === "127.0.0.1" || host === "localhost";
  }

  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return match[1].trim() === expected;
}

export function verifyDownloadAccess(
  request: Request,
  env: CloudflareEnv
): boolean {
  const required = downloadKey(env);
  if (!required) return true;

  const url = new URL(request.url);
  const key = (url.searchParams.get("key") || "").trim();
  return key === required;
}

export async function readJpReviewMeta(
  bucket: R2Bucket
): Promise<JpReviewMeta | null> {
  const obj = await bucket.get(JP_REVIEW_META_KEY);
  if (!obj) return null;
  try {
    return (await obj.json()) as JpReviewMeta;
  } catch {
    return null;
  }
}

/** 只删除 review 自身的 PDF / meta；教案文件在 vocab-ref/ 下，必须保留 */
export async function clearPreviousJpReview(bucket: R2Bucket): Promise<number> {
  const keysToDelete = [JP_REVIEW_LATEST_KEY, JP_REVIEW_META_KEY];
  await bucket.delete(keysToDelete);
  return keysToDelete.length;
}

export async function putJpReviewPdf(
  bucket: R2Bucket,
  pdfBytes: ArrayBuffer,
  meta: Omit<JpReviewMeta, "pdf_bytes"> & { pdf_bytes?: number }
): Promise<{ removed_objects: number }> {
  const removed_objects = await clearPreviousJpReview(bucket);

  const fullMeta: JpReviewMeta = {
    ...meta,
    pdf_bytes: meta.pdf_bytes ?? pdfBytes.byteLength,
  };

  await bucket.put(JP_REVIEW_LATEST_KEY, pdfBytes, {
    httpMetadata: {
      contentType: "application/pdf",
      contentDisposition: 'attachment; filename="jp-review-latest.pdf"',
    },
  });

  await bucket.put(JP_REVIEW_META_KEY, JSON.stringify(fullMeta), {
    httpMetadata: { contentType: "application/json" },
  });

  return { removed_objects };
}
