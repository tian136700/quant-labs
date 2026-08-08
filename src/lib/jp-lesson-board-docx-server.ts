import "server-only";

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { CloudflareEnv } from "@/lib/types";
import { hasJpReviewBucket } from "@/lib/jp-review";
import {
  isLocalJpLessonBoardDocxMarker,
  jpLessonBoardDocxLocalMarker,
  jpLessonBoardDocxR2Key,
} from "@/lib/jp-lesson-board-docx";

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function jpLessonBoardDocxPublicPath(lessonId: number): string {
  return path.join(
    process.cwd(),
    "public",
    "jp-lesson-board-docx",
    `lesson-${lessonId}.docx`
  );
}

export async function putJpLessonBoardDocxFile(
  env: CloudflareEnv,
  lessonId: number,
  bytes: ArrayBuffer
): Promise<{ r2_key: string; storage: "r2" | "local" }> {
  const r2Key = jpLessonBoardDocxR2Key(lessonId);
  if (hasJpReviewBucket(env)) {
    await env.JP_REVIEW.put(r2Key, bytes, {
      httpMetadata: { contentType: DOCX_CONTENT_TYPE },
    });
    return { r2_key: r2Key, storage: "r2" };
  }
  const filePath = jpLessonBoardDocxPublicPath(lessonId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(bytes));
  return { r2_key: jpLessonBoardDocxLocalMarker(lessonId), storage: "local" };
}

export async function getJpLessonBoardDocxBytes(
  env: CloudflareEnv,
  r2Key: string,
  lessonId: number
): Promise<ArrayBuffer | null> {
  if (isLocalJpLessonBoardDocxMarker(r2Key)) {
    try {
      const buf = await readFile(jpLessonBoardDocxPublicPath(lessonId));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch {
      return null;
    }
  }
  if (!hasJpReviewBucket(env)) return null;
  const obj = await env.JP_REVIEW.get(r2Key);
  if (!obj) return null;
  // Workers R2ObjectBody 有 arrayBuffer()；本地 types 也曾缺声明导致 deploy tsc 失败
  if (typeof obj.arrayBuffer === "function") {
    return obj.arrayBuffer();
  }
  if (!obj.body) return null;
  return new Response(obj.body).arrayBuffer();
}
