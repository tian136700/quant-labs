/** 课堂备注条目（存储于 jp_vocab_word.class_notes，北京时间时间戳 + 正文） */
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

/** 编辑框只展示文字；图片地址保存在 imageSrcs 中 */
export function splitJpVocabClassNoteDraftForEdit(content: string): {
  text: string;
  imageSrcs: string[];
} {
  const segments = parseJpVocabClassNoteContent(content);
  const textParts: string[] = [];
  const imageSrcs: string[] = [];
  for (const segment of segments) {
    if (segment.type === "image") {
      imageSrcs.push(segment.src);
    } else if (segment.text.trim()) {
      textParts.push(segment.text.trimEnd());
    }
  }
  return { text: textParts.join("\n\n"), imageSrcs };
}

export function mergeJpVocabClassNoteDraftFromEdit(
  text: string,
  imageSrcs: readonly string[]
): string {
  const trimmed = text.trimEnd();
  const imageLines = imageSrcs.map((src) => formatJpVocabClassNoteImageMarkdown(src));
  if (!trimmed && !imageLines.length) return "";
  if (!trimmed) return imageLines.join("\n");
  if (!imageLines.length) return trimmed;
  return `${trimmed}\n${imageLines.join("\n")}`;
}

export function removeJpVocabClassNoteImageAt(content: string, index: number): string {
  const { text, imageSrcs } = splitJpVocabClassNoteDraftForEdit(content);
  if (index < 0 || index >= imageSrcs.length) return content;
  return mergeJpVocabClassNoteDraftFromEdit(
    text,
    imageSrcs.filter((_, i) => i !== index)
  );
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
