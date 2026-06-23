import type { Locale } from "@/i18n/messages";
import { isStoreReviewSubdomainHost } from "@/lib/store-review-host";

function onStoreReviewSubdomain(): boolean {
  if (typeof window === "undefined") return false;
  return isStoreReviewSubdomainHost(window.location.hostname);
}

function localePathForSubdomain(pathname: string, locale: Locale): string {
  const isPlaza =
    pathname === "/plaza" ||
    pathname === "/zh/plaza" ||
    pathname === "/store-review/plaza" ||
    pathname === "/zh/store-review/plaza";

  if (locale === "zh") {
    return isPlaza ? "/zh/plaza" : "/zh";
  }
  return isPlaza ? "/plaza" : "/";
}

/** 根据当前路径与目标语言生成 URL pathname（不含 query） */
export function localePathForPathname(pathname: string, locale: Locale): string {
  if (onStoreReviewSubdomain()) {
    return localePathForSubdomain(pathname, locale);
  }

  if (locale === "zh") {
    if (pathname === "/" || pathname === "") return "/zh";
    if (pathname === "/zh" || pathname.startsWith("/zh/")) return pathname;
    return `/zh${pathname}`;
  }

  if (pathname === "/zh" || pathname === "/zh/") return "/";
  if (pathname.startsWith("/zh/")) return pathname.slice(3) || "/";
  return pathname;
}

export function localeHref(locale: Locale): string {
  if (typeof window === "undefined") return "/";
  const url = new URL(window.location.href);
  url.pathname = localePathForPathname(url.pathname, locale);
  return url.pathname + url.search;
}

export function comparePath(locale: Locale): string {
  return locale === "zh" ? "/zh" : "/";
}

export function teacherReviewNavPath(locale: Locale): string {
  return locale === "zh" ? "/zh/english-teacher-review" : "/english-teacher-review";
}

export function storeReviewPath(locale: Locale): string {
  if (onStoreReviewSubdomain()) {
    return locale === "zh" ? "/zh" : "/";
  }
  return locale === "zh" ? "/zh/store-review" : "/store-review";
}

export function storeReviewPlazaPath(locale: Locale): string {
  if (onStoreReviewSubdomain()) {
    return locale === "zh" ? "/zh/plaza" : "/plaza";
  }
  return locale === "zh" ? "/zh/store-review/plaza" : "/store-review/plaza";
}

export function isComparePath(pathname: string): boolean {
  if (onStoreReviewSubdomain()) return false;
  return pathname === "/" || pathname === "/zh";
}

export function isTeacherReviewPath(pathname: string): boolean {
  return (
    pathname === "/english-teacher-review" ||
    pathname === "/zh/english-teacher-review"
  );
}

export function isStoreReviewHomePath(pathname: string): boolean {
  if (onStoreReviewSubdomain()) {
    return pathname === "/" || pathname === "/zh";
  }
  return pathname === "/store-review" || pathname === "/zh/store-review";
}

export function isStoreReviewPlazaPath(pathname: string): boolean {
  if (onStoreReviewSubdomain()) {
    return pathname === "/plaza" || pathname === "/zh/plaza";
  }
  return pathname === "/store-review/plaza" || pathname === "/zh/store-review/plaza";
}

export function isStoreReviewPath(pathname: string): boolean {
  return isStoreReviewHomePath(pathname) || isStoreReviewPlazaPath(pathname);
}

export function aboutPath(locale: Locale): string {
  return locale === "zh" ? "/zh/about" : "/about";
}

export function isAboutPath(pathname: string): boolean {
  return pathname === "/about" || pathname === "/zh/about";
}

export function adminPath(locale: Locale): string {
  return locale === "zh" ? "/zh/admin" : "/admin";
}

export function adminTrendsPath(locale: Locale): string {
  return locale === "zh" ? "/zh/admin/trends" : "/admin/trends";
}

export function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname === "/zh/admin" ||
    pathname === "/admin/trends" ||
    pathname === "/zh/admin/trends"
  );
}

export function jpReviewPath(): string {
  return "/jp-review";
}

export function isJpReviewPath(pathname: string): boolean {
  return pathname === "/jp-review";
}

export function jpVocabPath(): string {
  return "/jp-vocab";
}

export function isJpVocabPath(pathname: string): boolean {
  return pathname === "/jp-vocab";
}

export function jpLessonPath(): string {
  return "/jp-lesson";
}

export function trendBlogPath(locale: Locale): string {
  return locale === "zh" ? "/zh/trend-blog" : "/trend-blog";
}

export function isTrendBlogPath(pathname: string): boolean {
  return (
    pathname === "/trend-blog" ||
    pathname.startsWith("/trend-blog/") ||
    pathname === "/zh/trend-blog" ||
    pathname.startsWith("/zh/trend-blog/")
  );
}

export function isJpLessonPath(pathname: string): boolean {
  return pathname === "/jp-lesson" || pathname.startsWith("/jp-lesson/");
}

/** 日语模块老师可访问的页面（不含 API / 静态资源） */
export function isJpVocabTeacherAllowedPath(pathname: string): boolean {
  return (
    isJpVocabPath(pathname) ||
    isJpLessonPath(pathname) ||
    isAboutPath(pathname)
  );
}
