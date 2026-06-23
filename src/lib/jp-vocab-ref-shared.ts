import type { JpVocabMediaType } from "@/lib/types";

export const JP_VOCAB_REF_R2_PREFIX = "vocab-ref/";

export function normalizeJpVocabRefKey(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 新课教案：每条 lesson 独占一个 ref_key，由系统生成，不依赖用户输入 */
export function jpLessonRefKey(lessonId: number): string {
  return `lesson-${lessonId}`;
}

export function jpVocabRefR2Key(refKey: string, mediaType: JpVocabMediaType): string {
  const ext = mediaType === "pdf" ? ".pdf" : ".png";
  return `${JP_VOCAB_REF_R2_PREFIX}${refKey}${ext}`;
}

export function jpVocabRefContentType(mediaType: JpVocabMediaType): string {
  return mediaType === "pdf" ? "application/pdf" : "image/png";
}

/** 本地 dev：文件落在 public/jp-vocab-refs/，r2_key 记为 local:{ref_key} */
export function jpVocabRefLocalMarker(refKey: string): string {
  return `local:${refKey}`;
}

export function isLocalJpVocabRefMarker(r2Key: string): boolean {
  return r2Key.startsWith("local:");
}

export function jpVocabRefPublicUrl(refKey: string): string {
  return `/jp-vocab-refs/${refKey}`;
}

export async function sha256HexBytes(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 相同图片字节 → 相同 ref_key，便于多条词条共用教案 */
export async function jpVocabRefKeyFromBytes(bytes: ArrayBuffer): Promise<string> {
  const hex = await sha256HexBytes(bytes);
  return normalizeJpVocabRefKey(`img-${hex.slice(0, 24)}`);
}
