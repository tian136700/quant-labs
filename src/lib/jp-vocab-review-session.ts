/** 日语复习进度（持久至用户手动清除，不按日归零） */
export type JpVocabReviewProgress = {
  /** 已完成复习的词条数（去重） */
  count: number;
  reviewed_word_ids: number[];
};

export const JP_VOCAB_REVIEW_PROGRESS_EMPTY: JpVocabReviewProgress = {
  count: 0,
  reviewed_word_ids: [],
};

export function normalizeJpVocabReviewProgress(
  raw: Partial<JpVocabReviewProgress> | null | undefined
): JpVocabReviewProgress {
  const reviewed_word_ids = Array.isArray(raw?.reviewed_word_ids)
    ? [...new Set(raw.reviewed_word_ids.map((id) => Number(id)).filter((id) => id > 0))]
    : [];
  return {
    count: reviewed_word_ids.length,
    reviewed_word_ids,
  };
}

export function isJpVocabWordReviewed(
  wordId: number,
  progress: JpVocabReviewProgress
): boolean {
  const id = Math.floor(Number(wordId));
  if (!Number.isFinite(id) || id <= 0) return false;
  return progress.reviewed_word_ids.includes(id);
}

export type JpVocabReviewSession = {
  wordIds: number[];
  currentIndex: number;
};

export function createJpVocabReviewSession(
  orderedWordIds: number[],
  startWordId: number
): JpVocabReviewSession | null {
  if (!orderedWordIds.length) return null;
  const foundIndex = orderedWordIds.indexOf(startWordId);
  return {
    wordIds: orderedWordIds,
    currentIndex: foundIndex >= 0 ? foundIndex : 0,
  };
}

export type JpVocabReviewResume = {
  index: number;
  /** 当前列表顺序下均已复习 */
  allReviewed: boolean;
};

/** 定位第一个尚未计入复习进度的词；若均已复习则 index 为 0 */
export function resolveJpVocabReviewResumeIndex(
  orderedWordIds: number[],
  reviewedWordIds: ReadonlySet<number>
): JpVocabReviewResume {
  if (!orderedWordIds.length) {
    return { index: 0, allReviewed: false };
  }
  const firstUnreviewed = orderedWordIds.findIndex(
    (id) => !reviewedWordIds.has(id)
  );
  if (firstUnreviewed >= 0) {
    return { index: firstUnreviewed, allReviewed: false };
  }
  return { index: 0, allReviewed: true };
}

/** 「开始复习」：优先从未抽问且未卡片复习的词起；均已抽问则退到第一个未抽问 */
export function resolveJpVocabReviewFreshStartIndex(
  orderedWordIds: number[],
  reviewedWordIds: ReadonlySet<number>,
  isQuizzedToday: (wordId: number) => boolean
): JpVocabReviewResume {
  if (!orderedWordIds.length) {
    return { index: 0, allReviewed: false };
  }
  const firstPending = orderedWordIds.findIndex(
    (id) => !reviewedWordIds.has(id) && !isQuizzedToday(id)
  );
  if (firstPending >= 0) {
    return { index: firstPending, allReviewed: false };
  }
  const firstUnquizzed = orderedWordIds.findIndex((id) => !isQuizzedToday(id));
  if (firstUnquizzed >= 0) {
    return { index: firstUnquizzed, allReviewed: false };
  }
  return resolveJpVocabReviewResumeIndex(orderedWordIds, reviewedWordIds);
}
