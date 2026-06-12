import type { Locale } from "@/i18n/messages";

/** 根据当前路径与目标语言生成 URL pathname（不含 query） */
export function localePathForPathname(pathname: string, locale: Locale): string {
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

export function isComparePath(pathname: string): boolean {
  return pathname === "/" || pathname === "/zh";
}

export function isTeacherReviewPath(pathname: string): boolean {
  return (
    pathname === "/english-teacher-review" ||
    pathname === "/zh/english-teacher-review"
  );
}
