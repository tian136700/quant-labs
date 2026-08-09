import type { CloudflareEnv } from "@/lib/types";
import { EN_VOCAB_REF_R2_PREFIX } from "@/lib/en-vocab-ref-shared";
import { JP_VOCAB_REF_R2_PREFIX } from "@/lib/jp-vocab-ref-shared";

/** Review PDF 与教案共用 JP_REVIEW 桶；review 文件必须放在 review/ 前缀下，禁止整桶清理 */
export const JP_REVIEW_R2_PREFIX = "review/";
export const JP_REVIEW_LATEST_KEY = `${JP_REVIEW_R2_PREFIX}latest.pdf`;
export const JP_REVIEW_META_KEY = `${JP_REVIEW_R2_PREFIX}meta.json`;

/** 旧版 key（桶根目录）；仅用于读取/清理，新上传写入 review/ */
const JP_REVIEW_LATEST_KEY_LEGACY = "latest.pdf";
const JP_REVIEW_META_KEY_LEGACY = "meta.json";

const JP_REVIEW_OWNED_KEYS = new Set([
  JP_REVIEW_LATEST_KEY,
  JP_REVIEW_META_KEY,
  JP_REVIEW_LATEST_KEY_LEGACY,
  JP_REVIEW_META_KEY_LEGACY,
]);

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
  if (match && match[1].trim() === expected) return true;
  return false;
}

/** 日历订阅链接只能带 query，不能设 Bearer：`?token=` */
export function verifyUploadAuthOrQueryToken(
  request: Request,
  env: CloudflareEnv
): boolean {
  if (verifyUploadAuth(request, env)) return true;
  const expected = uploadToken(env);
  if (!expected) return false;
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  return token.length > 0 && token === expected;
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

/** 仅允许删除 review 自身对象；日/英教案前缀与其它 key 一律拒绝 */
function assertReviewOwnedKeys(keys: string[]): void {
  for (const key of keys) {
    if (
      key.startsWith(JP_VOCAB_REF_R2_PREFIX) ||
      key.startsWith(EN_VOCAB_REF_R2_PREFIX)
    ) {
      throw new Error(`Refusing to delete protected vocab ref object: ${key}`);
    }
    if (!JP_REVIEW_OWNED_KEYS.has(key)) {
      throw new Error(`Refusing to delete unknown R2 key in JP_REVIEW bucket: ${key}`);
    }
  }
}

async function getReviewObject(
  bucket: R2Bucket,
  primaryKey: string,
  legacyKey: string
): Promise<R2ObjectBody | null> {
  const primary = await bucket.get(primaryKey);
  if (primary) return primary;
  return bucket.get(legacyKey);
}

export async function readJpReviewMeta(
  bucket: R2Bucket
): Promise<JpReviewMeta | null> {
  const obj = await getReviewObject(
    bucket,
    JP_REVIEW_META_KEY,
    JP_REVIEW_META_KEY_LEGACY
  );
  if (!obj) return null;
  try {
    return (await obj.json()) as JpReviewMeta;
  } catch {
    return null;
  }
}

/** 上传新 review 前，只删 review 自己的 PDF / meta（含旧版根目录 key） */
export async function clearPreviousJpReview(bucket: R2Bucket): Promise<number> {
  const keysToDelete = [
    JP_REVIEW_LATEST_KEY,
    JP_REVIEW_META_KEY,
    JP_REVIEW_LATEST_KEY_LEGACY,
    JP_REVIEW_META_KEY_LEGACY,
  ];
  assertReviewOwnedKeys(keysToDelete);
  await bucket.delete(keysToDelete);
  return keysToDelete.length;
}

export async function getJpReviewLatestPdf(
  bucket: R2Bucket
): Promise<R2ObjectBody | null> {
  return getReviewObject(
    bucket,
    JP_REVIEW_LATEST_KEY,
    JP_REVIEW_LATEST_KEY_LEGACY
  );
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
