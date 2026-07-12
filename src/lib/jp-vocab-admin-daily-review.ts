import { beijingDateString } from "@/lib/jp-vocab-daily-check";

export type JpVocabAdminDailyReview = {
  /** 北京时间日期 YYYY-MM-DD */
  date: string;
  /** 今日已通过「下一个」完成复习的词条数（去重） */
  count: number;
  reviewed_word_ids: number[];
};

export const JP_VOCAB_ADMIN_DAILY_REVIEW_EMPTY: JpVocabAdminDailyReview = {
  date: "",
  count: 0,
  reviewed_word_ids: [],
};

export function normalizeJpVocabAdminDailyReview(
  raw: Partial<JpVocabAdminDailyReview> | null | undefined,
  now = new Date()
): JpVocabAdminDailyReview {
  const today = beijingDateString(now);
  if (!raw?.date || raw.date !== today) {
    return { date: today, count: 0, reviewed_word_ids: [] };
  }
  const reviewed_word_ids = Array.isArray(raw.reviewed_word_ids)
    ? [...new Set(raw.reviewed_word_ids.map((id) => Number(id)).filter((id) => id > 0))]
    : [];
  return {
    date: today,
    count: reviewed_word_ids.length,
    reviewed_word_ids,
  };
}

/** 管理员今日是否已通过复习卡片「下一个」完成该词 */
export function isJpVocabAdminWordReviewedToday(
  wordId: number,
  review: JpVocabAdminDailyReview
): boolean {
  const id = Math.floor(Number(wordId));
  if (!Number.isFinite(id) || id <= 0) return false;
  return review.reviewed_word_ids.includes(id);
}

export type JpVocabAdminReviewSession = {
  wordIds: number[];
  currentIndex: number;
};

export function createJpVocabAdminReviewSession(
  orderedWordIds: number[],
  startWordId: number
): JpVocabAdminReviewSession | null {
  if (!orderedWordIds.length) return null;
  const foundIndex = orderedWordIds.indexOf(startWordId);
  return {
    wordIds: orderedWordIds,
    currentIndex: foundIndex >= 0 ? foundIndex : 0,
  };
}

export type JpVocabAdminReviewResume = {
  index: number;
  /** 当前列表顺序下今日均已复习 */
  allReviewed: boolean;
};

/** 按当前列表排序，定位第一个尚未计入今日复习的词；若均已复习则 index 为 0 */
export function resolveJpVocabAdminReviewResumeIndex(
  orderedWordIds: number[],
  reviewedWordIds: ReadonlySet<number>
): JpVocabAdminReviewResume {
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
