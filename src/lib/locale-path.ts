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
    path.startsWith("/jp-review/") ||
    path === "/en-lesson" ||
    path.startsWith("/en-lesson/") ||
    path === "/en-vocab" ||
    path.startsWith("/en-vocab/") ||
    path === "/ko-pron" ||
    path.startsWith("/ko-pron/")
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

/** Worker 流量检测看板（Error 1027）；与访问日志 /admin 分开 */
export function adminWorkerTrafficPath(locale: Locale): string {
  return locale === "zh" ? "/zh/admin/worker-traffic" : "/admin/worker-traffic";
}

export function adminRbacPath(locale: Locale): string {
  return locale === "zh" ? "/zh/admin/rbac" : "/admin/rbac";
}

export function adminUsersPath(locale: Locale, userId?: number): string {
  const base = locale === "zh" ? "/zh/admin/users" : "/admin/users";
  if (userId != null && Number.isInteger(userId) && userId > 0) {
    return `${base}?user=${userId}`;
  }
  return base;
}

export function adminToolCodesPath(locale: Locale): string {
  return locale === "zh" ? "/zh/admin/tool-codes" : "/admin/tool-codes";
}

export type LessonTeacherSubject = "jp" | "en" | "ko";

export function parseLessonTeacherSubject(raw: string | null | undefined): LessonTeacherSubject {
  if (raw === "en") return "en";
  if (raw === "ko") return "ko";
  return "jp";
}

export function adminJpLessonTeachersPath(
  locale: Locale,
  teacherId?: number,
  subject: LessonTeacherSubject = "jp"
): string {
  const base = locale === "zh" ? "/zh/admin/jp-lesson-teachers" : "/admin/jp-lesson-teachers";
  const params = new URLSearchParams();
  if (subject === "en" || subject === "ko") params.set("subject", subject);
  if (teacherId != null && Number.isInteger(teacherId) && teacherId > 0) {
    params.set("teacher", String(teacherId));
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** @deprecated 已合并至 adminJpLessonTeachersPath(..., "en") */
export function adminEnLessonTeachersPath(locale: Locale, teacherId?: number): string {
  return adminJpLessonTeachersPath(locale, teacherId, "en");
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

export function isAdminWorkerTrafficPath(pathname: string): boolean {
  return (
    pathname === "/admin/worker-traffic" ||
    pathname === "/zh/admin/worker-traffic"
  );
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

export function isAdminEnLessonTeachersPath(pathname: string): boolean {
  return (
    pathname === "/admin/en-lesson-teachers" ||
    pathname === "/zh/admin/en-lesson-teachers"
  );
}

export function isMaintenancePath(pathname: string): boolean {
  return pathname === "/maintenance" || pathname === "/zh/maintenance";
}

export function isAdminPath(pathname: string): boolean {
  return (
    isAdminDashboardPath(pathname) ||
    isAdminWorkerTrafficPath(pathname) ||
    isAdminTrendsPath(pathname) ||
    isAdminRbacPath(pathname) ||
    isAdminUsersPath(pathname) ||
    isAdminToolCodesPath(pathname) ||
    isAdminJpLessonTeachersPath(pathname) ||
    isAdminEnLessonTeachersPath(pathname)
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

/** 日语抽问-管理员端（全库 / 设目标 / 导出） */
export function jpVocabAdminPath(): string {
  return "/jp-vocab/admin";
}

export function jpVocabStudyPath(): string {
  return "/jp-vocab/study";
}

export function jpVocabReviewPath(): string {
  return "/jp-vocab/review";
}

export function jpVocabCoachPath(_date?: string | null): string {
  return "/jp-vocab/coach";
}

/** 老师端首页：精确 /jp-vocab（不含 admin / study / coach / review） */
export function isJpVocabTeacherHomePath(pathname: string): boolean {
  const path = stripZhPrefix(pathname.split("?")[0] ?? pathname);
  return path === "/jp-vocab";
}

export function isJpVocabAdminPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname.split("?")[0] ?? pathname);
  return path === "/jp-vocab/admin";
}

export function isJpVocabStudyPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/jp-vocab/study";
}

export function isJpVocabReviewPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/jp-vocab/review";
}

export function isJpVocabCoachPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname.split("?")[0] ?? pathname);
  return path === "/jp-vocab/coach";
}

export function isJpVocabPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/jp-vocab" || path.startsWith("/jp-vocab/");
}

/** 教案查看页（可分享给访客的独立预览） */
export function isJpVocabRefPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path.startsWith("/jp-vocab/ref/");
}

export function jpLessonPath(): string {
  return "/jp-lesson";
}

export function jpLessonSchedulePath(): string {
  return "/jp-lesson/schedule";
}

export function isJpLessonSchedulePath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/jp-lesson/schedule";
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

/** 日语模块路径：界面固定显示中文，不受 IP / cookie 语言影响 */
export function isJpModulePath(pathname: string): boolean {
  return (
    isJpLessonPath(pathname) ||
    isJpVocabPath(pathname) ||
    isJpReviewPath(pathname) ||
    isJpVocabRefPath(pathname) ||
    isAdminJpLessonTeachersPath(pathname)
  );
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

/** 日语模块老师可访问的页面（不含 API / 静态资源；不含管理员端 / 日语复习） */
export function isJpVocabTeacherAllowedPath(pathname: string): boolean {
  if (isJpVocabAdminPath(pathname) || isJpVocabReviewPath(pathname)) {
    return false;
  }
  return (
    isJpVocabPath(pathname) ||
    isJpLessonPath(pathname) ||
    isAboutPath(pathname)
  );
}

export function enVocabPath(): string {
  return "/en-vocab";
}

/** 英语抽背-管理员端（全库 / 导出 / 删除 / 重置） */
export function enVocabAdminPath(): string {
  return "/en-vocab/admin";
}

export function enVocabStudyPath(): string {
  return "/en-vocab/study";
}

export function enVocabReviewPath(): string {
  return "/en-vocab/review";
}

/** 老师端首页：精确 /en-vocab（不含 admin / study / review / ref） */
export function isEnVocabTeacherHomePath(pathname: string): boolean {
  const path = stripZhPrefix(pathname.split("?")[0] ?? pathname);
  return path === "/en-vocab";
}

export function isEnVocabAdminPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname.split("?")[0] ?? pathname);
  return path === "/en-vocab/admin";
}

export function isEnVocabStudyPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/en-vocab/study";
}

export function isEnVocabReviewPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/en-vocab/review";
}

export function isEnVocabPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/en-vocab" || path.startsWith("/en-vocab/");
}

export function isEnVocabRefPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path.startsWith("/en-vocab/ref/");
}

/** 教案「查看」分享链接：不设登录/科目/封禁权限（含账号 disabled） */
export function isVocabRefSharePath(pathname: string): boolean {
  return isJpVocabRefPath(pathname) || isEnVocabRefPath(pathname);
}

export function enLessonPath(): string {
  return "/en-lesson";
}

export function enLessonSchedulePath(): string {
  return jpLessonSchedulePath();
}

export function isEnLessonPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/en-lesson" || path.startsWith("/en-lesson/");
}

/** 英语模块路径：界面固定显示中文，不受 IP / cookie 语言影响 */
export function isEnModulePath(pathname: string): boolean {
  return (
    isEnLessonPath(pathname) ||
    isEnVocabPath(pathname) ||
    isEnVocabRefPath(pathname) ||
    isAdminEnLessonTeachersPath(pathname)
  );
}

/** 英语模块老师可访问的页面（不含 API / 静态资源；不含管理员端 / 英语复习） */
export function isEnVocabTeacherAllowedPath(pathname: string): boolean {
  if (isEnVocabAdminPath(pathname) || isEnVocabReviewPath(pathname)) return false;
  return (
    isEnVocabPath(pathname) ||
    isEnVocabStudyPath(pathname) ||
    isEnLessonPath(pathname) ||
    isAboutPath(pathname)
  );
}

export function koPronPath(): string {
  return "/ko-pron";
}

/** 韩语发音勾选（总库；勾选后进入抽问池） */
export function koPronSelectPath(): string {
  return "/ko-pron/select";
}

/** 韩语发音抽问-管理员端（抽问池 / 设今日抽查数量） */
export function koPronAdminPath(): string {
  return "/ko-pron/admin";
}

export function koPronStudyPath(): string {
  return "/ko-pron/study";
}

/** 韩语发音复习（猜读 → 显示罗马音 + 听发音） */
export function koPronReviewPath(): string {
  return "/ko-pron/review";
}

/** 老师端首页：精确 /ko-pron（不含 admin / study / select / review） */
export function isKoPronTeacherHomePath(pathname: string): boolean {
  const path = stripZhPrefix(pathname.split("?")[0] ?? pathname);
  return path === "/ko-pron";
}

export function isKoPronSelectPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname.split("?")[0] ?? pathname);
  return path === "/ko-pron/select";
}

export function isKoPronAdminPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname.split("?")[0] ?? pathname);
  return path === "/ko-pron/admin";
}

export function isKoPronStudyPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname.split("?")[0] ?? pathname);
  return path === "/ko-pron/study";
}

export function isKoPronReviewPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname.split("?")[0] ?? pathname);
  return path === "/ko-pron/review";
}

export function isKoPronPath(pathname: string): boolean {
  const path = stripZhPrefix(pathname);
  return path === "/ko-pron" || path.startsWith("/ko-pron/");
}

/** 韩语模块路径：界面固定显示中文 */
export function isKoModulePath(pathname: string): boolean {
  return isKoPronPath(pathname);
}

/** 韩语老师可访问的页面（不含管理员端 / 勾选 / 学生端） */
export function isKoPronTeacherAllowedPath(pathname: string): boolean {
  if (
    isKoPronAdminPath(pathname) ||
    isKoPronSelectPath(pathname) ||
    isKoPronStudyPath(pathname)
  ) {
    return false;
  }
  return isKoPronPath(pathname) || isAboutPath(pathname);
}
