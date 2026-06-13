import type { Metadata } from "next";
import { DEFAULT_YEARS, POPULAR_SYMBOLS, SITE_NAME, SITE_URL } from "./site";

export type SeoLocale = "en" | "zh";

/** 中英文合并 keywords，兼顾 Google 与百度 */
export const SEO_KEYWORDS = [
  // English
  "RSI",
  "RSI 6",
  "RSI(6)",
  "RSI indicator",
  "RSI signal",
  "RSI oversold",
  "RSI buy signal",
  "RSI vs DCA",
  "DCA",
  "dollar cost averaging",
  "dollar-cost averaging",
  "US stocks",
  "US stock investing",
  "US ETF",
  "stock backtest",
  "investment strategy",
  "strategy compare",
  "technical analysis",
  "SPY",
  "QQQ",
  "AAPL",
  // 中文
  "RSI指标",
  "RSI 6",
  "RSI信号",
  "RSI超卖",
  "RSI与定投对比",
  "定投",
  "美股",
  "美股投资",
  "美股ETF",
  "策略对比",
  "回测",
  "技术指标",
  "美元定投",
] as const;

const META: Record<
  SeoLocale,
  { title: string; description: string; ogLocale: string }
> = {
  en: {
    title: "Strategy Compare — DCA vs RSI(6) | US Stock Monitor",
    description:
      "Free backtest tool: compare daily dollar-cost averaging (DCA) vs RSI(6) threshold buying for US stocks and ETFs. See buy days, average cost, returns, and portfolio charts for SPY, QQQ, AAPL, and any ticker.",
    ogLocale: "en_US",
  },
  zh: {
    title: "策略对比 — 定投 vs RSI(6) | 美股监控",
    description:
      "免费美股策略回测：对比每日定投（DCA）与 RSI(6) 超卖信号触发买入。支持 SPY、QQQ、AAPL 等任意美股/ETF，查看买入日数、均价、涨跌幅与资产走势。",
    ogLocale: "zh_CN",
  },
};

export type PageMetaInput = {
  locale?: SeoLocale;
  symbol?: string;
  years?: string | number;
};

function parseYears(raw?: string | number): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return n >= 1 && n <= 10 ? n : null;
}

function buildTitle(locale: SeoLocale, symbol?: string, years?: number): string {
  const base = META[locale].title;
  if (!symbol) return base;
  const sym = symbol.trim().toUpperCase();
  const y = years ?? DEFAULT_YEARS;
  if (locale === "zh") {
    return `${sym} ${y}年 · 定投 vs RSI(6) 策略对比`;
  }
  return `${sym} ${y}-Year DCA vs RSI(6) Strategy Compare`;
}

function buildDescription(
  locale: SeoLocale,
  symbol?: string,
  years?: number
): string {
  const base = META[locale].description;
  if (!symbol) return base;
  const sym = symbol.trim().toUpperCase();
  const y = years ?? DEFAULT_YEARS;
  if (locale === "zh") {
    return `回测 ${sym} 过去 ${y} 年：每日定投 vs RSI(6) 低于 20/25/30 触发买入。对比买入日数、均价、每股涨跌幅与组合市值走势。`;
  }
  return `Backtest ${sym} over ${y} year(s): daily DCA vs RSI(6) buys when RSI drops below 20/25/30. Compare buy days, average cost, per-share return, and portfolio value.`;
}

function pagePath(locale: SeoLocale, symbol?: string, years?: number): string {
  const base = locale === "zh" ? "/zh" : "/";
  const params = new URLSearchParams();
  if (symbol) params.set("symbol", symbol.trim().toUpperCase());
  if (years != null) params.set("years", String(years));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function buildPageMetadata(input: PageMetaInput = {}): Metadata {
  const locale = input.locale ?? "en";
  const symbol = input.symbol?.trim().toUpperCase();
  const years = parseYears(input.years) ?? undefined;
  const title = buildTitle(locale, symbol, years);
  const description = buildDescription(locale, symbol, years);
  const canonicalPath = pagePath(locale, symbol, years);
  const canonical = `${SITE_URL}${canonicalPath}`;
  const altEn = `${SITE_URL}${pagePath("en", symbol, years)}`;
  const altZh = `${SITE_URL}${pagePath("zh", symbol, years)}`;

  return {
    title,
    description,
    keywords: [...SEO_KEYWORDS],
    applicationName: SITE_NAME,
    category: "finance",
    alternates: {
      canonical,
      languages: {
        en: altEn,
        "zh-CN": altZh,
        "x-default": altEn,
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: META[locale].ogLocale,
      alternateLocale: locale === "en" ? ["zh_CN"] : ["en_US"],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

function googleSiteVerificationCodes(): string[] {
  const codes = [
    process.env.GOOGLE_SITE_VERIFICATION,
    process.env.FOOD_GOOGLE_SITE_VERIFICATION,
  ]
    .flatMap((raw) => (raw ? raw.split(/[,\s]+/) : []))
    .map((code) => code.trim())
    .filter(Boolean);
  return [...new Set(codes)];
}

export const defaultMetadata: Metadata = {
  ...buildPageMetadata({ locale: "en" }),
  metadataBase: new URL(SITE_URL),
  ...(googleSiteVerificationCodes().length
    ? {
        verification: {
          google:
            googleSiteVerificationCodes().length === 1
              ? googleSiteVerificationCodes()[0]
              : googleSiteVerificationCodes(),
        },
      }
    : {}),
};

/** FAQ 结构化数据（中英各一套，按页面语言输出） */
export function buildFaqJsonLd(locale: SeoLocale) {
  const faq =
    locale === "zh"
      ? [
          {
            q: "RSI(6) 是什么？和 RSI 14 有什么区别？",
            a: "RSI（相对强弱指数）衡量价格涨跌 momentum。本工具使用 Wilder RSI，周期为 6（RSI 6），比常见的 RSI 14 更敏感，能更快捕捉短期超卖信号。",
          },
          {
            q: "定投（DCA）和 RSI 触发买入怎么对比？",
            a: "假设在选定区间内总共买入 1 股、均分到各买入日：定投在每个交易日分散买入；RSI 策略仅在 RSI(6) 低于 20、25 或 30 时集中买入。两者投入总股数相同，便于公平比较均价与收益。",
          },
          {
            q: "支持哪些美股和 ETF？",
            a: "任意在 Yahoo Finance 有历史数据的美股或 ETF 代码均可，例如 SPY、QQQ、VOO、AAPL、MSFT、NVDA 等。输入代码与回溯年数（1–10 年）即可运行回测。",
          },
          {
            q: "RSI 信号买入一定比定投好吗？",
            a: "不一定。RSI 超卖买入在震荡或急跌后反弹时可能获得更低均价，但在单边上涨行情中可能买入日更少、跑输每日定投。本工具用历史数据展示各策略的实际表现，供参考而非投资建议。",
          },
        ]
      : [
          {
            q: "What is RSI(6) and how is it different from RSI 14?",
            a: "RSI (Relative Strength Index) measures price momentum. This tool uses Wilder RSI with period 6, which is more responsive than the common RSI 14 and catches short-term oversold conditions faster.",
          },
          {
            q: "How are DCA and RSI-triggered buying compared?",
            a: "Both strategies assume 1 total share split across buy days in the lookback window: DCA buys every trading day; RSI strategies buy only when RSI(6) falls below 20, 25, or 30. Same total shares makes average cost and return directly comparable.",
          },
          {
            q: "Which US stocks and ETFs are supported?",
            a: "Any ticker with historical data on Yahoo Finance — e.g. SPY, QQQ, VOO, AAPL, MSFT, NVDA. Enter the symbol and lookback years (1–10) to run the backtest.",
          },
          {
            q: "Is RSI signal buying always better than DCA?",
            a: "Not always. RSI buys can beat DCA after sharp pullbacks, but may underperform in steady uptrends with fewer buy days. Results are historical backtests for research, not investment advice.",
          },
        ];

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

export function buildWebAppJsonLd(locale: SeoLocale) {
  const meta = META[locale];
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: locale === "zh" ? "策略对比 — 定投 vs RSI" : "Strategy Compare — DCA vs RSI",
    description: meta.description,
    url: locale === "zh" ? `${SITE_URL}/zh` : SITE_URL,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    inLanguage: locale === "zh" ? "zh-CN" : "en",
    featureList:
      locale === "zh"
        ? "美股/ETF 回测, RSI(6) 信号, 定投对比, 资产走势图"
        : "US stock/ETF backtest, RSI(6) signals, DCA comparison, portfolio chart",
  };
}

/** sitemap 条目 */
export function sitemapEntries(): { url: string; lastModified: Date; priority: number }[] {
  const now = new Date();
  const entries: { url: string; lastModified: Date; priority: number }[] = [
    { url: SITE_URL, lastModified: now, priority: 1 },
    { url: `${SITE_URL}/zh`, lastModified: now, priority: 1 },
  ];

  for (const locale of ["en", "zh"] as const) {
    for (const symbol of POPULAR_SYMBOLS) {
      const path =
        locale === "zh"
          ? `/zh?symbol=${symbol}&years=${DEFAULT_YEARS}`
          : `/?symbol=${symbol}&years=${DEFAULT_YEARS}`;
      entries.push({
        url: `${SITE_URL}${path}`,
        lastModified: now,
        priority: 0.8,
      });
    }
  }

  return entries;
}
