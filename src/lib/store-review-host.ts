/** 外卖平台独立子域名，如 food.info-quests.com（部署时在 wrangler / .env 配置） */
export const STORE_REVIEW_HOST =
  process.env.NEXT_PUBLIC_STORE_REVIEW_HOST?.trim().toLowerCase() || "";

/** 外卖子域名完整站点 URL，如 https://food.info-quests.com */
export const STORE_REVIEW_SITE_URL =
  process.env.NEXT_PUBLIC_STORE_REVIEW_SITE_URL?.replace(/\/$/, "") ||
  (STORE_REVIEW_HOST ? `https://${STORE_REVIEW_HOST}` : "");

export function isStoreReviewSubdomainHost(host: string | null | undefined): boolean {
  if (!STORE_REVIEW_HOST || !host) return false;
  return host.split(":")[0].toLowerCase() === STORE_REVIEW_HOST;
}

/** 子域名对外路径 → 应用内真实路径 */
export function storeReviewInternalPath(pathname: string): string | null {
  const path = pathname.replace(/\/$/, "") || "/";

  if (path === "/") return "/store-review";
  if (path === "/zh") return "/zh/store-review";
  if (path === "/plaza") return "/store-review/plaza";
  if (path === "/zh/plaza") return "/zh/store-review/plaza";

  return null;
}

/** 应用内 /store-review 路径 → 子域名对外短路径（用于 301 整理 URL） */
export function storeReviewPublicPath(pathname: string): string | null {
  if (pathname === "/store-review") return "/";
  if (pathname === "/zh/store-review") return "/zh";
  if (pathname === "/store-review/plaza") return "/plaza";
  if (pathname === "/zh/store-review/plaza") return "/zh/plaza";
  return null;
}
