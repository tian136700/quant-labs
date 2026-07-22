/** 韩语发音复习会话（进度持久至手动清除，不按日归零；出题乱序） */

export type KoPronReviewSession = {
  catalogIds: number[];
  currentIndex: number;
};

function shuffleIds(ids: number[]): number[] {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/**
 * 组建复习队列：未复习字母 Fisher–Yates 乱序（避免按表序背位置）。
 * - 尚有未复习：只排未复习（「开始复习」/「继续复习」同）
 * - 全部已复习且 mode=fresh：整池重洗再刷一轮
 * - 全部已复习且 mode=resume：返回 null
 */
export function buildKoPronReviewSession(
  catalogIds: number[],
  reviewedCatalogIds: ReadonlySet<number>,
  mode: "fresh" | "resume"
): KoPronReviewSession | null {
  if (!catalogIds.length) return null;
  const unreviewed = catalogIds.filter((id) => !reviewedCatalogIds.has(id));
  if (unreviewed.length === 0) {
    if (mode === "resume") return null;
    return { catalogIds: shuffleIds(catalogIds), currentIndex: 0 };
  }
  return { catalogIds: shuffleIds(unreviewed), currentIndex: 0 };
}

export type KoPronReviewResume = {
  index: number;
  /** 池内均已复习 */
  allReviewed: boolean;
};

/** 是否还有未复习字母（「继续复习」按钮） */
export function koPronReviewHasUnreviewed(
  catalogIds: number[],
  reviewedCatalogIds: ReadonlySet<number>
): boolean {
  return catalogIds.some((id) => !reviewedCatalogIds.has(id));
}
