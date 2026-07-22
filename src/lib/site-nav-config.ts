export type NavCategory = "jp" | "en" | "ko" | "admin" | "ai" | "data" | "system";

export type NavLangGroupId = "langJp" | "langEn" | "langKo";

export type NavLangGroupDef = {
  id: NavLangGroupId;
  /** Message key under nav.* for the top-level label */
  labelKey: "langJp" | "langEn" | "langKo";
  /** Drawer category for leaf items in this group */
  category: "jp" | "en" | "ko";
  /** Child leaf ids in display order within the submenu */
  childIds: readonly string[];
};

/**
 * Language groups for top-bar secondary menus.
 * Leaf visibility still comes from useSiteNavItems (RBAC); grouping is display-only.
 */
export const NAV_LANG_GROUPS: readonly NavLangGroupDef[] = [
  {
    id: "langJp",
    labelKey: "langJp",
    category: "jp",
    childIds: [
      "jpVocabAdmin",
      "jpVocab",
      "jpVocabCoach",
      "jpVocabReview",
      "jpVocabStudy",
      "jpLesson",
      "jpLessonSchedule",
      "adminJpLessonTeachers",
    ],
  },
  {
    id: "langEn",
    labelKey: "langEn",
    category: "en",
    childIds: ["enVocabAdmin", "enVocab", "enVocabStudy", "enLesson"],
  },
  {
    id: "langKo",
    labelKey: "langKo",
    category: "ko",
    childIds: [
      "koPronSelect",
      "koPronReview",
      "koPronAdmin",
      "koPron",
      "koPronStudy",
    ],
  },
] as const;

/** Leaf id → language group (for drawer / grouping). */
export const NAV_LEAF_LANG_GROUP: Record<string, NavLangGroupId> = (() => {
  const map: Record<string, NavLangGroupId> = {};
  for (const g of NAV_LANG_GROUPS) {
    for (const id of g.childIds) map[id] = g.id;
  }
  return map;
})();

/**
 * Always leftmost in the top bar when present（「日语」语言组）.
 * Remaining slots: usage frequency; overflow →「更多」.
 */
export const PINNED_PRIMARY_NAV_ID = "langJp" as const;

/** Tie-breaker when visit counts are equal (not the primary sort). Group + non-lang leaves. */
export const PRIMARY_NAV_ORDER = [
  "langJp",
  "langEn",
  "langKo",
  "admin",
  "adminUsers",
  "adminTrends",
  "adminRbac",
  "adminToolCodes",
  "compare",
  "teacherReview",
  "storeReview",
  "storeReviewPlaza",
  "about",
] as const;

export const MAX_PRIMARY_NAV = 8;

export const NAV_CATEGORY_ORDER: NavCategory[] = [
  "jp",
  "en",
  "ko",
  "admin",
  "ai",
  "data",
  "system",
];

export const NAV_ITEM_CATEGORY: Record<string, NavCategory> = {
  jpVocab: "jp",
  jpVocabAdmin: "jp",
  jpVocabReview: "jp",
  jpVocabStudy: "jp",
  jpVocabCoach: "jp",
  jpLesson: "jp",
  jpLessonSchedule: "jp",
  adminJpLessonTeachers: "jp",
  enVocab: "en",
  enVocabAdmin: "en",
  enVocabStudy: "en",
  enLesson: "en",
  koPron: "ko",
  koPronAdmin: "ko",
  koPronSelect: "ko",
  koPronReview: "ko",
  koPronStudy: "ko",
  admin: "admin",
  adminUsers: "admin",
  adminRbac: "admin",
  adminTrends: "ai",
  adminToolCodes: "ai",
  compare: "data",
  teacherReview: "data",
  storeReview: "data",
  storeReviewPlaza: "data",
  about: "system",
};

export function navItemCategory(id: string): NavCategory {
  return NAV_ITEM_CATEGORY[id] ?? "system";
}
