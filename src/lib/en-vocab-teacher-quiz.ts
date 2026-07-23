import type { EnVocabWord } from "@/lib/types";

/** 英语抽问会话（管理员预览用单条；日后老师抽问可复用） */
export type EnVocabTeacherQuizSession = {
  mode: "sequential" | "random";
  wordIds: number[];
  currentIndex: number;
};

/** 备注 ≤ 此字数时抽查弹窗内直接展示 */
export const EN_VOCAB_TEACHER_QUIZ_NOTES_INLINE_MAX = 4000;

export function enVocabTeacherQuizNotesInline(
  notes: string | null | undefined
): boolean {
  return (notes || "").trim().length <= EN_VOCAB_TEACHER_QUIZ_NOTES_INLINE_MAX;
}

/** 备注 GET 后合并，避免冲掉例句等列表已有字段 */
export function mergeEnVocabWordAfterClassNotesFetch(
  base: EnVocabWord,
  fetched: EnVocabWord
): EnVocabWord {
  return {
    ...base,
    ...fetched,
    example_sentences:
      fetched.example_sentences ?? base.example_sentences ?? null,
    example_sentences_source:
      fetched.example_sentences_source ??
      base.example_sentences_source ??
      null,
    meaning_source: fetched.meaning_source ?? base.meaning_source ?? null,
    reading_source: fetched.reading_source ?? base.reading_source ?? null,
    class_notes_present:
      Boolean((fetched.class_notes || "").trim()) ||
      fetched.class_notes_present === true,
  };
}
