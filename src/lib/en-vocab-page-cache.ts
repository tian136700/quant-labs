import {
  JP_VOCAB_CACHE_KEY,
  type EnVocabApiPayload,
} from "@/lib/en-api-cache";
import { readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import { JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT } from "@/lib/en-vocab-daily-quiz-style";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import { defaultEnVocabTeacherVisibleLimit } from "@/lib/en-vocab-teacher-visible";
import type { EnVocabTeacherVisibleLimit } from "@/lib/en-vocab-teacher-visible";
import type { EnVocabRef, EnVocabWord } from "@/lib/types";

export function readEnVocabPageCache(): EnVocabApiPayload | null {
  return readClientCache<EnVocabApiPayload>(JP_VOCAB_CACHE_KEY);
}

export function persistEnVocabPageCache(
  words: EnVocabWord[],
  refs: Record<string, EnVocabRef>,
  display_order: EnVocabDailyDisplayOrder,
  shared_today_word_ids?: number[],
  teacher_visible_limit?: EnVocabTeacherVisibleLimit
) {
  const prev = readEnVocabPageCache();
  writeClientCache(JP_VOCAB_CACHE_KEY, {
    words,
    refs,
    daily_quiz_style: prev?.daily_quiz_style ?? JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
    display_order,
    shared_today_word_ids:
      shared_today_word_ids ?? prev?.shared_today_word_ids ?? [],
    teacher_visible_limit:
      teacher_visible_limit ??
      prev?.teacher_visible_limit ??
      defaultEnVocabTeacherVisibleLimit(),
  });
}
