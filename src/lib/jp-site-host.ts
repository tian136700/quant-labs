/** 日语模块独立子域名，如 japanese.info-quests.com（与 finance 同一 Worker） */
export const JP_SITE_HOST =
  process.env.NEXT_PUBLIC_JP_SITE_HOST?.trim().toLowerCase() ||
  "japanese.info-quests.com";

/** 日语子域名完整站点 URL，如 https://japanese.info-quests.com */
export const JP_SITE_URL =
  process.env.NEXT_PUBLIC_JP_SITE_URL?.replace(/\/$/, "") ||
  `https://${JP_SITE_HOST}`;
