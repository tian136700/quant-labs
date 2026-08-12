/** 英语例句解析 / 规范化（英文行 + 译文：中文） */

export const EN_VOCAB_EXAMPLE_GLOSS_LABEL = "译文：";

const LEADING_INDEX_RE = /^\s*\d+[.、．)\]]\s*/;
const GLOSS_LABEL_RE = /^(译文|翻譯|翻译|译|譯)\s*[:：]\s*/;
const HAN_RE = /[\u4E00-\u9FFF]/;
const LATIN_RE = /[A-Za-z]/;

export type EnVocabExampleSentenceItem = {
  text: string;
  gloss: string;
};

export function splitEnVocabExampleSentenceLines(
  raw: string | null | undefined
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(LEADING_INDEX_RE, "").trim())
    .filter(Boolean);
}

/** 去掉标签与行首 `/`／；叠「译文：」也一并剥掉 */
export function stripEnVocabExampleGlossLabel(text: string): string {
  let body = String(text ?? "").trim();
  for (let i = 0; i < 8; i++) {
    const next = body
      .replace(GLOSS_LABEL_RE, "")
      .replace(/^[\s／/]+/, "")
      .trim();
    if (next === body) break;
    body = next;
  }
  return body;
}

export function formatEnVocabExampleGlossLine(text: string): string {
  const body = stripEnVocabExampleGlossLabel(text);
  return body ? `${EN_VOCAB_EXAMPLE_GLOSS_LABEL}${body}` : "";
}

export function isEnVocabExampleEnglishLine(text: string): boolean {
  const stripped = stripEnVocabExampleGlossLabel(text);
  if (GLOSS_LABEL_RE.test(text.trim())) return false;
  // 结构化 dump（Python/JSON 列表）绝不当「英文例句」展示
  if (enVocabExampleLooksLikeStructuredDump(text)) return false;
  if (!LATIN_RE.test(stripped)) return false;
  // 纯中文行不当英语例句
  const han = (stripped.match(new RegExp(HAN_RE.source, "g")) || []).length;
  const latin = (stripped.match(new RegExp(LATIN_RE.source, "g")) || []).length;
  if (han >= 4 && latin > 0 && han >= latin) return false;
  return true;
}

/** 模型/脚本误把 JSON·Python 列表 str() 进库时的形态 */
export function enVocabExampleLooksLikeStructuredDump(
  raw: string | null | undefined
): boolean {
  const t = String(raw ?? "").trim();
  if (!t) return false;
  if (!/^\s*[\[{]/.test(t)) return false;
  if (!/['"](?:sentence|translation|text|gloss|en|zh)['"]\s*:/.test(t)) {
    return false;
  }
  // 至少像「键值对列表/对象」，避免误伤正常英文句里偶发的 [ ]
  return (
    /['"]sentence['"]\s*:/.test(t) ||
    /['"]translation['"]\s*:/.test(t) ||
    (/^\s*\[\s*\{/.test(t) && /['"]text['"]\s*:/.test(t))
  );
}

const STRUCT_PAIR_RE_SQ =
  /'(?:sentence|text|en)'\s*:\s*'((?:\\'|[^'])*)'\s*,\s*'(?:translation|gloss|zh|译文)'\s*:\s*'((?:\\'|[^'])*)'/gi;
const STRUCT_PAIR_RE_DQ =
  /"(?:sentence|text|en)"\s*:\s*"((?:\\"|[^"])*)"\s*,\s*"(?:translation|gloss|zh|译文)"\s*:\s*"((?:\\"|[^"])*)"/gi;

function unescapeStructField(s: string): string {
  return s
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\")
    .trim();
}

/**
 * 把误入库的 JSON / Python list[dict] 尽量还原成「英文\\n译文：」条目。
 * 还原失败返回 null（调用方应拒收，勿原样展示）。
 */
export function tryCoerceEnVocabExampleStructuredDump(
  raw: string | null | undefined
): EnVocabExampleSentenceItem[] | null {
  const t = String(raw ?? "").trim();
  if (!t || !enVocabExampleLooksLikeStructuredDump(t)) return null;

  const items: EnVocabExampleSentenceItem[] = [];

  // 1) 真 JSON
  try {
    const parsed = JSON.parse(t) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const text = String(
        rec.sentence ?? rec.text ?? rec.en ?? ""
      ).trim();
      const glossRaw = String(
        rec.translation ?? rec.gloss ?? rec.zh ?? ""
      ).trim();
      if (!text) continue;
      items.push({
        text,
        gloss: glossRaw ? formatEnVocabExampleGlossLine(glossRaw) : "",
      });
    }
    if (items.length) return items;
  } catch {
    /* fall through */
  }

  // 2) Python repr / 混引号：用键值正则抽
  for (const re of [STRUCT_PAIR_RE_SQ, STRUCT_PAIR_RE_DQ]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) != null) {
      const text = unescapeStructField(m[1] ?? "");
      const glossRaw = unescapeStructField(m[2] ?? "");
      if (!text) continue;
      items.push({
        text,
        gloss: glossRaw ? formatEnVocabExampleGlossLine(glossRaw) : "",
      });
    }
    if (items.length) return items;
  }

  return null;
}

/** apply / 展示前：结构化 dump → 规范正文；无法还原则返回 null */
export function shieldEnVocabExampleSentencesUploadText(
  raw: string | null | undefined
): { ok: true; text: string } | { ok: false; reason: string } {
  const t = String(raw ?? "").trim();
  if (!t) return { ok: false, reason: "empty" };
  if (!enVocabExampleLooksLikeStructuredDump(t)) {
    return { ok: true, text: t };
  }
  const coerced = tryCoerceEnVocabExampleStructuredDump(t);
  if (!coerced?.length) {
    return { ok: false, reason: "structured_dump" };
  }
  const text = serializeEnVocabExampleSentenceItems(coerced);
  if (!text.trim()) return { ok: false, reason: "structured_dump" };
  return { ok: true, text };
}

export function enVocabEnglishWordTokens(text: string): string[] {
  return String(text ?? "").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
}

/**
 * 词条是否在英文句中出现：允许常见时态/词形变化（expect→expected；get→got/getting）。
 * 语法/多词词条仍要求原文片段出现（如 Present Perfect、get out）。
 */
export function listEnVocabLemmaSurfaceForms(word: string): string[] {
  const w = word.trim().toLowerCase().replace(/^～/, "");
  if (!w) return [];
  if (/[\s-]/.test(w)) return [w];

  const forms = new Set<string>([w]);
  forms.add(`${w}s`);
  forms.add(`${w}es`);
  forms.add(`${w}ed`);
  forms.add(`${w}ing`);

  if (w.endsWith("e") && w.length > 1) {
    forms.add(`${w}d`);
    forms.add(`${w.slice(0, -1)}ing`);
  }
  if (w.endsWith("y") && w.length > 2 && !/[aeiou]/.test(w[w.length - 2] || "")) {
    forms.add(`${w.slice(0, -1)}ies`);
    forms.add(`${w.slice(0, -1)}ied`);
  }
  // 短 CVC：get → getting / got（不规则另补）
  if (w.length >= 3 && /[^aeiou][aeiou][^aeiouwx]$/.test(w)) {
    const last = w[w.length - 1]!;
    forms.add(`${w}${last}ed`);
    forms.add(`${w}${last}ing`);
  }
  if (w === "get") {
    forms.add("got");
    forms.add("gotten");
  }
  if (w === "have") {
    forms.add("has");
    forms.add("had");
    forms.add("having");
  }
  if (w === "be") {
    forms.add("am");
    forms.add("is");
    forms.add("are");
    forms.add("was");
    forms.add("were");
    forms.add("been");
    forms.add("being");
  }
  return [...forms];
}

const EN_VOCAB_INDEFINITE_SLOT_RE =
  /\b(?:somebody|someone|something|somewhere|somehow|anyone|anybody|anything|anywhere|everybody|everyone|everything|everywhere|nobody|nothing|nowhere|sb\.?|sth\.?)\b/gi;

const EN_VOCAB_LETTER_SLOT_RE = /\b[A-C]\b/g;

/**
 * 句型模板（somebody / A and B / will be doing …）是否在例句中出现。
 * 占位换成灵活匹配，避免硬要求字面 somebody。
 */
export function enVocabSlotLemmaAppearsInSentence(
  sentence: string,
  lemma: string
): boolean {
  const raw = lemma.trim();
  if (!raw) return false;
  const lower = sentence.toLowerCase();

  // 1) 字面整词（含 somebody）
  if (lower.includes(raw.toLowerCase().replace(/^～/, ""))) return true;

  // 2) 占位 → 通配：A/B/C、somebody…；doing（进行时模板）→ \w+ing
  let pattern = raw;
  pattern = pattern.replace(EN_VOCAB_INDEFINITE_SLOT_RE, "§SLOT§");
  pattern = pattern.replace(EN_VOCAB_LETTER_SLOT_RE, "§SLOT§");
  // will be doing / be doing → V-ing 槽
  pattern = pattern.replace(
    /\b((?:will\s+be|be|am|is|are|was|were)\s+)doing\b/gi,
    "$1§ING§"
  );
  pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  pattern = pattern
    .replace(/§SLOT§/g, "\\S+(?:\\s+\\S+){0,3}")
    .replace(/§ING§/g, "\\w+ing")
    .replace(/\s+/g, "\\s+");
  try {
    if (new RegExp(pattern, "i").test(sentence)) return true;
  } catch {
    /* ignore bad pattern */
  }

  // 3) 核心锚：去掉占位后剩余实词须按序出现（cater … to / both … and）
  const anchors = raw
    .replace(EN_VOCAB_INDEFINITE_SLOT_RE, " ")
    .replace(EN_VOCAB_LETTER_SLOT_RE, " ")
    .replace(/\bdoing\b/gi, " ")
    .split(/[\s/]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2 && !/^(?:to|a|an|the|of|for|in|on|at)$/.test(w));
  if (anchors.length >= 2) {
    let from = 0;
    for (const a of anchors) {
      const forms = listEnVocabLemmaSurfaceForms(a);
      let found = -1;
      for (const f of forms) {
        const re = new RegExp(
          `\\b${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i"
        );
        const m = re.exec(lower.slice(from));
        if (m && m.index != null) {
          found = from + m.index + m[0].length;
          break;
        }
      }
      if (found < 0) return false;
      from = found;
    }
    return true;
  }
  if (anchors.length === 1) {
    for (const f of listEnVocabLemmaSurfaceForms(anchors[0])) {
      const re = new RegExp(
        `\\b${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      );
      if (re.test(sentence)) return true;
    }
  }
  return false;
}

export function enVocabLemmaAppearsInSentence(
  sentence: string,
  word: string,
  kind = "word"
): boolean {
  const target = word.trim();
  if (!target) return false;
  const lower = sentence.toLowerCase();
  const bare = target.toLowerCase().replace(/^～/, "");

  if (lower.includes(bare)) return true;

  const hasSlot =
    /\b(?:somebody|someone|something|somewhere|somehow|anyone|anybody|anything|anywhere|everybody|everyone|everything|everywhere|nobody|nothing|nowhere|sb\.?|sth\.?)\b/i.test(
      target
    ) ||
    /\b[A-C]\b/.test(target) ||
    /\b(?:will\s+be|be)\s+doing\b/i.test(target);

  if (hasSlot || kind === "grammar") {
    return enVocabSlotLemmaAppearsInSentence(sentence, target);
  }

  // 语法 / 多词：须出现词条原文（可含短语 get out）
  if (/[\s-]/.test(target)) {
    return lower.includes(bare);
  }

  for (const form of listEnVocabLemmaSurfaceForms(target)) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(sentence)) return true;
  }
  return false;
}

/** 用法说明开头的单一词性标签（「[8] 名词：…」） */
const EN_VOCAB_USAGE_LEADING_POS_RE =
  /^(?:\[\d{1,2}\]\s*)?(名词|动词|形容词|副词|介词|连词|代词|数词|感叹词|限定词)/u;

const EN_VOCAB_BE_HAVE_AUX_RE =
  /\b(?:am|is|are|was|were|be|been|being|have|has|had)\b/i;

/**
 * 用法标「名词」却用 be/have + V-ed/V-ing（如 are honored）→ 错配；
 * 用法标「动词」却只有 a/an/the + 原形名词用法且无动词形态 → 错配。
 * 多词词条跳过（避免 plenty of 等误伤）。
 */
export function assessEnVocabUsagePosExampleAlignment(
  word: string,
  usagePointText: string,
  exampleEnglish: string
): { ok: true } | { ok: false; reason: "usage_pos_example_mismatch" } {
  const lemma = String(word ?? "").trim();
  if (!lemma || /[\s-]/.test(lemma)) return { ok: true };

  const usageBody = String(usagePointText ?? "")
    .trim()
    .replace(/^\d+\s*[.、．)\]]\s*/, "");
  const posMatch = EN_VOCAB_USAGE_LEADING_POS_RE.exec(usageBody);
  if (!posMatch) return { ok: true };
  const pos = posMatch[1];

  const en = String(exampleEnglish ?? "").trim();
  if (!en) return { ok: true };
  const base = lemma.toLowerCase();
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const morphForms = listEnVocabLemmaSurfaceForms(lemma).filter((f) => {
    if (f === base) return false;
    // 复数常仍是名词；只盯明显动词形态
    if (f === `${base}s` || f === `${base}es`) return false;
    if (base.endsWith("y") && f === `${base.slice(0, -1)}ies`) return false;
    return (
      f.endsWith("ed") ||
      f.endsWith("ing") ||
      f.endsWith("ied") ||
      f === "got" ||
      f === "gotten"
    );
  });

  const hasBeHavePlusMorph = morphForms.some((f) => {
    const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `${EN_VOCAB_BE_HAVE_AUX_RE.source}\\s+${escaped}\\b`,
      "i"
    ).test(en);
  });

  const hasNounCue = new RegExp(
    `\\b(?:a|an|the|my|your|his|her|our|their|this|that)\\s+${escapedBase}\\b`,
    "i"
  ).test(en);

  const hasToInfinitive = new RegExp(`\\bto\\s+${escapedBase}\\b`, "i").test(en);
  const hasBareVerbMorph = morphForms.some((f) => {
    const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(en);
  });

  if (pos === "名词" && hasBeHavePlusMorph && !hasNounCue) {
    return { ok: false, reason: "usage_pos_example_mismatch" };
  }
  if (
    pos === "动词" &&
    hasNounCue &&
    !hasBeHavePlusMorph &&
    !hasToInfinitive &&
    !hasBareVerbMorph
  ) {
    return { ok: false, reason: "usage_pos_example_mismatch" };
  }
  return { ok: true };
}

const EN_SENTENCE_FINAL_PUNCT_RE = /[.!?]["']?\s*$/;

/** 常见助动词 / be / 情态，用来区分「完整小句」与「搭配短语」 */
const EN_FINITE_HINT_RE =
  /\b(?:am|is|are|was|were|be|been|being|do|does|did|have|has|had|will|would|can|could|may|might|must|should|shall|need|needs|ought)\b/i;

/**
 * 例句必须是完整英文句，禁止只写词条本身或搭配短语却配整句中文。
 * 仅作「像不像句子」门禁；词条是否出现由 validate 另行检查。
 */
export function assessEnVocabExampleEnglishSentence(
  english: string,
  word: string,
  gloss?: string | null
): { ok: true } | { ok: false; reason: string } {
  const en = String(english ?? "").trim();
  if (!en) return { ok: false, reason: "english_not_sentence" };

  const tokens = enVocabEnglishWordTokens(en);
  const lemmaTokens = enVocabEnglishWordTokens(word);
  if (
    lemmaTokens.length > 0 &&
    tokens.length === lemmaTokens.length &&
    tokens.every(
      (t, i) => t.toLowerCase() === (lemmaTokens[i] || "").toLowerCase()
    )
  ) {
    return { ok: false, reason: "lemma_only_example" };
  }

  if (tokens.length < 3) {
    return { ok: false, reason: "english_not_sentence" };
  }

  if (!EN_SENTENCE_FINAL_PUNCT_RE.test(en)) {
    return { ok: false, reason: "missing_sentence_final_punct" };
  }

  // 「Issue a statement.」：以词条开头的短搭配且无 be/助动词 → 不是完整例句
  // 「Issue is hard today.」含 is → 放行
  const startsWithLemma =
    lemmaTokens.length > 0 &&
    tokens.length >= lemmaTokens.length &&
    tokens
      .slice(0, lemmaTokens.length)
      .every((t, i) => t.toLowerCase() === (lemmaTokens[i] || "").toLowerCase());
  if (
    startsWithLemma &&
    tokens.length <= 5 &&
    !EN_FINITE_HINT_RE.test(en)
  ) {
    return { ok: false, reason: "english_phrase_not_sentence" };
  }

  const glossBody = stripEnVocabExampleGlossLabel(String(gloss ?? ""));
  const hanCount = (glossBody.match(new RegExp(HAN_RE.source, "g")) || [])
    .length;
  // 中文已是整句，英文却只有过短短语
  if (hanCount >= 8 && tokens.length < 4) {
    return { ok: false, reason: "english_too_short_vs_gloss" };
  }

  return { ok: true };
}

export function isEnVocabExampleGlossLine(text: string): boolean {
  if (!text.trim()) return false;
  if (isEnVocabExampleEnglishLine(text)) return false;
  const body = stripEnVocabExampleGlossLabel(text);
  return HAN_RE.test(body);
}

export function parseEnVocabExampleSentenceItems(
  raw: string | null | undefined
): EnVocabExampleSentenceItem[] {
  const coerced = tryCoerceEnVocabExampleStructuredDump(raw);
  if (coerced?.length) return coerced;

  const lines = splitEnVocabExampleSentenceLines(raw);
  const items: EnVocabExampleSentenceItem[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isEnVocabExampleEnglishLine(line)) {
      i += 1;
      continue;
    }
    const text = line.trim();
    let gloss = "";
    if (i + 1 < lines.length && isEnVocabExampleGlossLine(lines[i + 1])) {
      gloss = formatEnVocabExampleGlossLine(lines[i + 1]);
      i += 2;
    } else {
      i += 1;
    }
    items.push({ text, gloss });
  }
  return items;
}

export function serializeEnVocabExampleSentenceItems(
  items: EnVocabExampleSentenceItem[]
): string {
  const lines: string[] = [];
  for (const item of items) {
    const text = item.text.trim();
    if (!text) continue;
    lines.push(text);
    const gloss = formatEnVocabExampleGlossLine(item.gloss);
    if (gloss) lines.push(gloss);
  }
  return lines.join("\n");
}

export function normalizeEnVocabExampleSentencesFormat(
  raw: string | null | undefined
): string | null {
  const items = parseEnVocabExampleSentenceItems(raw);
  if (!items.length) return null;
  return serializeEnVocabExampleSentenceItems(items);
}

export function normalizeEnVocabExampleSentencesSource(
  raw: string | null | undefined
): string | null {
  const t = String(raw ?? "").trim();
  return t || null;
}
