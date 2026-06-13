import type { Locale } from "@/i18n/messages";
import { SITE_URL } from "@/lib/site";
import { STORE_REVIEW_SITE_URL } from "@/lib/store-review-host";
import {
  aboutPath,
  adminPath,
  comparePath,
  storeReviewPath,
  storeReviewPlazaPath,
  teacherReviewNavPath,
} from "@/lib/locale-path";

export type NavTarget =
  | "compare"
  | "teacherReview"
  | "admin"
  | "storeReview"
  | "storeReviewPlaza"
  | "about";

function storeReviewBaseUrl(): string {
  return STORE_REVIEW_SITE_URL || SITE_URL;
}

function isStoreReviewTarget(target: NavTarget): boolean {
  return target === "storeReview" || target === "storeReviewPlaza";
}

/** 主站 finance 域名下的 pathname */
function mainSitePath(target: NavTarget, locale: Locale): string {
  switch (target) {
    case "compare":
      return locale === "zh" ? "/zh" : "/";
    case "teacherReview":
      return locale === "zh" ? "/zh/english-teacher-review" : "/english-teacher-review";
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
 * 管理员在 finance / food 之间切换时始终跳到对应子域名的正确 URL。
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
    return `${storeReviewBaseUrl()}${foodSubdomainPath(target, locale)}`;
  }

  return `${SITE_URL}${mainSitePath(target, locale)}`;
}
