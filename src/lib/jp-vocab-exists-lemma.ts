import "server-only";

import { incompleteJpLessonHasWordLemma } from "@/lib/jp-lesson-incomplete-word-lemmas";
import { existsJpVocabWordByLemma } from "@/lib/jp-vocab-db";
import type { JpVocabKind } from "@/lib/types";

/**
 * 外部比对用存在性：词库 +（单词时）日语新课「学习中/未完成」单词。
 * 与 GET /api/jp-vocab/download-all 去重集合一致；语法不合并新课。
 */
export async function existsJpVocabLemmaForExternalCompare(
  db: D1Database,
  word: string,
  kind?: JpVocabKind
): Promise<boolean> {
  if (await existsJpVocabWordByLemma(db, word, kind)) return true;
  if (kind === "grammar") return false;
  return incompleteJpLessonHasWordLemma(db, word);
}
