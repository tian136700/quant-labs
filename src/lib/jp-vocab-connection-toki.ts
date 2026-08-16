/**
 * 「～時／～とき」接续：の 只接名词；动词／一类形容词直接＋時；二类形容词＋な＋時。
 * 模型常把词条「～の＋時」抄成所有词类都「＋の時」。
 */

const TOKI_TAIL = "(?:時|とき)";

/** 名词侧：允许「＋の＋時／＋の時」 */
const NOUN_BEFORE_NO_TOKI_RE = /名词/;

/** 动词／一类形容词：禁止中间插「の」再接時 */
const VERB_IADJ_WRONG_NO_TOKI_RE = new RegExp(
  `(?:动词|一类动词|二类动词|三类动词|一类形容词)[^；;\\n]*[＋+]の${TOKI_TAIL}`
);

/** 二类形容词：禁止「な＋の時」（应为「な＋時」） */
const NA_ADJ_WRONG_NO_TOKI_RE = new RegExp(
  `(?:二类形容词|な形容词)[^；;\\n]*な\\s*[＋+]\\s*の${TOKI_TAIL}`
);

function eachFormulaSeg(
  raw: string,
  visit: (seg: string) => boolean
): boolean {
  for (const line of String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")) {
    const body = line
      .trim()
      .replace(/^用法\s*\d+\s*[:：]\s*/, "")
      .trim();
    if (!body) continue;
    const segs = /[；;]/.test(body) ? body.split(/[；;]/) : [body];
    for (const seg of segs) {
      if (visit(seg.trim())) return true;
    }
  }
  return false;
}

/** 写回拒：动词／形容词误接「の時」 */
export function connectionHasWrongTokiNoParticle(
  raw: string | null | undefined
): boolean {
  return eachFormulaSeg(String(raw ?? ""), (seg) => {
    if (NOUN_BEFORE_NO_TOKI_RE.test(seg) && !/(?:动词|形容词)/.test(seg)) {
      return false;
    }
    if (NA_ADJ_WRONG_NO_TOKI_RE.test(seg)) return true;
    if (VERB_IADJ_WRONG_NO_TOKI_RE.test(seg)) return true;
    return false;
  });
}

/**
 * 展示 / normalize：把误写的「＋の時」改成正确形态。
 * 名词段保留「の」。
 */
export function rewriteJpVocabConnectionTokiNoParticle(
  raw: string | null | undefined
): string {
  const text = String(raw ?? "");
  if (!text.trim()) return text;
  if (!/(?:時|とき)/.test(text) || !/[＋+]の/.test(text)) return text;

  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      const usagePrefix = line.match(/^(用法\s*\d+\s*[:：]\s*)/);
      const prefix = usagePrefix ? usagePrefix[1] : "";
      const body = usagePrefix ? line.slice(prefix.length) : line;
      const segs = /[；;]/.test(body)
        ? body.split(/([；;])/)
        : [body];
      const out: string[] = [];
      for (const part of segs) {
        if (part === "；" || part === ";") {
          out.push(part);
          continue;
        }
        let seg = part;
        if (NOUN_BEFORE_NO_TOKI_RE.test(seg) && !/(?:动词|形容词)/.test(seg)) {
          out.push(seg);
          continue;
        }
        // 二类：な＋の時 → な＋時
        seg = seg.replace(
          /(二类形容词|な形容词)([^；;\n]*?)な\s*[＋+]\s*の(時|とき)/g,
          "$1$2な＋$3"
        );
        // 动词／一类形容词：＋の時 → ＋時
        if (
          /(?:动词|一类动词|二类动词|三类动词|一类形容词)/.test(seg) &&
          /[＋+]の(?:時|とき)/.test(seg)
        ) {
          seg = seg.replace(/([＋+])の(時|とき)/g, "$1$2");
        }
        out.push(seg);
      }
      return prefix + out.join("");
    })
    .join("\n");
}
