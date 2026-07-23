/** 课堂备注条目（存储于 en_vocab_word.class_notes，北京时间时间戳 + 正文） */
export type EnVocabClassNoteEntry = {
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

export function parseEnVocabClassNotes(raw: string | null | undefined): EnVocabClassNoteEntry[] {
  const text = (raw || "").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const entries: EnVocabClassNoteEntry[] = [];
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

export function serializeEnVocabClassNotes(entries: EnVocabClassNoteEntry[]): string {
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
export function upsertEnVocabClassNoteSession(
  existing: string | null | undefined,
  sessionTimestamp: string,
  draftContent: string
): string {
  const entries = parseEnVocabClassNotes(existing).filter(
    (e) => e.timestamp !== sessionTimestamp
  );
  const trimmed = draftContent.trim();
  if (!trimmed) {
    return serializeEnVocabClassNotes(entries);
  }
  return serializeEnVocabClassNotes([
    ...entries,
    { timestamp: sessionTimestamp, content: trimmed },
  ]);
}

export function hasEnVocabClassNotes(
  raw: string | null | undefined,
  presentHint?: boolean
): boolean {
  if (presentHint === true) return true;
  if (presentHint === false) return false;
  return parseEnVocabClassNotes(raw).some((e) => e.content.trim());
}

/** 备注/用法正文中的图片行：![](/api/en-vocab/ref/{ref_key}) */
export const EN_VOCAB_CLASS_NOTE_IMAGE_LINE_RE =
  /^!\[\]\((\/api\/en-vocab\/ref\/[^)]+)\)$/;

export function formatEnVocabClassNoteImageMarkdown(viewPath: string): string {
  const trimmed = viewPath.trim();
  return `![](${trimmed})`;
}

/** 将 API 路径或完整 URL 规范为备注图片 src（/api/en-vocab/ref/…） */
export function normalizeEnVocabClassNoteImageSrc(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/en-vocab/ref/")) return trimmed;
  try {
    const url = new URL(trimmed, "https://placeholder.local");
    const path = `${url.pathname}${url.search}`;
    if (path.startsWith("/api/en-vocab/ref/")) return path;
  } catch {
    /* not a URL */
  }
  return null;
}

export function parseEnVocabClassNoteImageSrc(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const mdMatch = trimmed.match(/^!\[\]\(([^)]+)\)$/);
  if (mdMatch) {
    return normalizeEnVocabClassNoteImageSrc(mdMatch[1]);
  }
  return normalizeEnVocabClassNoteImageSrc(trimmed);
}

export function stripEnVocabClassNoteImageMarkersFromText(text: string): string {
  return text
    .replace(/!\[\]\(\/api\/en-vocab\/ref\/[^)\s]+(?:\?[^)]*)?\)/g, "")
    .replace(
      /!\[\]\(https?:\/\/[^\s)]+\/api\/en-vocab\/ref\/[^)\s]+(?:\?[^)]*)?\)/gi,
      ""
    )
    .replace(/^(\/api\/en-vocab\/ref\/[^\s]+(?:\?[^\s]*)?)\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export type EnVocabClassNoteSegment =
  | { type: "text"; text: string }
  | { type: "image"; src: string };

export function parseEnVocabClassNoteContent(
  content: string
): EnVocabClassNoteSegment[] {
  const lines = content.split("\n");
  const segments: EnVocabClassNoteSegment[] = [];
  let textLines: string[] = [];

  const flushText = () => {
    if (!textLines.length) return;
    const cleaned = stripEnVocabClassNoteImageMarkersFromText(
      textLines.join("\n")
    );
    if (cleaned.trim()) {
      segments.push({ type: "text", text: cleaned });
    }
    textLines = [];
  };

  for (const line of lines) {
    const imageSrc = parseEnVocabClassNoteImageSrc(line);
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

export function splitEnVocabClassNoteDraftForEdit(content: string): {
  text: string;
  imageSrcs: string[];
} {
  const lines = content.split("\n");
  const textLines: string[] = [];
  const imageSrcs: string[] = [];
  for (const line of lines) {
    const imageSrc = parseEnVocabClassNoteImageSrc(line);
    if (imageSrc) {
      imageSrcs.push(imageSrc);
      continue;
    }
    textLines.push(line);
  }
  return { text: textLines.join("\n"), imageSrcs };
}

export function mergeEnVocabClassNoteDraftFromEdit(
  text: string,
  imageSrcs: readonly string[]
): string {
  const imageLines = imageSrcs.map((src) =>
    formatEnVocabClassNoteImageMarkdown(src)
  );
  const hasText = text.trim().length > 0;
  if (!hasText && !imageLines.length) return "";
  if (!hasText) return imageLines.join("\n");
  if (!imageLines.length) return text;
  return `${text.trimEnd()}\n${imageLines.join("\n")}`;
}

export function removeEnVocabClassNoteImageAt(
  content: string,
  index: number
): string {
  const { text, imageSrcs } = splitEnVocabClassNoteDraftForEdit(content);
  if (index < 0 || index >= imageSrcs.length) return content;
  return mergeEnVocabClassNoteDraftFromEdit(
    text,
    imageSrcs.filter((_, i) => i !== index)
  );
}

export type EnVocabClassNotesBlobEditImages = {
  byTimestamp: Record<string, string[]>;
  untimestamped: string[][];
};

function serializeEnVocabClassNotesKeepingEmpty(
  entries: EnVocabClassNoteEntry[]
): string {
  return entries
    .map((e) => (e.timestamp ? `${e.timestamp}\n${e.content}` : e.content))
    .join("\n\n");
}

export function flattenEnVocabClassNotesBlobEditImages(
  entryOrder: readonly EnVocabClassNoteEntry[],
  images: EnVocabClassNotesBlobEditImages
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

export function splitEnVocabClassNotesBlobForEdit(raw: string): {
  text: string;
  images: EnVocabClassNotesBlobEditImages;
  imageSrcs: string[];
} {
  const entries = parseEnVocabClassNotes(raw);
  if (!entries.length) {
    const stripped = (raw || "").trim()
      ? stripEnVocabClassNoteImageMarkersFromText(raw)
      : "";
    return {
      text: stripped,
      images: { byTimestamp: {}, untimestamped: [] },
      imageSrcs: [],
    };
  }

  const byTimestamp: Record<string, string[]> = {};
  const untimestamped: string[][] = [];
  const textEntries: EnVocabClassNoteEntry[] = entries.map((entry) => {
    const { text, imageSrcs } = splitEnVocabClassNoteDraftForEdit(entry.content);
    if (entry.timestamp) {
      if (imageSrcs.length) byTimestamp[entry.timestamp] = imageSrcs;
    } else {
      untimestamped.push(imageSrcs);
    }
    return { timestamp: entry.timestamp, content: text };
  });

  const images = { byTimestamp, untimestamped };
  return {
    text: serializeEnVocabClassNotesKeepingEmpty(textEntries),
    images,
    imageSrcs: flattenEnVocabClassNotesBlobEditImages(entries, images),
  };
}

export function mergeEnVocabClassNotesBlobFromEdit(
  text: string,
  images: EnVocabClassNotesBlobEditImages
): string {
  const textEntries = parseEnVocabClassNotes(text);
  let untsIdx = 0;

  const merged: EnVocabClassNoteEntry[] = textEntries.map((entry) => {
    let imgs: string[] = [];
    if (entry.timestamp) {
      imgs = images.byTimestamp[entry.timestamp] ?? [];
    } else {
      imgs = images.untimestamped[untsIdx] ?? [];
      untsIdx += 1;
    }
    return {
      timestamp: entry.timestamp,
      content: mergeEnVocabClassNoteDraftFromEdit(entry.content, imgs),
    };
  });

  if (!merged.length) {
    const leftover = [
      ...Object.values(images.byTimestamp).flat(),
      ...images.untimestamped.flat(),
    ];
    if (leftover.length) {
      return mergeEnVocabClassNoteDraftFromEdit("", leftover);
    }
    return "";
  }

  return serializeEnVocabClassNotes(merged);
}

export function removeEnVocabClassNotesBlobImageAt(
  raw: string,
  flatIndex: number
): string {
  if (flatIndex < 0) return raw;
  const lines = (raw || "").split("\n");
  let seen = 0;
  const out: string[] = [];
  for (const line of lines) {
    if (parseEnVocabClassNoteImageSrc(line)) {
      if (seen === flatIndex) {
        seen += 1;
        continue;
      }
      seen += 1;
    }
    out.push(line);
  }
  if (seen <= flatIndex) return raw;
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trimEnd();
}

export function appendEnVocabClassNoteImageLine(
  draft: string,
  viewPath: string
): string {
  const line = formatEnVocabClassNoteImageMarkdown(viewPath);
  const trimmed = draft.trimEnd();
  return trimmed ? `${trimmed}\n${line}` : line;
}

export function enVocabClassNoteImageRefKeyFromSrc(
  src: string | null | undefined
): string | null {
  const normalized = normalizeEnVocabClassNoteImageSrc(src || "");
  if (!normalized) return null;
  const match = normalized.match(/^\/api\/en-vocab\/ref\/([^/?#]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function collectEnVocabClassNoteImageRefKeysFromContent(
  content: string | null | undefined
): Set<string> {
  const keys = new Set<string>();
  for (const src of splitEnVocabClassNoteDraftForEdit(content || "").imageSrcs) {
    const key = enVocabClassNoteImageRefKeyFromSrc(src);
    if (key) keys.add(key);
  }
  return keys;
}

export function collectEnVocabClassNoteImageRefKeys(
  raw: string | null | undefined,
  draftContent?: string | null
): Set<string> {
  const keys = new Set<string>();
  for (const entry of parseEnVocabClassNotes(raw)) {
    for (const key of collectEnVocabClassNoteImageRefKeysFromContent(
      entry.content
    )) {
      keys.add(key);
    }
  }
  if (draftContent) {
    for (const key of collectEnVocabClassNoteImageRefKeysFromContent(
      draftContent
    )) {
      keys.add(key);
    }
  }
  return keys;
}
