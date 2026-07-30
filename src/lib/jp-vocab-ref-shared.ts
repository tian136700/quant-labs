import { parseLessonContent } from "@/lib/jp-lesson-shared";
import type {
  JpLessonKind,
  JpVocabMediaType,
  JpVocabRef,
} from "@/lib/types";

/** 教案文件 R2 前缀；与 review PDF 共用 JP_REVIEW 桶，上传 review 时不得删除此前缀下对象 */
export const JP_VOCAB_REF_R2_PREFIX = "vocab-ref/";

/** Windows / 跨平台文件名非法字符；顿号、括号、日文可保留 */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;

/** 下载 basename 最长（留扩展名与「-分页」后缀；避免 Windows 路径过长） */
const MAX_DOWNLOAD_BASENAME_LEN = 140;

/**
 * 清洗下载文件名：去掉 OS 非法字符，保留顿号、括号、中日文。
 * 现代 macOS / Windows 10+ / Linux 对 UTF-8 文件名均安全。
 */
export function sanitizeJpVocabRefDownloadBasename(raw: string): string {
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
 * 新课下载名（无扩展名）：`27、单词学习 (軽い, 全部, 雪)`
 * PDF/Word 分页导出会再加 `-分页` 与扩展名。
 */
export function jpLessonRefDownloadBasename(lesson: {
  id: number;
  kind: JpLessonKind;
  content: string;
}): string {
  const kindLabel =
    lesson.kind === "grammar"
      ? "语法学习"
      : lesson.kind === "word_grammar"
        ? "单词加语法学习"
        : "单词学习";
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
  return sanitizeJpVocabRefDownloadBasename(`${prefix}${itemsText}${suffix}`);
}

export function jpLessonRefDownloadFilename(
  lesson: { id: number; kind: JpLessonKind; content: string },
  mediaType: JpVocabMediaType
): string {
  const ext = mediaType === "pdf" ? "pdf" : "png";
  return `${jpLessonRefDownloadBasename(lesson)}.${ext}`;
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

export function jpVocabRefFilename(
  refKey: string,
  mediaType: JpVocabMediaType
): string {
  const ext = mediaType === "pdf" ? "pdf" : "png";
  return `${refKey}.${ext}`;
}

/** 教案文件 API（inline 预览、?download=1 附件、?meta=1 轻量元数据） */
export function jpVocabRefApiPath(
  refKey: string,
  opts?: { download?: boolean; meta?: boolean; v?: string | null }
): string {
  const base = `/api/jp-vocab/ref/${encodeURIComponent(refKey)}`;
  const params = new URLSearchParams();
  if (opts?.meta) params.set("meta", "1");
  if (opts?.download) params.set("download", "1");
  if (opts?.v) params.set("v", opts.v);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

/** 弹窗预览教案：优先用缓存元数据，缺失时用 ref_key 构造占位（默认可缩放图片） */
export function resolveJpVocabRefForPreview(
  refKey: string,
  refs: Record<string, JpVocabRef>,
  ref?: JpVocabRef
): JpVocabRef {
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
export function jpVocabRefViewerPath(
  refKey: string,
  v?: string | null
): string {
  const base = `/jp-vocab/ref/${encodeURIComponent(refKey)}`;
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
export async function jpVocabRefKeyFromBytes(bytes: ArrayBuffer): Promise<string> {
  const hex = await sha256HexBytes(bytes);
  return normalizeJpVocabRefKey(`img-${hex.slice(0, 24)}`);
}
