import type { JpVocabMediaType } from "@/lib/types";

export const JP_VOCAB_REF_R2_PREFIX = "vocab-ref/";

export function normalizeJpVocabRefKey(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
