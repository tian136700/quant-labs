import "server-only";

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CloudflareEnv, JpVocabMediaType } from "@/lib/types";
import { hasJpReviewBucket } from "@/lib/jp-review";
import {
  isLocalJpVocabRefMarker,
  jpVocabRefContentType,
  jpVocabRefLocalMarker,
  jpVocabRefR2Key,
} from "@/lib/jp-vocab-ref-shared";

export function jpVocabRefPublicPath(refKey: string, mediaType: JpVocabMediaType): string {
  const ext = mediaType === "pdf" ? ".pdf" : ".png";
  return path.join(process.cwd(), "public", "jp-vocab-refs", `${refKey}${ext}`);
}

export async function readLocalJpVocabRefFile(
  refKey: string,
  mediaType: JpVocabMediaType
): Promise<ArrayBuffer | null> {
  try {
    const filePath = jpVocabRefPublicPath(refKey, mediaType);
    const buf = await readFile(filePath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return null;
  }
}

export async function getJpVocabRefR2Object(
  env: CloudflareEnv,
  r2Key: string
): Promise<R2ObjectBody | null> {
  if (!hasJpReviewBucket(env)) return null;
  const obj = await env.JP_REVIEW.get(r2Key);
  return obj ?? null;
}

export async function jpVocabRefFileExists(
  env: CloudflareEnv,
  refKey: string,
  mediaType: JpVocabMediaType,
  r2Key: string
): Promise<boolean> {
  if (isLocalJpVocabRefMarker(r2Key)) {
    const bytes = await readLocalJpVocabRefFile(refKey, mediaType);
    return Boolean(bytes?.byteLength);
  }
  const obj = await getJpVocabRefR2Object(env, r2Key);
  return Boolean(obj);
}

export async function putJpVocabRefFile(
  env: CloudflareEnv,
  refKey: string,
  mediaType: JpVocabMediaType,
  bytes: ArrayBuffer
): Promise<{ r2_key: string; storage: "r2" | "local" }> {
  const r2Key = jpVocabRefR2Key(refKey, mediaType);

  // 与 jp-review PDF 共用 JP_REVIEW 桶；桶内删除逻辑见 jp-review.ts，禁止整桶清理
  if (hasJpReviewBucket(env)) {
    await env.JP_REVIEW.put(r2Key, bytes, {
      httpMetadata: { contentType: jpVocabRefContentType(mediaType) },
    });
    return { r2_key: r2Key, storage: "r2" };
  }

  const filePath = jpVocabRefPublicPath(refKey, mediaType);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(bytes));
  return { r2_key: jpVocabRefLocalMarker(refKey), storage: "local" };
}
