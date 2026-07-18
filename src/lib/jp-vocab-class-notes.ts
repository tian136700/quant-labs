/** 课堂备注条目（存储于 jp_vocab_word.class_notes，北京时间时间戳 + 正文） */
import type { JpVocabWord } from "@/lib/types";

export type JpVocabClassNoteEntry = {
  timestamp: string | null;
  content: string;
};

const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})$/;

export function formatBeijingClassNoteTimestamp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function parseJpVocabClassNotes(raw: string | null | undefined): JpVocabClassNoteEntry[] {
  const text = (raw || "").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const entries: JpVocabClassNoteEntry[] = [];
  let currentTs: string | null = null;
  let contentLines: string[] = [];

  const flush = () => {
    const content = contentLines.join("\n").trim();
    if (currentTs || content) {
      entries.push({ timestamp: currentTs, content });
    }
    currentTs = null;
    contentLines = [];
  };

  for (const line of lines) {
    const tsMatch = line.trim().match(TIMESTAMP_RE);
    if (tsMatch) {
      flush();
      currentTs = tsMatch[1];
      continue;
    }
    contentLines.push(line);
  }
  flush();

  return entries.filter((e) => e.timestamp || e.content.trim());
}

export function serializeJpVocabClassNotes(entries: JpVocabClassNoteEntry[]): string {
  return entries
    .filter((e) => e.content.trim())
    .map((e) =>
      e.timestamp
        ? `${e.timestamp}\n${e.content.trim()}`
        : e.content.trim()
    )
    .join("\n\n");
}

/** 当前编辑会话：同一 timestamp 下更新最后一条，否则追加 */
export function upsertJpVocabClassNoteSession(
  existing: string | null | undefined,
  sessionTimestamp: string,
  draftContent: string
): string {
  const entries = parseJpVocabClassNotes(existing).filter(
    (e) => e.timestamp !== sessionTimestamp
  );
  const trimmed = draftContent.trim();
  if (!trimmed) {
    return serializeJpVocabClassNotes(entries);
  }
  return serializeJpVocabClassNotes([
    ...entries,
    { timestamp: sessionTimestamp, content: trimmed },
  ]);
}

export type JpVocabClassNoteEditTarget =
  | { mode: "new" }
  | { mode: "existing-timestamp"; originalTimestamp: string }
  | { mode: "existing-index"; originalIndex: number };

/** 保存备注草稿：编辑已有条目时移除旧记录并写入新时间戳 */
export function saveJpVocabClassNoteDraft(
  existing: string | null | undefined,
  target: JpVocabClassNoteEditTarget,
  sessionTimestamp: string | null,
  draftContent: string,
  now = new Date()
): {
  nextNotes: string;
  sessionTimestamp: string;
  nextTarget: JpVocabClassNoteEditTarget;
} {
  let entries = parseJpVocabClassNotes(existing);
  let nextTarget = target;

  if (target.mode === "existing-timestamp") {
    entries = entries.filter((entry) => entry.timestamp !== target.originalTimestamp);
    nextTarget = { mode: "new" };
  } else if (target.mode === "existing-index") {
    entries = entries.filter((_, index) => index !== target.originalIndex);
    nextTarget = { mode: "new" };
  }

  const nextSessionTimestamp =
    sessionTimestamp ?? formatBeijingClassNoteTimestamp(now);
  const trimmed = draftContent.trim();
  entries = entries.filter((entry) => entry.timestamp !== nextSessionTimestamp);

  const nextNotes = serializeJpVocabClassNotes([
    ...entries,
    { timestamp: nextSessionTimestamp, content: trimmed },
  ]);

  return {
    nextNotes,
    sessionTimestamp: nextSessionTimestamp,
    nextTarget,
  };
}

export function hasJpVocabClassNotes(
  raw: string | null | undefined,
  presentHint?: boolean
): boolean {
  if (presentHint === true) return true;
  if (presentHint === false) return false;
  return parseJpVocabClassNotes(raw).some((e) => e.content.trim());
}

/**
 * 学生/老师卡按需拉备注后合并词条。
 * lite 列表已有 example_sentences；备注 GET 若漏字段，禁止整词覆盖冲掉例句。
 */
export function mergeJpVocabWordAfterClassNotesFetch(
  base: JpVocabWord,
  fetched: JpVocabWord
): JpVocabWord {
  return {
    ...base,
    ...fetched,
    example_sentences:
      fetched.example_sentences ?? base.example_sentences ?? null,
    class_notes_present: hasJpVocabClassNotes(fetched.class_notes, true),
  };
}

/** 按索引删除一条备注（用于历史记录删除） */
export function removeJpVocabClassNoteAtIndex(
  existing: string | null | undefined,
  index: number
): string {
  const entries = parseJpVocabClassNotes(existing);
  if (index < 0 || index >= entries.length) {
    return serializeJpVocabClassNotes(entries);
  }
  return serializeJpVocabClassNotes(entries.filter((_, i) => i !== index));
}

/** 按索引更新一条备注（用于无时间戳的旧条目编辑） */
export function replaceJpVocabClassNoteAtIndex(
  existing: string | null | undefined,
  index: number,
  newContent: string
): string {
  const entries = parseJpVocabClassNotes(existing);
  if (index < 0 || index >= entries.length) {
    return serializeJpVocabClassNotes(entries);
  }
  const trimmed = newContent.trim();
  if (!trimmed) {
    return serializeJpVocabClassNotes(entries.filter((_, i) => i !== index));
  }
  return serializeJpVocabClassNotes(
    entries.map((entry, i) => (i === index ? { ...entry, content: trimmed } : entry))
  );
}

/** 备注正文中的图片行：![](/api/jp-vocab/ref/{ref_key}) */
export const JP_VOCAB_CLASS_NOTE_IMAGE_LINE_RE =
  /^!\[\]\((\/api\/jp-vocab\/ref\/[^)]+)\)$/;

export function formatJpVocabClassNoteImageMarkdown(viewPath: string): string {
  const trimmed = viewPath.trim();
  return `![](${trimmed})`;
}

/** 将 API 路径或完整 URL 规范为备注图片 src（/api/jp-vocab/ref/…） */
export function normalizeJpVocabClassNoteImageSrc(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/jp-vocab/ref/")) return trimmed;
  try {
    const url = new URL(trimmed, "https://placeholder.local");
    const path = `${url.pathname}${url.search}`;
    if (path.startsWith("/api/jp-vocab/ref/")) return path;
  } catch {
    /* not a URL */
  }
  return null;
}

/** 从一行文字中解析备注图片 src；无法识别则返回 null */
export function parseJpVocabClassNoteImageSrc(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const mdMatch = trimmed.match(/^!\[\]\(([^)]+)\)$/);
  if (mdMatch) {
    return normalizeJpVocabClassNoteImageSrc(mdMatch[1]);
  }

  return normalizeJpVocabClassNoteImageSrc(trimmed);
}

/** 从文字片段中移除图片地址/markdown，避免老师看到或误删 API 路径 */
export function stripJpVocabClassNoteImageMarkersFromText(text: string): string {
  return text
    .replace(
      /!\[\]\(\/api\/jp-vocab\/ref\/[^)\s]+(?:\?[^)]*)?\)/g,
      ""
    )
    .replace(
      /!\[\]\(https?:\/\/[^\s)]+\/api\/jp-vocab\/ref\/[^)\s]+(?:\?[^)]*)?\)/gi,
      ""
    )
    .replace(/^(\/api\/jp-vocab\/ref\/[^\s]+(?:\?[^\s]*)?)\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export type JpVocabClassNoteSegment =
  | { type: "text"; text: string }
  | { type: "image"; src: string };

/** 将备注正文拆成文字与图片片段，用于渲染 */
export function parseJpVocabClassNoteContent(content: string): JpVocabClassNoteSegment[] {
  const lines = content.split("\n");
  const segments: JpVocabClassNoteSegment[] = [];
  let textLines: string[] = [];

  const flushText = () => {
    if (!textLines.length) return;
    const cleaned = stripJpVocabClassNoteImageMarkersFromText(textLines.join("\n"));
    if (cleaned.trim()) {
      segments.push({ type: "text", text: cleaned });
    }
    textLines = [];
  };

  for (const line of lines) {
    const imageSrc = parseJpVocabClassNoteImageSrc(line);
    if (imageSrc) {
      flushText();
      segments.push({ type: "image", src: imageSrc });
      continue;
    }
    textLines.push(line);
  }

  flushText();
  return segments;
}

/** 编辑框只展示文字；图片地址保存在 imageSrcs 中（保留行尾换行供 textarea 编辑） */
export function splitJpVocabClassNoteDraftForEdit(content: string): {
  text: string;
  imageSrcs: string[];
} {
  const lines = content.split("\n");
  const textLines: string[] = [];
  const imageSrcs: string[] = [];
  for (const line of lines) {
    const imageSrc = parseJpVocabClassNoteImageSrc(line);
    if (imageSrc) {
      imageSrcs.push(imageSrc);
      continue;
    }
    textLines.push(line);
  }
  return { text: textLines.join("\n"), imageSrcs };
}

export function mergeJpVocabClassNoteDraftFromEdit(
  text: string,
  imageSrcs: readonly string[]
): string {
  const imageLines = imageSrcs.map((src) => formatJpVocabClassNoteImageMarkdown(src));
  const hasText = text.trim().length > 0;
  if (!hasText && !imageLines.length) return "";
  if (!hasText) return imageLines.join("\n");
  if (!imageLines.length) return text;
  return `${text.trimEnd()}\n${imageLines.join("\n")}`;
}

export function removeJpVocabClassNoteImageAt(content: string, index: number): string {
  const { text, imageSrcs } = splitJpVocabClassNoteDraftForEdit(content);
  if (index < 0 || index >= imageSrcs.length) return content;
  return mergeJpVocabClassNoteDraftFromEdit(
    text,
    imageSrcs.filter((_, i) => i !== index)
  );
}

/**
 * 词条编辑弹窗整段 `class_notes`（多条时间戳）用：
 * 文本框只展示文字；图片按时间戳挂回，避免误改 API 路径。
 */
export type JpVocabClassNotesBlobEditImages = {
  byTimestamp: Record<string, string[]>;
  /** 无时间戳条目，按出现顺序 */
  untimestamped: string[][];
};

function serializeJpVocabClassNotesKeepingEmpty(
  entries: JpVocabClassNoteEntry[]
): string {
  return entries
    .map((e) => (e.timestamp ? `${e.timestamp}\n${e.content}` : e.content))
    .join("\n\n");
}

/** 按备注条目出现顺序展平图片 src（与缩略图顺序一致） */
export function flattenJpVocabClassNotesBlobEditImages(
  entryOrder: readonly JpVocabClassNoteEntry[],
  images: JpVocabClassNotesBlobEditImages
): string[] {
  const out: string[] = [];
  let untsIdx = 0;
  for (const entry of entryOrder) {
    if (entry.timestamp) {
      out.push(...(images.byTimestamp[entry.timestamp] ?? []));
    } else {
      out.push(...(images.untimestamped[untsIdx] ?? []));
      untsIdx += 1;
    }
  }
  return out;
}

/** 编辑框：拆出图片 URL，只保留时间戳 + 文字 */
export function splitJpVocabClassNotesBlobForEdit(raw: string): {
  text: string;
  images: JpVocabClassNotesBlobEditImages;
  imageSrcs: string[];
} {
  const entries = parseJpVocabClassNotes(raw);
  if (!entries.length) {
    const stripped = (raw || "").trim()
      ? stripJpVocabClassNoteImageMarkersFromText(raw)
      : "";
    return {
      text: stripped,
      images: { byTimestamp: {}, untimestamped: [] },
      imageSrcs: [],
    };
  }

  const byTimestamp: Record<string, string[]> = {};
  const untimestamped: string[][] = [];
  const textEntries: JpVocabClassNoteEntry[] = entries.map((entry) => {
    const { text, imageSrcs } = splitJpVocabClassNoteDraftForEdit(entry.content);
    if (entry.timestamp) {
      if (imageSrcs.length) byTimestamp[entry.timestamp] = imageSrcs;
    } else {
      untimestamped.push(imageSrcs);
    }
    return { timestamp: entry.timestamp, content: text };
  });

  const images = { byTimestamp, untimestamped };
  return {
    text: serializeJpVocabClassNotesKeepingEmpty(textEntries),
    images,
    imageSrcs: flattenJpVocabClassNotesBlobEditImages(entries, images),
  };
}

/** 把编辑框文字与隐藏的图片列表合并回可保存的 class_notes */
export function mergeJpVocabClassNotesBlobFromEdit(
  text: string,
  images: JpVocabClassNotesBlobEditImages
): string {
  const textEntries = parseJpVocabClassNotes(text);
  let untsIdx = 0;

  const merged: JpVocabClassNoteEntry[] = textEntries.map((entry) => {
    let imgs: string[] = [];
    if (entry.timestamp) {
      imgs = images.byTimestamp[entry.timestamp] ?? [];
    } else {
      imgs = images.untimestamped[untsIdx] ?? [];
      untsIdx += 1;
    }
    return {
      timestamp: entry.timestamp,
      content: mergeJpVocabClassNoteDraftFromEdit(entry.content, imgs),
    };
  });

  // 用户删掉了某条时间戳块：该条图片一并丢弃（不再挂到别的条目上）
  if (!merged.length) {
    const leftover = [
      ...Object.values(images.byTimestamp).flat(),
      ...images.untimestamped.flat(),
    ];
    if (leftover.length) {
      return mergeJpVocabClassNoteDraftFromEdit("", leftover);
    }
    return "";
  }

  return serializeJpVocabClassNotes(merged);
}

/** 按正文出现顺序移除第 N 张备注图片（词条编辑弹窗缩略图「移除」） */
export function removeJpVocabClassNotesBlobImageAt(
  raw: string,
  flatIndex: number
): string {
  if (flatIndex < 0) return raw;
  const lines = (raw || "").split("\n");
  let seen = 0;
  const out: string[] = [];
  for (const line of lines) {
    if (parseJpVocabClassNoteImageSrc(line)) {
      if (seen === flatIndex) {
        seen += 1;
        continue;
      }
      seen += 1;
    }
    out.push(line);
  }
  if (seen <= flatIndex) return raw;
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trimEnd();
}

/** 多条历史备注合并为展示用正文（不含时间戳行） */
export function formatJpVocabClassNotesForDisplay(raw: string | null | undefined): string {
  return parseJpVocabClassNotes(raw)
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** 估算备注展示长度（不含图片 API 地址） */
export function jpVocabClassNotesDisplayLength(raw: string | null | undefined): number {
  return parseJpVocabClassNotes(raw).reduce((total, entry) => {
    const { text, imageSrcs } = splitJpVocabClassNoteDraftForEdit(entry.content);
    return total + text.trim().length + imageSrcs.length * 48;
  }, 0);
}

/** 手机端词条卡片：备注 ≤ 此字数时内联展示 */
export const JP_VOCAB_MOBILE_NOTES_INLINE_MAX = 50;

export type JpVocabMobileNotesPreview =
  | { kind: "empty" }
  | { kind: "short-text"; text: string }
  | { kind: "image-only"; src: string }
  | { kind: "short-mixed"; text: string; src: string }
  | { kind: "long" };

/** 手机端备注列：判断是否可内联展示短文字/缩略图 */
export function resolveJpVocabMobileNotesPreview(
  raw: string | null | undefined
): JpVocabMobileNotesPreview {
  const display = formatJpVocabClassNotesForDisplay(raw).trim();
  if (!display) return { kind: "empty" };

  const { text, imageSrcs } = splitJpVocabClassNoteDraftForEdit(display);
  const textTrim = text.trim();
  const firstImage = imageSrcs[0];

  if (!textTrim && firstImage) {
    return { kind: "image-only", src: firstImage };
  }

  if (textTrim.length > JP_VOCAB_MOBILE_NOTES_INLINE_MAX || imageSrcs.length > 1) {
    return { kind: "long" };
  }

  if (textTrim && firstImage) {
    return { kind: "short-mixed", text: textTrim, src: firstImage };
  }

  if (textTrim.length <= JP_VOCAB_MOBILE_NOTES_INLINE_MAX) {
    return { kind: "short-text", text: textTrim };
  }

  return { kind: "long" };
}

export function appendJpVocabClassNoteImageLine(
  draft: string,
  viewPath: string
): string {
  const line = formatJpVocabClassNoteImageMarkdown(viewPath);
  const trimmed = draft.trimEnd();
  return trimmed ? `${trimmed}\n${line}` : line;
}

/** 从备注图片 src / view_path 取出 ref_key（忽略 ?v= 查询串） */
export function jpVocabClassNoteImageRefKeyFromSrc(
  src: string | null | undefined
): string | null {
  const normalized = normalizeJpVocabClassNoteImageSrc(src || "");
  if (!normalized) return null;
  const match = normalized.match(/^\/api\/jp-vocab\/ref\/([^/?#]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** 收集一段备注正文里已有图片的 ref_key */
export function collectJpVocabClassNoteImageRefKeysFromContent(
  content: string | null | undefined
): Set<string> {
  const keys = new Set<string>();
  if (!content?.trim()) return keys;
  for (const src of splitJpVocabClassNoteDraftForEdit(content).imageSrcs) {
    const key = jpVocabClassNoteImageRefKeyFromSrc(src);
    if (key) keys.add(key);
  }
  return keys;
}

/** 收集该词全部历史备注 + 当前草稿中的图片 ref_key */
export function collectJpVocabClassNoteImageRefKeys(
  storedNotes: string | null | undefined,
  draftContent?: string | null
): Set<string> {
  const keys = new Set<string>();
  for (const entry of parseJpVocabClassNotes(storedNotes)) {
    for (const key of collectJpVocabClassNoteImageRefKeysFromContent(entry.content)) {
      keys.add(key);
    }
  }
  if (draftContent?.trim()) {
    for (const key of collectJpVocabClassNoteImageRefKeysFromContent(draftContent)) {
      keys.add(key);
    }
  }
  return keys;
}
