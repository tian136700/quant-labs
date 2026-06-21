import type { Locale } from "@/i18n/messages";
import { SITE_URL } from "@/lib/site";
import {
  STORE_REVIEW_HOST,
  STORE_REVIEW_SITE_URL,
} from "@/lib/store-review-host";
import {
  aboutPath,
  adminPath,
  comparePath,
  jpReviewPath,
  jpLessonPath,
  jpVocabPath,
  storeReviewPath,
  storeReviewPlazaPath,
  teacherReviewNavPath,
} from "@/lib/locale-path";

export type NavTarget =
  | "compare"
  | "teacherReview"
  | "jpReview"
  | "jpLesson"
  | "jpVocab"
  | "admin"
  | "storeReview"
  | "storeReviewPlaza"
  | "about";

function isStoreReviewTarget(target: NavTarget): boolean {
  return target === "storeReview" || target === "storeReviewPlaza";
}

/** food 子域名完整 URL；未配置时返回空字符串（不可回退到 finance 根路径） */
function storeReviewBaseUrl(): string {
  if (STORE_REVIEW_SITE_URL) return STORE_REVIEW_SITE_URL;
  if (STORE_REVIEW_HOST) return `https://${STORE_REVIEW_HOST}`;
  return "";
}

/** 主站 finance 域名下的 pathname */
function mainSitePath(target: NavTarget, locale: Locale): string {
  switch (target) {
    case "compare":
      return locale === "zh" ? "/zh" : "/";
    case "teacherReview":
      return locale === "zh" ? "/zh/english-teacher-review" : "/english-teacher-review";
    case "jpReview":
      return "/jp-review";
    case "jpLesson":
      return "/jp-lesson";
    case "jpVocab":
      return "/jp-vocab";
    case "admin":
      return locale === "zh" ? "/zh/admin" : "/admin";
    case "storeReview":
      return locale === "zh" ? "/zh/store-review" : "/store-review";
    case "storeReviewPlaza":
      return locale === "zh" ? "/zh/store-review/plaza" : "/store-review/plaza";
    case "about":
      return locale === "zh" ? "/zh/about" : "/about";
  }
}

/** food 子域名对外短 pathname */
function foodSubdomainPath(target: NavTarget, locale: Locale): string {
  switch (target) {
    case "storeReview":
      return locale === "zh" ? "/zh" : "/";
    case "storeReviewPlaza":
      return locale === "zh" ? "/zh/plaza" : "/plaza";
    default:
      return mainSitePath(target, locale);
  }
}

function relativePath(target: NavTarget, locale: Locale): string {
  switch (target) {
    case "compare":
      return comparePath(locale);
    case "teacherReview":
      return teacherReviewNavPath(locale);
    case "jpReview":
      return jpReviewPath();
    case "jpLesson":
      return jpLessonPath();
    case "jpVocab":
      return jpVocabPath();
    case "admin":
      return adminPath(locale);
    case "storeReview":
      return storeReviewPath(locale);
    case "storeReviewPlaza":
      return storeReviewPlazaPath(locale);
    case "about":
      return aboutPath(locale);
  }
}

/**
 * 导航链接：普通用户沿用当前域名相对路径；
 * 管理员在 finance / food 之间切换时跳到对应子域名的正确 URL。
 * finance 上的商店评价使用 /store-review（由 middleware 整理到 food 子域名），
 * 避免误链到 finance 根路径（定投对比页）。
 */
export function navHref(
  target: NavTarget,
  locale: Locale,
  opts: { onSubdomain: boolean; isAdmin: boolean }
): string {
  if (!opts.isAdmin) {
    return relativePath(target, locale);
  }

  if (isStoreReviewTarget(target)) {
    if (opts.onSubdomain) {
      return foodSubdomainPath(target, locale);
    }
    const foodBase = storeReviewBaseUrl();
    if (foodBase) {
      return `${foodBase}${foodSubdomainPath(target, locale)}`;
    }
    return mainSitePath(target, locale);
  }

  if (opts.onSubdomain) {
    return `${SITE_URL}${mainSitePath(target, locale)}`;
  }

  return mainSitePath(target, locale);
}
