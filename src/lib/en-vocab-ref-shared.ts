import type { EnVocabMediaType, EnVocabRef } from "@/lib/types";

/** 教案文件 R2 前缀；与 review PDF 共用 JP_REVIEW 桶，上传 review 时不得删除此前缀下对象 */
export const JP_VOCAB_REF_R2_PREFIX = "vocab-ref/";

export function normalizeEnVocabRefKey(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 新课教案：每条 lesson 独占一个 ref_key，由系统生成，不依赖用户输入 */
export function enLessonRefKey(lessonId: number): string {
  return `lesson-${lessonId}`;
}

export function enVocabRefR2Key(refKey: string, mediaType: EnVocabMediaType): string {
  const ext = mediaType === "pdf" ? ".pdf" : ".png";
  return `${JP_VOCAB_REF_R2_PREFIX}${refKey}${ext}`;
}

export function enVocabRefContentType(mediaType: EnVocabMediaType): string {
  return mediaType === "pdf" ? "application/pdf" : "image/png";
}

/** 本地 dev：文件落在 public/en-vocab-refs/，r2_key 记为 local:{ref_key} */
export function enVocabRefLocalMarker(refKey: string): string {
  return `local:${refKey}`;
}

export function isLocalEnVocabRefMarker(r2Key: string): boolean {
  return r2Key.startsWith("local:");
}

export function enVocabRefPublicUrl(refKey: string): string {
  return `/en-vocab-refs/${refKey}`;
}

export function enVocabRefFilename(
  refKey: string,
  mediaType: EnVocabMediaType
): string {
  const ext = mediaType === "pdf" ? "pdf" : "png";
  return `${refKey}.${ext}`;
}

/** 教案文件 API（inline 预览或 ?download=1 附件下载） */
export function enVocabRefApiPath(
  refKey: string,
  opts?: { download?: boolean; v?: string | null }
): string {
  const base = `/api/en-vocab/ref/${encodeURIComponent(refKey)}`;
  const params = new URLSearchParams();
  if (opts?.download) params.set("download", "1");
  if (opts?.v) params.set("v", opts.v);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

/** 弹窗预览教案：优先用缓存元数据，缺失时用 ref_key 构造占位（默认可缩放图片） */
export function resolveEnVocabRefForPreview(
  refKey: string,
  refs: Record<string, EnVocabRef>,
  ref?: EnVocabRef
): EnVocabRef {
  return (
    ref ??
    refs[refKey] ?? {
      ref_key: refKey,
      title: null,
      media_type: "image",
      r2_key: "",
      created_at: "",
      updated_at: "",
    }
  );
}

/** 教案查看页（带下载按钮） */
export function enVocabRefViewerPath(
  refKey: string,
  v?: string | null
): string {
  const base = `/en-vocab/ref/${encodeURIComponent(refKey)}`;
  if (v) return `${base}?v=${encodeURIComponent(v)}`;
  return base;
}

export async function sha256HexBytes(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 相同图片字节 → 相同 ref_key，便于多条词条共用教案 */
export async function enVocabRefKeyFromBytes(bytes: ArrayBuffer): Promise<string> {
  const hex = await sha256HexBytes(bytes);
  return normalizeEnVocabRefKey(`img-${hex.slice(0, 24)}`);
}
