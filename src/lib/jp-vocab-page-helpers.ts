import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  isJpVocabRoundChecked,
  type JpVocabDailyDisplayOrder,
} from "@/lib/jp-vocab-daily-order";
import { applyJpVocabReview } from "@/lib/jp-vocab-review";
import {
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";
import {
  pickRandomVocabWord,
  readStoredVocabPage,
  vocabWordsInOrder,
  writeStoredVocabPage,
  VOCAB_SAVE_ERR,
} from "@/lib/vocab-page-shared";
import { JP_VOCAB_PAGE_STORAGE_KEY } from "@/lib/jp-vocab-page-constants";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

export { VOCAB_SAVE_ERR as JP_VOCAB_SAVE_ERR };

export function readStoredJpVocabPage(): number {
  return readStoredVocabPage(JP_VOCAB_PAGE_STORAGE_KEY);
}

export function writeStoredJpVocabPage(page: number): void {
  writeStoredVocabPage(JP_VOCAB_PAGE_STORAGE_KEY, page);
}

export function jpVocabShareProgressPercent(elapsedMs: number): number {
  return jpVocabSaveProgressPercent(elapsedMs);
}

export async function animateJpVocabShareProgressTo100(
  wordId: number,
  startedAtMs: number,
  setPercent: (wordId: number, percent: number) => void
): Promise<void> {
  await animateJpVocabSaveProgressTo100(startedAtMs, (percent) =>
    setPercent(wordId, percent)
  );
}

export function jpVocabCheckedInRound(
  order: JpVocabDailyDisplayOrder,
  word: JpVocabWord
): boolean {
  if (order.date !== beijingDateString()) return false;
  return isJpVocabRoundChecked(order, word.id);
}

export const jpVocabWordsInOrder = vocabWordsInOrder<JpVocabWord>;
export const pickRandomJpVocabWord = pickRandomVocabWord<JpVocabWord>;

export function bumpJpVocabWordReview(
  word: JpVocabWord,
  level: JpVocabLevel,
  previousLevel?: JpVocabLevel
): JpVocabWord {
  return applyJpVocabReview(word, level, new Date(), previousLevel).word;
}
