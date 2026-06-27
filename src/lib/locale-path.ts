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

function stripZhPrefix(pathname: string): string {
  if (pathname === "/zh" || pathname === "/zh/") return "/";
  if (pathname.startsWith("/zh/")) return pathname.slice(3) || "/";
  return pathname;
}

/** 日语模块：URL 不带 /zh 前缀，语言仅存于 cookie / localStorage */
function isLocaleNeutralPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return (
    path === "/jp-lesson" ||
    path.startsWith("/jp-lesson/") ||
    path === "/jp-vocab" ||
    path.startsWith("/jp-vocab/") ||
    path === "/jp-review" ||
    path.startsWith("/jp-review/")
  );
}

/** 根据当前路径与目标语言生成 URL pathname（不含 query） */
export function localePathForPathname(pathname: string, locale: Locale): string {
  if (onStoreReviewSubdomain()) {
    return localePathForSubdomain(pathname, locale);
  }

  if (isLocaleNeutralPath(pathname)) {
    return stripZhPrefix(pathname);
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

export function adminRbacPath(locale: Locale): string {
  return locale === "zh" ? "/zh/admin/rbac" : "/admin/rbac";
}

export function adminUsersPath(locale: Locale): string {
  return locale === "zh" ? "/zh/admin/users" : "/admin/users";
}

export function adminToolCodesPath(locale: Locale): string {
  return locale === "zh" ? "/zh/admin/tool-codes" : "/admin/tool-codes";
}

export function adminJpLessonTeachersPath(locale: Locale): string {
  return locale === "zh" ? "/zh/admin/jp-lesson-teachers" : "/admin/jp-lesson-teachers";
}

export function maintenancePath(locale: Locale): string {
  return locale === "zh" ? "/zh/maintenance" : "/maintenance";
}

export function isAdminDashboardPath(pathname: string): boolean {
  return pathname === "/admin" || pathname === "/zh/admin";
}

export function isAdminTrendsPath(pathname: string): boolean {
  return pathname === "/admin/trends" || pathname === "/zh/admin/trends";
}

export function isAdminRbacPath(pathname: string): boolean {
  return pathname === "/admin/rbac" || pathname === "/zh/admin/rbac";
}

export function isAdminUsersPath(pathname: string): boolean {
  return pathname === "/admin/users" || pathname === "/zh/admin/users";
}

export function isAdminToolCodesPath(pathname: string): boolean {
  return pathname === "/admin/tool-codes" || pathname === "/zh/admin/tool-codes";
}

export function isAdminJpLessonTeachersPath(pathname: string): boolean {
  return (
    pathname === "/admin/jp-lesson-teachers" ||
    pathname === "/zh/admin/jp-lesson-teachers"
  );
}

export function isMaintenancePath(pathname: string): boolean {
  return pathname === "/maintenance" || pathname === "/zh/maintenance";
}

export function isAdminPath(pathname: string): boolean {
  return (
    isAdminDashboardPath(pathname) ||
    isAdminTrendsPath(pathname) ||
    isAdminRbacPath(pathname) ||
    isAdminUsersPath(pathname) ||
    isAdminToolCodesPath(pathname) ||
    isAdminJpLessonTeachersPath(pathname)
  );
}

export function jpReviewPath(): string {
  return "/jp-review";
}

export function isJpReviewPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/jp-review" || path.startsWith("/jp-review/");
}

export function jpVocabPath(): string {
  return "/jp-vocab";
}

export function isJpVocabPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/jp-vocab" || path.startsWith("/jp-vocab/");
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
  const path = stripZhPrefix(pathname);
  return path === "/jp-lesson" || path.startsWith("/jp-lesson/");
}

const TOOL_SLUGS = ["pdf-to-word", "pdf-to-excel", "word-to-pdf"] as const;

export function toolDotHomePath(locale: Locale): string {
  return locale === "zh" ? "/zh/tool-dot" : "/tool-dot";
}

export function toolDotAdminPath(locale: Locale): string {
  return locale === "zh" ? "/zh/tool-dot/admin" : "/tool-dot/admin";
}

export function toolDotToolPath(locale: Locale, toolId: string): string {
  return locale === "zh" ? `/zh/tool-dot/${toolId}` : `/tool-dot/${toolId}`;
}

export function isToolDotPath(pathname: string): boolean {
  return (
    pathname === "/tool-dot" ||
    pathname === "/zh/tool-dot" ||
    pathname.startsWith("/tool-dot/") ||
    pathname.startsWith("/zh/tool-dot/")
  );
}

/** 日语模块老师可访问的页面（不含 API / 静态资源） */
export function isJpVocabTeacherAllowedPath(pathname: string): boolean {
  return (
    isJpVocabPath(pathname) ||
    isJpLessonPath(pathname) ||
    isAboutPath(pathname)
  );
}
