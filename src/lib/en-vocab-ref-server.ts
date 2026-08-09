import "server-only";

import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import type { CloudflareEnv, EnVocabMediaType } from "@/lib/types";
import { hasJpReviewBucket } from "@/lib/jp-review";
import {
  isLocalEnVocabRefMarker,
  enVocabRefContentType,
  enVocabRefLocalMarker,
  enVocabRefR2Key,
} from "@/lib/en-vocab-ref-shared";

export function enVocabRefPublicPath(refKey: string, mediaType: EnVocabMediaType): string {
  const ext = mediaType === "pdf" ? ".pdf" : ".png";
  return path.join(process.cwd(), "public", "en-vocab-refs", `${refKey}${ext}`);
}

export async function readLocalEnVocabRefFile(
  refKey: string,
  mediaType: EnVocabMediaType
): Promise<ArrayBuffer | null> {
  try {
    const filePath = enVocabRefPublicPath(refKey, mediaType);
    const buf = await readFile(filePath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return null;
  }
}

export async function getEnVocabRefR2Object(
  env: CloudflareEnv,
  r2Key: string
): Promise<R2ObjectBody | null> {
  if (!hasJpReviewBucket(env)) return null;
  const obj = await env.JP_REVIEW.get(r2Key);
  return obj ?? null;
}

export async function enVocabRefFileExists(
  env: CloudflareEnv,
  refKey: string,
  mediaType: EnVocabMediaType,
  r2Key: string
): Promise<boolean> {
  if (isLocalEnVocabRefMarker(r2Key)) {
    const bytes = await readLocalEnVocabRefFile(refKey, mediaType);
    return Boolean(bytes?.byteLength);
  }
  const obj = await getEnVocabRefR2Object(env, r2Key);
  return Boolean(obj);
}

export async function putEnVocabRefFile(
  env: CloudflareEnv,
  refKey: string,
  mediaType: EnVocabMediaType,
  bytes: ArrayBuffer
): Promise<{ r2_key: string; storage: "r2" | "local" }> {
  const r2Key = enVocabRefR2Key(refKey, mediaType);

  // 与 jp-review PDF 共用 JP_REVIEW 桶，但 key 必须走 en-vocab-ref/（禁止与日语 vocab-ref/ 撞路径）
  // 桶内删除逻辑见 jp-review.ts，禁止整桶清理
  if (hasJpReviewBucket(env)) {
    await env.JP_REVIEW.put(r2Key, bytes, {
      httpMetadata: { contentType: enVocabRefContentType(mediaType) },
    });
    return { r2_key: r2Key, storage: "r2" };
  }

  const filePath = enVocabRefPublicPath(refKey, mediaType);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(bytes));
  return { r2_key: enVocabRefLocalMarker(refKey), storage: "local" };
}
