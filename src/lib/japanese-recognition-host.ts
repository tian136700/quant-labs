/** 日语听写独立子域名，如 ja.info-quests.com（部署时在 wrangler / .env 配置） */
export const JAPANESE_RECOGNITION_HOST =
  process.env.NEXT_PUBLIC_JAPANESE_RECOGNITION_HOST?.trim().toLowerCase() || "";

/** 日语听写子域名完整站点 URL */
export const JAPANESE_RECOGNITION_SITE_URL =
  process.env.NEXT_PUBLIC_JAPANESE_RECOGNITION_SITE_URL?.replace(/\/$/, "") ||
  (JAPANESE_RECOGNITION_HOST ? `https://${JAPANESE_RECOGNITION_HOST}` : "");

export function isJapaneseRecognitionSubdomainHost(
  host: string | null | undefined
): boolean {
  if (!JAPANESE_RECOGNITION_HOST || !host) return false;
  return host.split(":")[0].toLowerCase() === JAPANESE_RECOGNITION_HOST;
}

/** 子域名对外路径 → 应用内真实路径 */
export function japaneseRecognitionInternalPath(pathname: string): string | null {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/") return "/japanese-recognition";
  return null;
}

/** 应用内路径 → 子域名对外短路径 */
export function japaneseRecognitionPublicPath(pathname: string): string | null {
  if (pathname === "/japanese-recognition") return "/";
  return null;
}

export function isJapaneseRecognitionPath(pathname: string): boolean {
  return pathname === "/japanese-recognition" || pathname.startsWith("/japanese-recognition/");
}
