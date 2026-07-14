import { JP_SITE_HOST } from "@/lib/jp-site-host";
import { SITE_URL } from "@/lib/site";

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** finance 主站 hostname（与 NEXT_PUBLIC_SITE_URL 一致） */
export const FINANCE_SITE_HOST =
  process.env.NEXT_PUBLIC_SITE_HOST?.trim().toLowerCase() ||
  hostFromUrl(SITE_URL) ||
  "finance.info-quests.com";

/**
 * finance / japanese 暂未对外开放：UI 固定中文，避免与 food/blog 共享语言 Cookie 来回切换。
 * food / blog 等子域名不受影响。
 */
export function isZhForcedHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.split(":")[0].toLowerCase();
  return h === FINANCE_SITE_HOST || h === JP_SITE_HOST;
}

export function clientZhForcedHost(): boolean {
  if (typeof window === "undefined") return false;
  return isZhForcedHost(window.location.hostname);
}
