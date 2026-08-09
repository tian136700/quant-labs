import { parseLessonContent } from "@/lib/en-lesson-shared";
import type {
  EnLessonKind,
  EnVocabMediaType,
  EnVocabRef,
} from "@/lib/types";

/**
 * 英语教案 R2 前缀（与日语 `vocab-ref/` 必须隔离）。
 * 历史上曾误用 `vocab-ref/`，与日语 `lesson-{id}` 同桶同路径互相覆盖（托业盖掉日语教案）。
 * 与 review PDF 共用 JP_REVIEW 桶；上传 review 时不得删除此前缀下对象。
 */
export const EN_VOCAB_REF_R2_PREFIX = "en-vocab-ref/";
/** Windows / 跨平台文件名非法字符；空格与括号可保留 */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;

/** 下载 basename 最长（留扩展名与「-paginated」后缀；避免 Windows 路径过长） */
const MAX_DOWNLOAD_BASENAME_LEN = 140;

/**
 * 清洗下载文件名：去掉 OS 非法字符，保留空格、括号、英文。
 * 现代 macOS / Windows 10+ / Linux 对空格与 UTF-8 文件名均安全。
 */
export function sanitizeEnVocabRefDownloadBasename(raw: string): string {
  const cleaned = (raw || "")
    .replace(UNSAFE_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  if (!cleaned) return "lesson";
  if (cleaned.length <= MAX_DOWNLOAD_BASENAME_LEN) return cleaned;
  return `${cleaned.slice(0, MAX_DOWNLOAD_BASENAME_LEN - 3).trimEnd()}...`;
}

function joinDownloadItems(items: string[], maxItemsLen: number): string {
  if (!items.length) return "";
  const parts: string[] = [];
  let used = 0;
  for (const item of items) {
    const next = parts.length ? `, ${item}` : item;
    if (used + next.length > maxItemsLen && parts.length > 0) {
      parts.push("...");
      break;
    }
    parts.push(item);
    used += next.length;
  }
  return parts.join(", ");
}

/**
 * 新课下载名（无扩展名，英文，供菲律宾等英语老师查看）：
 * `27. Word Learn (apple, book, snow)` / `27. Grammar Learn (in spite of, …)`
 * 空格保留；分页导出会再加 `-paginated`；整图 PDF 直接用 basename + `.pdf`。
 */
export function enLessonRefDownloadBasename(lesson: {
  id: number;
  kind: EnLessonKind;
  content: string;
}): string {
  const kindLabel = lesson.kind === "grammar" ? "Grammar Learn" : "Word Learn";
  const prefix = `${lesson.id}. ${kindLabel} (`;
  const suffix = ")";
  const itemsBudget = Math.max(
    24,
    MAX_DOWNLOAD_BASENAME_LEN - prefix.length - suffix.length
  );
  const items = parseLessonContent(lesson.content);
  const itemsText = items.length
    ? joinDownloadItems(items, itemsBudget)
    : (lesson.content || "").trim() || "-";
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

/** 新课教案：英语独占 ref_key，禁止再用 lesson-{id}（会与日语同名，历史上同 R2 路径互相覆盖） */
export function enLessonRefKey(lessonId: number): string {
  return `en-lesson-${lessonId}`;
}

export function enVocabRefR2Key(refKey: string, mediaType: EnVocabMediaType): string {
  const ext = mediaType === "pdf" ? ".pdf" : ".png";
  return `${EN_VOCAB_REF_R2_PREFIX}${refKey}${ext}`;
}

export function enVocabRefContentType(mediaType: EnVocabMediaType): string {
  return mediaType === "pdf" ? "application/pdf" : "image/png";
}

/**
 * 以 r2_key 扩展名为准纠偏 media_type（与日语 resolveJpVocabRefMediaType 同逻辑）。
 * 新课→抽问 metadata upsert 曾把 PDF 盖成 image。
 */
export function resolveEnVocabRefMediaType(ref: {
  media_type?: string | null;
  r2_key?: string | null;
}): EnVocabMediaType {
  const key = String(ref.r2_key || "").toLowerCase();
  if (key.endsWith(".pdf")) return "pdf";
  if (ref.media_type === "pdf") return "pdf";
  return "image";
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

/** 教案文件 API（inline 预览、?download=1 附件、?meta=1 轻量元数据） */
export function enVocabRefApiPath(
  refKey: string,
  opts?: { download?: boolean; meta?: boolean; v?: string | null }
): string {
  const base = `/api/en-vocab/ref/${encodeURIComponent(refKey)}`;
  const params = new URLSearchParams();
  if (opts?.meta) params.set("meta", "1");
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
  const base =
    ref ??
    refs[refKey] ?? {
      ref_key: refKey,
      title: null,
      media_type: "image" as const,
      r2_key: "",
      created_at: "",
      updated_at: "",
    };
  return {
    ...base,
    media_type: resolveEnVocabRefMediaType(base),
  };
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
