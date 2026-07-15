import { parseLessonContent } from "@/lib/en-lesson-shared";
import type {
  EnLessonKind,
  EnVocabMediaType,
  EnVocabRef,
} from "@/lib/types";

/** 教案文件 R2 前缀；与 review PDF 共用 JP_REVIEW 桶，上传 review 时不得删除此前缀下对象 */
export const JP_VOCAB_REF_R2_PREFIX = "vocab-ref/";

/** Windows / 跨平台文件名非法字符；顿号、括号、中文可保留 */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;

/** 下载 basename 最长（留扩展名与「-分页」后缀；避免 Windows 路径过长） */
const MAX_DOWNLOAD_BASENAME_LEN = 140;

/**
 * 清洗下载文件名：去掉 OS 非法字符，保留顿号、括号、中英文。
 * 现代 macOS / Windows 10+ / Linux 对 UTF-8 文件名均安全。
 */
export function sanitizeEnVocabRefDownloadBasename(raw: string): string {
  const cleaned = (raw || "")
    .replace(UNSAFE_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  if (!cleaned) return "教案";
  if (cleaned.length <= MAX_DOWNLOAD_BASENAME_LEN) return cleaned;
  return `${cleaned.slice(0, MAX_DOWNLOAD_BASENAME_LEN - 1).trimEnd()}…`;
}

function joinDownloadItems(items: string[], maxItemsLen: number): string {
  if (!items.length) return "";
  const parts: string[] = [];
  let used = 0;
  for (const item of items) {
    const next = parts.length ? `, ${item}` : item;
    if (used + next.length > maxItemsLen && parts.length > 0) {
      parts.push("…");
      break;
    }
    parts.push(item);
    used += next.length;
  }
  return parts.join(", ");
}

/**
 * 新课下载名（无扩展名）：`27、单词学习 (apple, book, snow)`
 * 分页导出会再加 `-分页` 与扩展名；整图 PDF 直接用 basename + `.pdf`。
 */
export function enLessonRefDownloadBasename(lesson: {
  id: number;
  kind: EnLessonKind;
  content: string;
}): string {
  const kindLabel = lesson.kind === "grammar" ? "语法学习" : "单词学习";
  const prefix = `${lesson.id}、${kindLabel} (`;
  const suffix = ")";
  const itemsBudget = Math.max(
    24,
    MAX_DOWNLOAD_BASENAME_LEN - prefix.length - suffix.length
  );
  const items = parseLessonContent(lesson.content);
  const itemsText = items.length
    ? joinDownloadItems(items, itemsBudget)
    : (lesson.content || "").trim() || "—";
  return sanitizeEnVocabRefDownloadBasename(`${prefix}${itemsText}${suffix}`);
}

export function enLessonRefDownloadFilename(
  lesson: { id: number; kind: EnLessonKind; content: string },
  mediaType: EnVocabMediaType
): string {
  const ext = mediaType === "pdf" ? "pdf" : "png";
  return `${enLessonRefDownloadBasename(lesson)}.${ext}`;
}

/** Content-Disposition：ASCII fallback + UTF-8 filename*（浏览器原图直链下载用） */
export function contentDispositionAttachment(filename: string): string {
  const ascii =
    filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "download";
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

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
