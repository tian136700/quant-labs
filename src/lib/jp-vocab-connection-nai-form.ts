/**
 * ない形接续表：一类用「う段→あ段」通用规则一行 + 特殊例外；
 * 禁止把く/む/ぬ…每个词尾各占一行（卡片会被一类占满）。
 */

/** Prompt / 标本：ない形接续表（通用一类 + 特殊 + 二类 + 三类） */
export const JP_VOCAB_NAI_FORM_CONNECTION_EXAMPLE =
  "一类动词词尾う段变あ段＋ない｜如「書く→書かない」「飲む→飲まない」（「う」尾变「わ」如「買う→買わない」）；一类动词「ある」换成「ない」＋ない｜存在动词特殊；二类动词去掉「る」加「ない」＋ない｜如「食べる→食べない」；三类动词「する」换成「しない」＋しない｜如「勉強する→勉強しない」；三类动词「くる」换成「こない」＋こない｜如「来る→来ない」";

/** 一类按词尾拆开的「去掉「X」加「Yない」」行（不含「ある」等特殊） */
const TYPE1_NAI_PER_ENDING_SEG_RE =
  /^一类动词去掉「[^」]+」加「[^」]*ない」＋[^｜;；]+(?:｜[^;；]*)?$/;

/** 一类特殊（ある 等） */
const TYPE1_NAI_SPECIAL_SEG_RE =
  /^一类动词(?:特殊)?[「『]?ある|^一类动词「ある」|^一类动词换成「ない」|^一类动词特殊/;

const TYPE1_NAI_GENERAL_ALREADY_RE =
  /一类动词[^;；]*(?:う段变あ段|词尾う段|う段改あ段|う段改为あ段)/;

/**
 * 若ない形一类被拆成 ≥3 个「去掉…加…ない」词尾行，合并成：
 * 通用规则一行 + 保留特殊/二类/三类。
 */
export function collapseJpVocabNaiFormType1PerEndingRows(
  raw: string
): string {
  const text = String(raw ?? "").trim();
  if (!text) return text;
  if (TYPE1_NAI_GENERAL_ALREADY_RE.test(text)) return text;

  // 只处理明显的「＋ない／わない／…ない」变形表，避免误伤其它语法
  if (!/[＋+][^;；\n]*ない/.test(text) && !/加「[^」]*ない」/.test(text)) {
    return text;
  }

  const parts = text
    .split(/[；;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 4) return text;

  const perEnding: string[] = [];
  const specials: string[] = [];
  const rest: string[] = [];

  for (const part of parts) {
    if (TYPE1_NAI_SPECIAL_SEG_RE.test(part) || /存在动词特殊/.test(part)) {
      specials.push(part);
      continue;
    }
    if (TYPE1_NAI_PER_ENDING_SEG_RE.test(part)) {
      perEnding.push(part);
      continue;
    }
    rest.push(part);
  }

  // 至少 3 个词尾行才合并（避免误伤只写了 1～2 个例尾的合法短表）
  if (perEnding.length < 3) return text;

  const general =
    "一类动词词尾う段变あ段＋ない｜如「書く→書かない」「飲む→飲まない」（「う」尾变「わ」如「買う→買わない」）";

  const specialOrDefault =
    specials.length > 0
      ? specials
      : ["一类动词「ある」换成「ない」＋ない｜存在动词特殊"];

  return [general, ...specialOrDefault, ...rest].join("；");
}

/** 一类词尾拆行数量（normalize 前）；≥3 视为应合并的脏表 */
export function countJpVocabNaiFormType1PerEndingRows(raw: string): number {
  const text = String(raw ?? "").trim();
  if (!text) return 0;
  return text
    .split(/[；;]/)
    .map((p) => p.trim())
    .filter((p) => TYPE1_NAI_PER_ENDING_SEG_RE.test(p)).length;
}
