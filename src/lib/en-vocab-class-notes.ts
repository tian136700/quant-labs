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

export function hasEnVocabClassNotes(raw: string | null | undefined): boolean {
  return parseEnVocabClassNotes(raw).some((e) => e.content.trim());
}
