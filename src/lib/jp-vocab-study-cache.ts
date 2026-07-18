import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import {
  clearClientCache,
  readClientCache,
  readClientCacheAge,
  writeClientCache,
} from "@/lib/client-swr-cache";
import type { JpVocabRef, JpVocabSharedItem } from "@/lib/types";

/** v2：共享列表含 example_sentences，学生卡片可显示例句 */
export const JP_VOCAB_STUDY_CACHE_KEY = "jp-api:vocab-study:v2";

/** 本地缓存新鲜期内轮询可跳过网络（减轻 D1）；打开页面仍会后台刷新 */
export const JP_VOCAB_STUDY_REFRESH_TTL_MS = 12_000;

export type JpVocabStudyApiPayload = {
  items: JpVocabSharedItem[];
  refs: Record<string, JpVocabRef>;
  share_date: string;
  quiz_progress?: JpVocabDailyQuizProgress | null;
};

export function readJpVocabStudyCache(): JpVocabStudyApiPayload | null {
  const cached = readClientCache<JpVocabStudyApiPayload>(JP_VOCAB_STUDY_CACHE_KEY);
  if (!cached || !Array.isArray(cached.items)) return null;
  const today = beijingDateString();
  if (cached.share_date && cached.share_date !== today) {
    clearClientCache(JP_VOCAB_STUDY_CACHE_KEY);
    return null;
  }
  return cached;
}

export function readJpVocabStudyCacheAge(): number | null {
  return readClientCacheAge(JP_VOCAB_STUDY_CACHE_KEY);
}

export function persistJpVocabStudyCache(payload: JpVocabStudyApiPayload): void {
  writeClientCache(JP_VOCAB_STUDY_CACHE_KEY, {
    items: payload.items,
    refs: payload.refs ?? {},
    share_date: payload.share_date || beijingDateString(),
    quiz_progress: payload.quiz_progress ?? null,
  });
}

export function clearJpVocabStudyCache(): void {
  clearClientCache(JP_VOCAB_STUDY_CACHE_KEY);
}
