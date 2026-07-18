export type NavCategory = "teaching" | "admin" | "ai" | "data" | "system";

/**
 * Always leftmost in the top bar when present (admin「日语抽问-管理员端»).
 * Remaining slots: usage frequency; overflow →「更多」.
 */
export const PINNED_PRIMARY_NAV_ID = "jpVocabAdmin" as const;

/** Tie-breaker when visit counts are equal (not the primary sort). */
export const PRIMARY_NAV_ORDER = [
  "jpVocabAdmin",
  "jpVocab",
  "jpVocabCoach",
  "jpVocabReview",
  "enVocab",
  "jpVocabStudy",
  "admin",
  "adminUsers",
  "adminTrends",
] as const;

export const MAX_PRIMARY_NAV = 8;

export const NAV_CATEGORY_ORDER: NavCategory[] = [
  "teaching",
  "admin",
  "ai",
  "data",
  "system",
];

export const NAV_ITEM_CATEGORY: Record<string, NavCategory> = {
  jpVocab: "teaching",
  jpVocabAdmin: "teaching",
  jpVocabReview: "teaching",
  enVocab: "teaching",
  jpVocabStudy: "teaching",
  jpVocabCoach: "teaching",
  enVocabStudy: "teaching",
  jpLesson: "teaching",
  adminJpLessonTeachers: "teaching",
  enLesson: "teaching",
  admin: "admin",
  adminUsers: "admin",
  adminRbac: "admin",
  adminTrends: "ai",
  adminToolCodes: "ai",
  compare: "data",
  teacherReview: "data",
  storeReview: "data",
  storeReviewPlaza: "data",
  jpLessonSchedule: "system",
  about: "system",
};

export function navItemCategory(id: string): NavCategory {
  return NAV_ITEM_CATEGORY[id] ?? "system";
}
