/** AI Trend Digest 独立子域名，如 blog.info-quests.com */
export const TREND_BLOG_HOST =
  process.env.NEXT_PUBLIC_TREND_BLOG_HOST?.trim().toLowerCase() || "";

/** 博客子域名完整站点 URL，如 https://blog.info-quests.com */
export const TREND_BLOG_SITE_URL =
  process.env.NEXT_PUBLIC_TREND_BLOG_SITE_URL?.replace(/\/$/, "") ||
  (TREND_BLOG_HOST ? `https://${TREND_BLOG_HOST}` : "");

/** 主站 finance 域名下的静态博客路径前缀（源文件在 trend_aggregator/web/） */
export const TREND_BLOG_INTERNAL_PREFIX = "/trend-blog";

export function isTrendBlogSubdomainHost(
  host: string | null | undefined
): boolean {
  if (!TREND_BLOG_HOST || !host) return false;
  return host.split(":")[0].toLowerCase() === TREND_BLOG_HOST;
}

/** 子域名对外短 pathname → 可访问的静态博客路径 */
export function trendBlogInternalPath(pathname: string): string | null {
  const path = pathname.replace(/\/$/, "") || "/";

  if (path === "/") return `${TREND_BLOG_INTERNAL_PREFIX}/`;
  if (path === "/zh") return `${TREND_BLOG_INTERNAL_PREFIX}/zh/`;
  if (path === `/zh${TREND_BLOG_INTERNAL_PREFIX}`) {
    return `${TREND_BLOG_INTERNAL_PREFIX}/zh/`;
  }

  return null;
}

/** 博客子域名默认首页（静态文件真实路径） */
export function trendBlogSubdomainHomePath(locale: "en" | "zh" = "en"): string {
  return locale === "zh"
    ? `${TREND_BLOG_INTERNAL_PREFIX}/zh/`
    : `${TREND_BLOG_INTERNAL_PREFIX}/`;
}

/** 是否应直接交给静态资源处理（public/trend-blog） */
export function isTrendBlogStaticPath(pathname: string): boolean {
  return (
    pathname === TREND_BLOG_INTERNAL_PREFIX ||
    pathname === `${TREND_BLOG_INTERNAL_PREFIX}/` ||
    pathname.startsWith(`${TREND_BLOG_INTERNAL_PREFIX}/`)
  );
}

/** public 下 /trend-blog 路径 → 子域名对外短路径（301 整理 URL） */
export function trendBlogPublicPath(pathname: string): string | null {
  if (
    pathname === TREND_BLOG_INTERNAL_PREFIX ||
    pathname === `${TREND_BLOG_INTERNAL_PREFIX}/`
  ) {
    return "/";
  }
  if (pathname === `${TREND_BLOG_INTERNAL_PREFIX}/index.html`) return "/";
  if (
    pathname === `${TREND_BLOG_INTERNAL_PREFIX}/zh` ||
    pathname === `${TREND_BLOG_INTERNAL_PREFIX}/zh/`
  ) {
    return "/zh";
  }
  if (pathname === `${TREND_BLOG_INTERNAL_PREFIX}/zh/index.html`) return "/zh";
  if (pathname.startsWith(`${TREND_BLOG_INTERNAL_PREFIX}/`)) {
    return pathname.slice(TREND_BLOG_INTERNAL_PREFIX.length) || "/";
  }
  return null;
}
