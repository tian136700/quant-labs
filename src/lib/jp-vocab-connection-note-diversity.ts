/**
 * 接序「｜说明」须按形态区分（标本 id=521「～かもしれない」）。
 * 禁止同一用法下多段公式都抄同一句用法大意（如每行都写「好像……、看起来……」）。
 */

const USAGE_TAG_PREFIX_RE = /^用法\s*\d+\s*[：:]\s*/;
const NOTE_SEP_RE = /\s*[｜|]\s*/;

function splitSemicolonOutsideParens(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of String(text ?? "")) {
    if (ch === "（" || ch === "(") depth += 1;
    else if (ch === "）" || ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "；" || ch === ";")) {
      const t = buf.trim();
      if (t) parts.push(t);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const last = buf.trim();
  if (last) parts.push(last);
  return parts;
}

function connectionNotesOnLine(line: string): string[] {
  const body = String(line ?? "")
    .trim()
    .replace(USAGE_TAG_PREFIX_RE, "")
    .trim();
  if (!body || !NOTE_SEP_RE.test(body)) return [];
  const notes: string[] = [];
  for (const seg of splitSemicolonOutsideParens(body)) {
    const parts = seg.split(NOTE_SEP_RE);
    if (parts.length < 2) continue;
    const note = parts.slice(1).join("｜").trim();
    if (note) notes.push(note);
  }
  return notes;
}

/**
 * 同一行（同一用法）≥3 段都有「｜说明」且说明全文相同 → 视为无区分度脏数据。
 */
export function connectionHasRepeatedIdenticalNotes(
  raw: string | null | undefined
): boolean {
  const text = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return false;
  for (const line of text.split("\n")) {
    const notes = connectionNotesOnLine(line);
    if (notes.length < 3) continue;
    if (new Set(notes).size === 1) return true;
  }
  return false;
}

/**
 * 能拆成 ≥2 行接续表，但「｜说明」缺失或过少 → 卡片说明列大量「—」。
 * 标本 id=521 / 示例图要求每段都有短说明。
 * 另：说明列若写成「接…时：名词＋だ…」整段公式，也不算有效说明。
 */
export function connectionHasMissingTableNotes(
  raw: string | null | undefined
): boolean {
  const text = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return false;
  let formulaSegs = 0;
  let notedSegs = 0;
  for (const line of text.split("\n")) {
    const body = String(line ?? "")
      .trim()
      .replace(USAGE_TAG_PREFIX_RE, "")
      .trim();
    if (!body) continue;
    for (const seg of splitSemicolonOutsideParens(body)) {
      if (!/[＋+]/.test(seg)) continue;
      formulaSegs += 1;
      const parts = seg.split(NOTE_SEP_RE);
      const note = parts.length >= 2 ? parts.slice(1).join("｜").trim() : "";
      // 「接名词谓语句时：名词＋だ…」是公式冒充说明，不算有效说明列
      if (note && !/^接[^：:]+时[：:]/u.test(note)) {
        notedSegs += 1;
      }
    }
  }
  if (formulaSegs < 2) return false;
  // 无说明，或说明覆盖不到一半行
  return notedSegs === 0 || notedSegs * 2 < formulaSegs;
}
