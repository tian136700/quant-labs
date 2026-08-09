import "server-only";

import { sortEnVocabWords } from "@/lib/en-vocab-shared";
import type { EnVocabWord } from "@/lib/types";
import { enVocabDbState } from "./state";
import {
  ensureVocabWordSchema,
  mapRow,
  seedIfEmpty,
  WORD_SELECT_POOL,
} from "./helpers";

/** 老师可见池 / set-target / 重置 rematerialize：轻量列表，不含大字段正文 */
export async function listEnVocabWordsForPool(
  db: D1Database
): Promise<EnVocabWord[]> {
  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (enVocabDbState.devStoreEnabled) {
    return sortEnVocabWords(enVocabDbState.devWords).map((w) => ({
      ...w,
      class_notes: null,
      class_notes_present: Boolean((w.class_notes || "").trim()),
      mnemonic: null,
      example_sentences: null,
      example_sentences_source: null,
      example_sentences_present: Boolean((w.example_sentences || "").trim()),
      usage: null,
      usage_source: null,
      usage_present: Boolean((w.usage || "").trim()),
      connection: null,
      connection_source: null,
      connection_present: Boolean((w.connection || "").trim()),
      reading_source: null,
      meaning_source: null,
    }));
  }

  const result = await db
    .prepare(
      `${WORD_SELECT_POOL}
       ORDER BY cnt_weak DESC, cnt_normal DESC, word COLLATE NOCASE ASC`
    )
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}
