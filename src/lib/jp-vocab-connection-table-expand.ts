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
