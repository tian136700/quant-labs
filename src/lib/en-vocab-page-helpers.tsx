import {
  formatBeijingDateTime,
  formatBeijingDateTimeCompactParts,
} from "@/lib/format-datetime";
import {
  isEnVocabRoundChecked,
  type EnVocabDailyDisplayOrder,
} from "@/lib/en-vocab-daily-order";
import { applyEnVocabReview } from "@/lib/en-vocab-review";
import {
  pickRandomVocabWord,
  readStoredVocabPage,
  readStoredVocabPageSize,
  vocabWordsInOrder,
  writeStoredVocabPage,
  writeStoredVocabPageSize,
  VOCAB_SAVE_ERR,
} from "@/lib/vocab-page-shared";
import {
  EN_VOCAB_PAGE_SIZE,
  EN_VOCAB_PAGE_SIZE_OPTIONS,
  EN_VOCAB_PAGE_SIZE_STORAGE_KEY,
  EN_VOCAB_PAGE_STORAGE_KEY,
} from "@/lib/en-vocab-page-constants";
import type { EnVocabLevel, EnVocabWord } from "@/lib/types";

export { VOCAB_SAVE_ERR as EN_VOCAB_SAVE_ERR };

export function readStoredEnVocabPage(): number {
  return readStoredVocabPage(EN_VOCAB_PAGE_STORAGE_KEY);
}

export function writeStoredEnVocabPage(page: number): void {
  writeStoredVocabPage(EN_VOCAB_PAGE_STORAGE_KEY, page);
}

export function readStoredEnVocabPageSize(): number {
  return readStoredVocabPageSize(
    EN_VOCAB_PAGE_SIZE_STORAGE_KEY,
    EN_VOCAB_PAGE_SIZE_OPTIONS,
    EN_VOCAB_PAGE_SIZE
  );
}

export function writeStoredEnVocabPageSize(size: number): void {
  writeStoredVocabPageSize(EN_VOCAB_PAGE_SIZE_STORAGE_KEY, size);
}

export function enVocabCheckedInRound(
  order: EnVocabDailyDisplayOrder,
  word: EnVocabWord
): boolean {
  return isEnVocabRoundChecked(order, word.id);
}

export const enVocabWordsInOrder = vocabWordsInOrder<EnVocabWord>;
export const pickRandomEnVocabWord = pickRandomVocabWord<EnVocabWord>;

export function bumpEnVocabWordReview(
  word: EnVocabWord,
  level: EnVocabLevel,
  previousLevel?: EnVocabLevel
): EnVocabWord {
  return applyEnVocabReview(word, level, new Date(), previousLevel).word;
}

/** 管理员表「更新时间」：日期一行、时间一行（对齐新课 dt-stacked） */
export function renderEnVocabUpdatedAt(iso: string) {
  const { date, time } = formatBeijingDateTimeCompactParts(iso);
  return (
    <time
      className="jp-vocab-updated-time jp-vocab-updated-time--stacked"
      dateTime={iso}
      title={formatBeijingDateTime(iso)}
    >
      <span className="jp-vocab-updated-date">{date}</span>
      {time ? <span className="jp-vocab-updated-clock">{time}</span> : null}
    </time>
  );
}
