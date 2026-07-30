import "server-only";

import {
  parseLessonContent,
  resolveJpLessonItemKinds,
} from "@/lib/jp-lesson-shared";
import { removeJpVocabLessonWords } from "@/lib/jp-vocab-db";
import type { JpLessonRecord } from "@/lib/types";

/** 撤销「已完成」同步进抽问的词条（删课 / 改回未完成时用）。 */
export async function unsyncLessonFromVocab(
  db: D1Database,
  lesson: JpLessonRecord
): Promise<void> {
  const items = parseLessonContent(lesson.content);
  if (!items.length) return;
  const itemKinds = resolveJpLessonItemKinds(
    lesson.kind,
    items.length,
    lesson.grammar_item_count
  );
  const words: string[] = [];
  const grammars: string[] = [];
  items.forEach((word, index) => {
    if (itemKinds[index] === "grammar") grammars.push(word);
    else words.push(word);
  });
  if (words.length) {
    await removeJpVocabLessonWords(db, words, lesson.ref_key, "word");
  }
  if (grammars.length) {
    await removeJpVocabLessonWords(db, grammars, lesson.ref_key, "grammar");
  }
}
