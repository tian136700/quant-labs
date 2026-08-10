import type { EnVocabWord } from "@/lib/types";

/** 列表省略了 usage/例句/接序正文，但标记 present → 打开卡/弹窗须按需拉 */
export function enVocabWordNeedsContentBlobFetch(word: EnVocabWord): boolean {
  const needs =
    word.usage_present === true ||
    word.example_sentences_present === true ||
    word.connection_present === true;
  if (!needs) return false;
  return (
    !(word.usage || "").trim() &&
    !(word.example_sentences || "").trim() &&
    !(word.connection || "").trim()
  );
}

/** 单条详情 GET 后合并：补回列表省略的大字段，勿冲掉已拉备注 */
export function mergeEnVocabWordAfterContentFetch(
  base: EnVocabWord,
  fetched: EnVocabWord
): EnVocabWord {
  return {
    ...base,
    usage: fetched.usage ?? base.usage ?? null,
    usage_source: fetched.usage_source ?? base.usage_source ?? null,
    usage_present:
      Boolean((fetched.usage || "").trim()) ||
      fetched.usage_present === true ||
      base.usage_present === true,
    example_sentences:
      fetched.example_sentences ?? base.example_sentences ?? null,
    example_sentences_source:
      fetched.example_sentences_source ??
      base.example_sentences_source ??
      null,
    example_sentences_present:
      Boolean((fetched.example_sentences || "").trim()) ||
      fetched.example_sentences_present === true ||
      base.example_sentences_present === true,
    connection: fetched.connection ?? base.connection ?? null,
    connection_source:
      fetched.connection_source ?? base.connection_source ?? null,
    connection_present:
      Boolean((fetched.connection || "").trim()) ||
      fetched.connection_present === true ||
      base.connection_present === true,
    mnemonic: fetched.mnemonic ?? base.mnemonic ?? null,
    updated_at: fetched.updated_at || base.updated_at,
  };
}

/**
 * 列表/备注等局部回写时：next 若省略大字段正文（null），保留 prev 已拉到的正文。
 * 曾复发：备注 GET 完成用无 usage 的旧 base 调 onWordSaved → 冲掉刚拉到的用法 → 右侧闪两次。
 */
export function mergeEnVocabWordPreserveContentBlobs(
  prev: EnVocabWord,
  next: EnVocabWord
): EnVocabWord {
  return {
    ...prev,
    ...next,
    usage: next.usage ?? prev.usage ?? null,
    usage_source: next.usage_source ?? prev.usage_source ?? null,
    usage_present:
      next.usage_present ??
      prev.usage_present ??
      Boolean((next.usage || prev.usage || "").trim()),
    example_sentences:
      next.example_sentences ?? prev.example_sentences ?? null,
    example_sentences_source:
      next.example_sentences_source ??
      prev.example_sentences_source ??
      null,
    example_sentences_present:
      next.example_sentences_present ??
      prev.example_sentences_present ??
      Boolean(
        (next.example_sentences || prev.example_sentences || "").trim()
      ),
    connection: next.connection ?? prev.connection ?? null,
    connection_source:
      next.connection_source ?? prev.connection_source ?? null,
    connection_present:
      next.connection_present ??
      prev.connection_present ??
      Boolean((next.connection || prev.connection || "").trim()),
    mnemonic: next.mnemonic ?? prev.mnemonic ?? null,
    class_notes: next.class_notes ?? prev.class_notes ?? null,
    class_notes_present:
      next.class_notes != null
        ? Boolean(String(next.class_notes).trim())
        : (next.class_notes_present ??
          prev.class_notes_present ??
          Boolean((prev.class_notes || "").trim())),
  };
}
