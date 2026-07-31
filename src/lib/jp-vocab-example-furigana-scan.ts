/**
 * 扫库：已有例句但日语行仍有未标假名的汉字（线上 batch 曾放行导致）。
 * 运维：POST fill-example-sentences mode=scan_incomplete_furigana
 */
import {
  jpVocabExampleHasInvalidFuriganaParen,
  jpVocabExampleHasUnannotatedKanji,
  parseJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";

export type JpVocabIncompleteFuriganaRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  example_sentences: string;
  example_sentences_source: string | null;
  incomplete_line_count: number;
  sample_lines: string[];
};

export async function listJpVocabWordsIncompleteExampleFurigana(
  db: D1Database
): Promise<JpVocabIncompleteFuriganaRow[]> {
  const result = await db
    .prepare(
      `SELECT id, word, kind, reading, meaning, example_sentences, example_sentences_source
       FROM jp_vocab_word
       WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''
       ORDER BY id`
    )
    .all<{
      id: number;
      word: string;
      kind: string;
      reading: string | null;
      meaning: string | null;
      example_sentences: string;
      example_sentences_source: string | null;
    }>();

  const out: JpVocabIncompleteFuriganaRow[] = [];
  for (const row of result.results ?? []) {
    const example = String(row.example_sentences ?? "");
    const badLines: string[] = [];
    for (const item of parseJpVocabExampleSentenceItems(example)) {
      const line = String(item.text || "").trim();
      if (!line) continue;
      if (
        jpVocabExampleHasUnannotatedKanji(line) ||
        jpVocabExampleHasInvalidFuriganaParen(line)
      ) {
        badLines.push(line);
      }
    }
    if (badLines.length === 0) continue;
    out.push({
      id: Number(row.id),
      word: String(row.word),
      kind: String(row.kind),
      reading: row.reading != null ? String(row.reading).trim() || null : null,
      meaning: row.meaning != null ? String(row.meaning).trim() || null : null,
      example_sentences: example,
      example_sentences_source:
        row.example_sentences_source != null
          ? String(row.example_sentences_source).trim() || null
          : null,
      incomplete_line_count: badLines.length,
      sample_lines: badLines.slice(0, 3),
    });
  }
  return out;
}
