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

/** 备注正文中的图片行：![](/api/jp-vocab/ref/{ref_key}) */
export const JP_VOCAB_CLASS_NOTE_IMAGE_LINE_RE =
  /^!\[\]\((\/api\/jp-vocab\/ref\/[^)]+)\)$/;

export function formatJpVocabClassNoteImageMarkdown(viewPath: string): string {
  const trimmed = viewPath.trim();
  return `![](${trimmed})`;
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
    segments.push({ type: "text", text: textLines.join("\n") });
    textLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(JP_VOCAB_CLASS_NOTE_IMAGE_LINE_RE);
    if (match) {
      flushText();
      segments.push({ type: "image", src: match[1] });
      continue;
    }
    textLines.push(line);
  }

  flushText();
  return segments;
}

export function appendJpVocabClassNoteImageLine(
  draft: string,
  viewPath: string
): string {
  const line = formatJpVocabClassNoteImageMarkdown(viewPath);
  const trimmed = draft.trimEnd();
  return trimmed ? `${trimmed}\n${line}` : line;
}
