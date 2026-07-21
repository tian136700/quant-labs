import {
  JP_VOCAB_CACHE_KEY,
  type JpVocabApiPayload,
} from "@/lib/jp-api-cache";
import { JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT } from "@/lib/jp-vocab-daily-quiz-style";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  normalizeJpVocabQuizTimeWeight,
} from "@/lib/jp-vocab-quiz-score";
import {
  normalizeJpVocabTeacherVisibleLimit,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import type { JpVocabRef, JpVocabWord } from "@/lib/types";

export function readJpVocabPageCache(): JpVocabApiPayload | null {
  return readClientCache<JpVocabApiPayload>(JP_VOCAB_CACHE_KEY);
}

export function persistJpVocabPageCache(
  words: JpVocabWord[],
  refs: Record<string, JpVocabRef>,
  display_order: JpVocabDailyDisplayOrder,
  shared_today_word_ids?: number[],
  teacher_visible_limit?: JpVocabTeacherVisibleLimit,
  quiz_time_weight?: number
) {
  const prev = readJpVocabPageCache();
  writeClientCache(JP_VOCAB_CACHE_KEY, {
    words,
    refs,
    daily_quiz_style: prev?.daily_quiz_style ?? JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
    quiz_time_weight: normalizeJpVocabQuizTimeWeight(
      quiz_time_weight ??
        prev?.quiz_time_weight ??
        JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT
    ),
    display_order,
    shared_today_word_ids:
      shared_today_word_ids ?? prev?.shared_today_word_ids ?? [],
    teacher_visible_limit:
      teacher_visible_limit ??
      prev?.teacher_visible_limit ??
      normalizeJpVocabTeacherVisibleLimit(null),
  });
}
