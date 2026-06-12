/** 生产站点根 URL，部署时在 Cloudflare / .env 中设置 NEXT_PUBLIC_SITE_URL */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://finance.info-quests.com";

export const SITE_NAME = "US Stock Monitor — Strategy Compare";

/** 长尾 SEO：常见美股 / ETF 示例页 */
export const POPULAR_SYMBOLS = [
  "SPY",
  "QQQ",
  "VOO",
  "AAPL",
  "MSFT",
  "NVDA",
  "TSLA",
  "AMZN",
  "GOOGL",
  "META",
] as const;

export const DEFAULT_YEARS = 2;
