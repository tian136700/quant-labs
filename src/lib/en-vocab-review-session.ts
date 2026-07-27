/** 英语复习进度（持久至用户手动清除，不按日归零） */
export type EnVocabReviewProgress = {
  /** 已完成复习的词条数（去重） */
  count: number;
  reviewed_word_ids: number[];
};

export const EN_VOCAB_REVIEW_PROGRESS_EMPTY: EnVocabReviewProgress = {
  count: 0,
  reviewed_word_ids: [],
};

export function normalizeEnVocabReviewProgress(
  raw: Partial<EnVocabReviewProgress> | null | undefined
): EnVocabReviewProgress {
  const reviewed_word_ids = Array.isArray(raw?.reviewed_word_ids)
    ? [...new Set(raw.reviewed_word_ids.map((id) => Number(id)).filter((id) => id > 0))]
    : [];
  return {
    count: reviewed_word_ids.length,
    reviewed_word_ids,
  };
}

export function isEnVocabWordReviewed(
  wordId: number,
  progress: EnVocabReviewProgress
): boolean {
  const id = Math.floor(Number(wordId));
  if (!Number.isFinite(id) || id <= 0) return false;
  return progress.reviewed_word_ids.includes(id);
}

/** 乐观：点「下一个」立刻计入本地进度（后台队列再写 D1） */
export function applyOptimisticEnVocabReviewNext(
  progress: EnVocabReviewProgress,
  wordId: number
): EnVocabReviewProgress {
  const id = Math.floor(Number(wordId));
  if (!Number.isFinite(id) || id <= 0) return progress;
  if (progress.reviewed_word_ids.includes(id)) return progress;
  return normalizeEnVocabReviewProgress({
    reviewed_word_ids: [...progress.reviewed_word_ids, id],
  });
}

export type EnVocabReviewSession = {
  wordIds: number[];
  currentIndex: number;
};

export function createEnVocabReviewSession(
  orderedWordIds: number[],
  startWordId: number
): EnVocabReviewSession | null {
  if (!orderedWordIds.length) return null;
  const foundIndex = orderedWordIds.indexOf(startWordId);
  return {
    wordIds: orderedWordIds,
    currentIndex: foundIndex >= 0 ? foundIndex : 0,
  };
}

export type EnVocabReviewResume = {
  index: number;
  /** 当前列表顺序下均已复习 */
  allReviewed: boolean;
};

/** 定位第一个尚未计入复习进度的词；若均已复习则 index 为 0 */
export function resolveEnVocabReviewResumeIndex(
  orderedWordIds: number[],
  reviewedWordIds: ReadonlySet<number>
): EnVocabReviewResume {
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
export function resolveEnVocabReviewFreshStartIndex(
  orderedWordIds: number[],
  reviewedWordIds: ReadonlySet<number>,
  isQuizzedToday: (wordId: number) => boolean
): EnVocabReviewResume {
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
  return resolveEnVocabReviewResumeIndex(orderedWordIds, reviewedWordIds);
}

export type EnVocabReviewRoundProgress = {
  /** 本轮分母：计划内今日未抽问的词条数 */
  roundTotal: number;
  /** 上述词条中已通过「下一个」计入卡片复习的数量 */
  roundReviewed: number;
  /** 仍未卡片复习的数量（roundTotal - roundReviewed） */
  roundRemaining: number;
  /** 当前词在未抽问列表中的序号（1-based）；不在列表中为 null */
  roundPosition: number | null;
  percent: number;
  complete: boolean;
};

/** 卡片「本轮复习进度」：分母 = 计划内未抽问词，不含今日已抽问 */
export function computeEnVocabReviewRoundProgress(input: {
  planWordIds: readonly number[];
  currentWordId: number;
  reviewedWordIds: ReadonlySet<number>;
  isQuizzedToday: (wordId: number) => boolean;
}): EnVocabReviewRoundProgress {
  const activeWordIds = input.planWordIds.filter((id) => !input.isQuizzedToday(id));
  const roundTotal = activeWordIds.length;
  const roundReviewed = activeWordIds.reduce(
    (count, id) => (input.reviewedWordIds.has(id) ? count + 1 : count),
    0
  );
  const roundRemaining = Math.max(0, roundTotal - roundReviewed);
  const activeIndex = activeWordIds.indexOf(input.currentWordId);
  const roundPosition = activeIndex >= 0 ? activeIndex + 1 : null;
  const percent =
    roundTotal > 0
      ? Math.min(100, Math.round((roundReviewed / roundTotal) * 100))
      : 100;
  const complete = roundTotal === 0 || roundReviewed >= roundTotal;
  return {
    roundTotal,
    roundReviewed,
    roundRemaining,
    roundPosition,
    percent,
    complete,
  };
}

export function countEnVocabReviewQuizzedInPlan(
  planWordIds: readonly number[],
  isQuizzedToday: (wordId: number) => boolean
): number {
  return planWordIds.reduce(
    (count, id) => (isQuizzedToday(id) ? count + 1 : count),
    0
  );
}
