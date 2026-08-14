/**
 * 接续表行展开：括号外拆「＋」、标签「／」分行（对齐 docs/日语接续示例图.png）。
 */

export type JpVocabConnectionTableRowLike = {
  label: string;
  body: string;
  note?: string;
};

/** 只在括号外找第一个「＋／+」，避免「（…＋だ／名词＋だ）＋と言いました」拆错列 */
export function splitConnectionPlusOutsideParens(
  seg: string
): { label: string; body: string } | null {
  const raw = String(seg ?? "").trim();
  if (!raw) return null;
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "（" || ch === "(") depth += 1;
    else if (ch === "）" || ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === "＋" || ch === "+")) {
      const label = raw.slice(0, i).trim();
      const rest = raw.slice(i + 1).trim();
      if (!label || !rest) return null;
      return { label, body: `＋${rest}` };
    }
  }
  return null;
}

/**
 * 标签「动词原形／一类形容词原形」→ 多行同 body/note。
 * 不拆括号内的 ／（由 expandConnectionTableLabelParensSlash 处理）。
 */
export function expandConnectionTableLabelSlash(
  rows: JpVocabConnectionTableRowLike[]
): JpVocabConnectionTableRowLike[] {
  const out: JpVocabConnectionTableRowLike[] = [];
  for (const row of rows) {
    const label = String(row.label || "").trim();
    if (!label || (!label.includes("／") && !label.includes("/"))) {
      out.push(row);
      continue;
    }
    if (/[（(]/.test(label) && /[）)]/.test(label)) {
      // 整标签是「前缀（A／B）」交给括号展开；此处不拆
      out.push(row);
      continue;
    }
    if (/[（(]/.test(label) && !/[）)]/.test(label)) {
      // 未闭合括号：脏数据，原样保留（写回应拒）
      out.push(row);
      continue;
    }
    const parts = label
      .split(/(?:／|\/)/u)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) {
      out.push(row);
      continue;
    }
    for (const part of parts) {
      out.push({ ...row, label: part });
    }
  }
  return out;
}

/** 括号内同时出现 ／ 与 ＋（如 572 旧稿）→ 展示必乱，写回应拒 */
export function connectionHasMessyParenPlusSlash(
  raw: string | null | undefined
): boolean {
  const text = String(raw ?? "");
  if (!text) return false;
  // （ … ＋ … ／ … ）或 （ … ／ … ＋ … ）
  return /（[^）\n]*[＋+][^）\n]*[／/][^）\n]*）/.test(text) ||
    /（[^）\n]*[／/][^）\n]*[＋+][^）\n]*）/.test(text) ||
    /\([^)\n]*[＋+][^)\n]*[\/][^)\n]*\)/.test(text) ||
    /\([^)\n]*[\/][^)\n]*[＋+][^)\n]*\)/.test(text);
}

const CONNECTION_USAGE_LINE_RE = /^用法\s*\d+\s*[：:]\s*(.*)$/;
const CONNECTION_USAGE_TAG_PREFIX_RE = /^用法\s*\d+\s*[：:]\s*/;
/** 仅词类／形态本身，不含「＋接什么」 */
const CONNECTION_POS_LABEL_RE =
  /^(?:动词(?:辞书形(?:（动词原形）)?|原形|た形|ている形|普通形|简体形|ない形|なかった形|句)?|一类动词|二类动词|三类动词|一类形容词(?:原形|普通形|句|词尾い)?|二类形容词(?:词干|原形|普通形|句)?|名词(?:句)?)$/u;

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

export function isJpVocabConnectionPosLabel(raw: string): boolean {
  return CONNECTION_POS_LABEL_RE.test(String(raw || "").trim());
}

/**
 * 「もしかしたら＋动词句」：本语法前缀在左、词类在右（表列会反）。
 * 句首接续「前句（动词句／…）＋しかし」右列不是词类，不算。
 */
export function looksLikeGrammarPrefixPlusPos(seg: string): {
  prefix: string;
  pos: string;
} | null {
  const split = splitConnectionPlusOutsideParens(
    String(seg ?? "").replace(CONNECTION_USAGE_TAG_PREFIX_RE, "").trim()
  );
  if (!split) return null;
  const left = split.label.trim();
  const right = split.body.replace(/^[＋+]/, "").split(/[｜|]/)[0]?.trim() ?? "";
  if (!left || !right) return null;
  if (!isJpVocabConnectionPosLabel(right)) return null;
  if (isJpVocabConnectionPosLabel(left)) return null;
  if (/(?:动词|形容词|名词|词干|形)/.test(left)) return null;
  return { prefix: left, pos: right };
}

function splitFormulaNote(body: string): { body: string; note?: string } {
  const raw = String(body ?? "").trim();
  const m = /\s*[｜|]\s*/.exec(raw);
  if (!m || m.index == null) return { body: raw };
  const main = raw.slice(0, m.index).trim();
  const note = raw.slice(m.index + m[0].length).trim();
  if (!main) return { body: raw };
  if (!note) return { body: main };
  return { body: main, note };
}

function expandConnectionBlockForTableParse(body: string): string {
  const segments: string[] = [];
  for (const line of String(body ?? "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/[；;]/.test(t)) segments.push(...splitSemicolonOutsideParens(t));
    else segments.push(t);
  }
  const pendingPos: string[] = [];
  const out: string[] = [];
  const flushWith = (ending: string, note: string | undefined, lastPos: string) => {
    const allPos = [...pendingPos, lastPos];
    pendingPos.length = 0;
    const plusBody = ending.replace(/^[＋+]/, "＋");
    for (const pos of allPos) {
      out.push(note ? `${pos}${plusBody}｜${note}` : `${pos}${plusBody}`);
    }
  };
  for (const seg of segments) {
    const inverted = looksLikeGrammarPrefixPlusPos(seg);
    if (inverted) {
      pendingPos.push(inverted.pos);
      continue;
    }
    if (
      isJpVocabConnectionPosLabel(seg) &&
      !/[＋+]/.test(seg) &&
      !/[：:]/.test(seg)
    ) {
      pendingPos.push(seg);
      continue;
    }
    const split = splitConnectionPlusOutsideParens(seg);
    if (split && isJpVocabConnectionPosLabel(split.label)) {
      const { body: plusBody, note } = splitFormulaNote(split.body);
      flushWith(plusBody, note, split.label);
      continue;
    }
    if (pendingPos.length) {
      out.push(...pendingPos);
      pendingPos.length = 0;
    }
    out.push(seg);
  }
  if (pendingPos.length) out.push(...pendingPos);
  return out.join("；");
}

/**
 * 展示拆表前预处理：
 * 1) 剥「用法N:」（对比课会把整段含标签的接续交给解析，否则上不了表）
 * 2) 「もしかしたら＋动词句」+ 后续词类行 + 末行「名词句＋かもしれません｜…」
 *    → 各词类都带上同一「＋接什么｜说明」
 */
export function rewriteJpVocabConnectionForTableParse(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  type Group = { bodyLines: string[] };
  const groups: Group[] = [];
  let current: Group = { bodyLines: [] };
  for (const line of lines) {
    const m = CONNECTION_USAGE_LINE_RE.exec(line);
    if (m) {
      if (current.bodyLines.length) groups.push(current);
      const rest = String(m[1] ?? "").trim();
      current = { bodyLines: rest ? [rest] : [] };
      continue;
    }
    current.bodyLines.push(line);
  }
  if (current.bodyLines.length) groups.push(current);
  if (!groups.length) return text;
  return groups
    .map((g) => expandConnectionBlockForTableParse(g.bodyLines.join("\n")))
    .filter(Boolean)
    .join("\n");
}

function eachConnectionFormulaSeg(
  raw: string | null | undefined,
  visit: (seg: string) => boolean
): boolean {
  for (const line of String(raw ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const body = line.trim().replace(CONNECTION_USAGE_TAG_PREFIX_RE, "").trim();
    if (!body) continue;
    const segs = /[；;]/.test(body)
      ? splitSemicolonOutsideParens(body)
      : [body];
    for (const seg of segs) {
      if (visit(seg)) return true;
    }
  }
  return false;
}

/** 写回拒：本语法前缀＋词类（もしかしたら＋动词句） */
export function connectionHasPrefixPlusPos(
  raw: string | null | undefined
): boolean {
  return eachConnectionFormulaSeg(raw, (seg) =>
    Boolean(looksLikeGrammarPrefixPlusPos(seg))
  );
}

/** 写回拒：单独一行/一段只有词类、没有「＋接什么」 */
export function connectionHasBarePosContinuation(
  raw: string | null | undefined
): boolean {
  return eachConnectionFormulaSeg(raw, (seg) => {
    const t = String(seg || "").trim();
    return (
      isJpVocabConnectionPosLabel(t) &&
      !/[＋+]/.test(t) &&
      !/[：:]/.test(t)
    );
  });
}
