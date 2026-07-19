/** 英语模块独立子域名，如 english.info-quests.com（与 finance / japanese 同一 Worker） */
export const EN_SITE_HOST =
  process.env.NEXT_PUBLIC_EN_SITE_HOST?.trim().toLowerCase() ||
  "english.info-quests.com";

/** 英语子域名完整站点 URL，如 https://english.info-quests.com */
export const EN_SITE_URL =
  process.env.NEXT_PUBLIC_EN_SITE_URL?.replace(/\/$/, "") ||
  `https://${EN_SITE_HOST}`;
