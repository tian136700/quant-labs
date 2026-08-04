/**
 * 语法「第 N 条用法 ↔ 第 N 条例句」语义对齐（防条数对上、意思挂错）。
 * 高置信启发：用法里点名的日语形态须出现在对应例句；肯定/否定/相悖标签勿张冠李戴。
 */

import {
  parseJpVocabExampleSentenceItems,
  stripAllJpVocabParenBlocks,
} from "@/lib/jp-vocab-example-sentences";

const NUMBERED_USAGE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
/** 用法正文里引用的日语形态（「…」或（～…）） */
const CITED_FORM_CHUNK_RE =
  /[「（(]([～〜~]?[^」）)]{1,40})[」）)]/g;

const NEG_USAGE_RE =
  /否定推断|理所当然不会|不会发生|不会存在|不可能(?!性)/;
const POS_USAGE_RE =
  /肯定推断|理所当然会发生|理所当然会存在|理所当然会发生或存在/;
const CONTRAST_USAGE_RE =
  /与预期相悖|事实与预期相悖|预期落空|惊讶或怀疑|含有惊讶/;

function lemmaCoreKana(word: string): string {
  return String(word || "")
    .replace(/^[～~〜\s]+/, "")
    .replace(/[～~〜\s]+$/, "")
    .trim();
}

function parseUsageBodies(usage: string | null | undefined): string[] {
  const out: string[] = [];
  for (const line of String(usage ?? "").split(/\r?\n/)) {
    const m = NUMBERED_USAGE_RE.exec(line.trim());
    if (m) out.push(m[2].trim());
  }
  return out;
}

function plainJp(line: string): string {
  return stripAllJpVocabParenBlocks(String(line || "")).replace(/\s+/g, "");
}

/** 从用法行抽出含本词语法核的引用形态（去～） */
export function extractJpVocabCitedGrammarForms(
  usageBody: string,
  word: string
): string[] {
  const core = lemmaCoreKana(word);
  if (!core) return [];
  const coreBase = core.replace(/だ$/, "");
  const found: string[] = [];
  const body = String(usageBody || "");
  for (const m of body.matchAll(CITED_FORM_CHUNK_RE)) {
    const chunk = String(m[1] || "").trim();
    if (!chunk) continue;
    for (const part of chunk.split(/[\/／、,，]/)) {
      const form = part
        .replace(/^[～〜~\s]+/, "")
        .replace(/[～〜~\s]+$/, "")
        .trim();
      if (!form || form.length < 2) continue;
      if (form.includes(core) || (coreBase.length >= 2 && form.includes(coreBase))) {
        found.push(form);
      }
    }
  }
  return [...new Set(found)];
}

/** 用法「それで？」与例句「それで、…」：尾部语气标点不要求字面一致 */
const CITED_FORM_TRAILING_PUNCT_RE = /[？?！!。．\.、,，…⋯]+$/u;

function exampleHasForm(plain: string, form: string): boolean {
  if (!form) return true;
  if (plain.includes(form)) return true;
  const stripped = form.replace(CITED_FORM_TRAILING_PUNCT_RE, "");
  if (stripped && stripped !== form && plain.includes(stripped)) {
    return true;
  }
  // ないはずだ ↔ ないはずです
  if (form.endsWith("だ") && plain.includes(form.slice(0, -1) + "です")) {
    return true;
  }
  return false;
}

function hazudaNegInExample(plain: string): boolean {
  return /はずがない|ないはず/.test(plain);
}

function hazudaContrastInExample(plain: string): boolean {
  return /はずなのに|なのに/.test(plain);
}

function hazudaAffirmInExample(plain: string): boolean {
  return (
    /はずだ|はずです/.test(plain) &&
    !hazudaNegInExample(plain) &&
    !/はずなのに/.test(plain)
  );
}

/**
 * 校验用法点与例句按序号语义对齐。
 * @returns reason 形如 pair_semantic_mismatch:2:cited_form_missing
 */
export function validateJpVocabUsageExamplePairAlignment(input: {
  word: string;
  kind?: string;
  usage: string | null | undefined;
  example_sentences: string;
}): { ok: true } | { ok: false; reason: string } {
  if (input.kind && input.kind !== "grammar") return { ok: true };
  const usageBodies = parseUsageBodies(input.usage);
  if (usageBodies.length < 1) return { ok: true };

  const items = parseJpVocabExampleSentenceItems(
    String(input.example_sentences ?? "")
  );
  if (items.length < usageBodies.length) {
    return { ok: false, reason: "pair_semantic_mismatch:count" };
  }
  // 单用法须 3 条例句（覆盖不同接续）；多用法仍 1:1 下限
  if (usageBodies.length === 1 && items.length < 3) {
    return { ok: false, reason: "pair_semantic_mismatch:single_usage_need_three" };
  }

  const word = String(input.word || "");
  const core = lemmaCoreKana(word);
  const isHazuda = core === "はずだ" || core.startsWith("はず");

  for (let i = 0; i < usageBodies.length; i++) {
    const usageBody = usageBodies[i];
    const plain = plainJp(items[i]?.text ?? "");
    const idx = i + 1;

    const cited = extractJpVocabCitedGrammarForms(usageBody, word);
    for (const form of cited) {
      if (!exampleHasForm(plain, form)) {
        return {
          ok: false,
          reason: `pair_semantic_mismatch:${idx}:cited_form_missing`,
        };
      }
    }

    if (!isHazuda) continue;

    const negU = NEG_USAGE_RE.test(usageBody);
    const posU = POS_USAGE_RE.test(usageBody);
    const contrastU = CONTRAST_USAGE_RE.test(usageBody);

    if (negU && !posU && !hazudaNegInExample(plain)) {
      return {
        ok: false,
        reason: `pair_semantic_mismatch:${idx}:neg_usage_needs_hazuda_neg`,
      };
    }
    if (posU && !negU && !hazudaAffirmInExample(plain)) {
      return {
        ok: false,
        reason: `pair_semantic_mismatch:${idx}:pos_usage_needs_hazuda_affirm`,
      };
    }
    if (contrastU && !hazudaContrastInExample(plain) && !hazudaNegInExample(plain)) {
      return {
        ok: false,
        reason: `pair_semantic_mismatch:${idx}:contrast_usage_needs_nanoni_or_neg`,
      };
    }
  }

  return { ok: true };
}
