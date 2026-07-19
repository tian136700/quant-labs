/**
 * な形容词辞书形词尾「だ」处理（与读音补全 analyzeWord 一致）。
 * 词条如「重要だ」：查假名 / 造句用词干「重要」；「だ」不必出现在例句里。
 */

const HAS_KANJI = /[\u4E00-\u9FFF]/;
const DA_ADJ_SUFFIX = /^(.+)だ$/;

export type JpVocabNaAdjParts = {
  /** 原词条 */
  word: string;
  /** 造句 / 标假名用的词干（无「だ」） */
  stem: string;
  /** 是否な形容词「〜だ」 */
  hasDa: boolean;
};

/** 去掉な形容词尾「だ」得到词干；无「だ」则 stem=原词。 */
export function jpVocabNaAdjParts(word: string): JpVocabNaAdjParts {
  const w = String(word || "").trim();
  const m = DA_ADJ_SUFFIX.exec(w);
  if (m?.[1]?.trim() && HAS_KANJI.test(m[1])) {
    return { word: w, stem: m[1].trim(), hasDa: true };
  }
  return { word: w, stem: w, hasDa: false };
}

/** 读音若带尾「だ」，标在词干上时去掉（じゅうようだ → じゅうよう）。 */
export function jpVocabNaAdjReadingForStem(reading: string, hasDa: boolean): string {
  const r = String(reading || "").trim();
  if (!hasDa || !r) return r;
  if (r.endsWith("だ") && r.length > 1) return r.slice(0, -1);
  return r;
}

/** 例句「是否用到词条」时允许的表面形：全形 + 词干 + 斜杠异写。 */
export function jpVocabExampleLemmaSurfaces(word: string): string[] {
  const { word: full, stem, hasDa } = jpVocabNaAdjParts(word);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const part of full.split("/")) push(part);
  push(full);
  if (hasDa) push(stem);
  return out;
}
