/** 韩语模块独立子域名，如 korean.info-quests.com（与 finance / japanese / english 同一 Worker） */
export const KO_SITE_HOST =
  process.env.NEXT_PUBLIC_KO_SITE_HOST?.trim().toLowerCase() ||
  "korean.info-quests.com";

/** 韩语子域名完整站点 URL，如 https://korean.info-quests.com */
export const KO_SITE_URL =
  process.env.NEXT_PUBLIC_KO_SITE_URL?.replace(/\/$/, "") ||
  `https://${KO_SITE_HOST}`;
