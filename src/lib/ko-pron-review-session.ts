/** 韩语发音复习会话（进度持久至手动清除，不按日归零；出题乱序） */

import { beijingDateString } from "@/lib/jp-vocab-daily-check";

export type KoPronReviewSession = {
  catalogIds: number[];
  currentIndex: number;
};

/** 误关卡片后「继续复习」用的本机断点（队列 + 当前下标） */
export const KO_PRON_REVIEW_INTERRUPTED_SESSION_KEY =
  "ko-pron-review-interrupted-session-v1";

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
 * - 尚有未复习：只排未复习（「重新开始复习」）
 * - 全部已复习且 mode=fresh：整池重洗再刷一轮
 * - 全部已复习且 mode=resume：返回 null（「继续」应走断点存储，不走这里）
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

/** 是否还有未复习字母 */
export function koPronReviewHasUnreviewed(
  catalogIds: number[],
  reviewedCatalogIds: ReadonlySet<number>
): boolean {
  return catalogIds.some((id) => !reviewedCatalogIds.has(id));
}

function normalizeInterruptedSession(
  raw: unknown,
  poolIdSet: ReadonlySet<number>
): KoPronReviewSession | null {
  if (!raw || typeof raw !== "object") return null;
  const catalogIdsRaw = (raw as { catalogIds?: unknown }).catalogIds;
  const currentIndexRaw = (raw as { currentIndex?: unknown }).currentIndex;
  if (!Array.isArray(catalogIdsRaw)) return null;
  const catalogIds = catalogIdsRaw
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0 && poolIdSet.has(id));
  if (!catalogIds.length) return null;
  let currentIndex = Math.floor(Number(currentIndexRaw));
  if (!Number.isFinite(currentIndex) || currentIndex < 0) currentIndex = 0;
  if (currentIndex >= catalogIds.length) return null;
  return { catalogIds, currentIndex };
}

export function readKoPronReviewInterruptedSession(
  poolIds: readonly number[]
): KoPronReviewSession | null {
  if (typeof window === "undefined") return null;
  const poolIdSet = new Set(poolIds);
  if (!poolIdSet.size) return null;
  try {
    const raw = window.localStorage.getItem(
      KO_PRON_REVIEW_INTERRUPTED_SESSION_KEY
    );
    if (!raw) return null;
    return normalizeInterruptedSession(JSON.parse(raw), poolIdSet);
  } catch {
    return null;
  }
}

export function writeKoPronReviewInterruptedSession(
  session: KoPronReviewSession
): void {
  if (typeof window === "undefined") return;
  if (
    !session.catalogIds.length ||
    session.currentIndex < 0 ||
    session.currentIndex >= session.catalogIds.length
  ) {
    clearKoPronReviewInterruptedSession();
    return;
  }
  try {
    window.localStorage.setItem(
      KO_PRON_REVIEW_INTERRUPTED_SESSION_KEY,
      JSON.stringify({
        catalogIds: session.catalogIds,
        currentIndex: session.currentIndex,
      })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearKoPronReviewInterruptedSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KO_PRON_REVIEW_INTERRUPTED_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** 关卡或切下一张时：还有剩余则写入断点，否则清掉 */
export function persistKoPronReviewSessionBreakpoint(
  session: KoPronReviewSession | null
): void {
  if (!session) {
    clearKoPronReviewInterruptedSession();
    return;
  }
  if (session.currentIndex >= session.catalogIds.length) {
    clearKoPronReviewInterruptedSession();
    return;
  }
  writeKoPronReviewInterruptedSession(session);
}

/** 列表展示：今日复习次数（非当日归零） */
export function koPronCatalogTodayReviewCount(
  item: {
    today_review_count?: number | null;
    today_review_date?: string | null;
  },
  now = new Date()
): number {
  const day = beijingDateString(now);
  if ((item.today_review_date ?? "") !== day) return 0;
  return Math.max(0, Math.floor(Number(item.today_review_count ?? 0)) || 0);
}
