/** 韩语发音复习会话（进度持久至手动清除，不按日归零） */

export type KoPronReviewSession = {
  catalogIds: number[];
  currentIndex: number;
};

export function createKoPronReviewSession(
  orderedCatalogIds: number[],
  startCatalogId: number
): KoPronReviewSession | null {
  if (!orderedCatalogIds.length) return null;
  const foundIndex = orderedCatalogIds.indexOf(startCatalogId);
  return {
    catalogIds: orderedCatalogIds,
    currentIndex: foundIndex >= 0 ? foundIndex : 0,
  };
}

export type KoPronReviewResume = {
  index: number;
  /** 当前列表顺序下均已复习 */
  allReviewed: boolean;
};

/** 定位第一个尚未计入复习进度的字母；若均已复习则 index 为 0 */
export function resolveKoPronReviewResumeIndex(
  orderedCatalogIds: number[],
  reviewedCatalogIds: ReadonlySet<number>
): KoPronReviewResume {
  if (!orderedCatalogIds.length) {
    return { index: 0, allReviewed: false };
  }
  const firstUnreviewed = orderedCatalogIds.findIndex(
    (id) => !reviewedCatalogIds.has(id)
  );
  if (firstUnreviewed >= 0) {
    return { index: firstUnreviewed, allReviewed: false };
  }
  return { index: 0, allReviewed: true };
}

/** 「开始复习」：从第一个未复习的字母起 */
export function resolveKoPronReviewFreshStartIndex(
  orderedCatalogIds: number[],
  reviewedCatalogIds: ReadonlySet<number>
): KoPronReviewResume {
  return resolveKoPronReviewResumeIndex(
    orderedCatalogIds,
    reviewedCatalogIds
  );
}
