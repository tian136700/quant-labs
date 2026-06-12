export type Locale = "en" | "zh";

export const LS_LOCALE = "strategy_compare_locale";

export type Messages = {
  meta: {
    title: string;
    description: string;
  };
  lang: {
    en: string;
    zh: string;
    switchTo: string;
  };
  page: {
    title: string;
    subtitle: string;
  };
  params: {
    heading: string;
    ticker: string;
    tickerPlaceholder: string;
    years: string;
    action: string;
    run: string;
    computing: string;
  };
  status: {
    enterSymbol: string;
    yearsRange: string;
    loading: string;
    cacheHit: string;
    cacheMiss: string;
    requestFailed: string;
    errorPrefix: string;
  };
  results: {
    heading: string;
    hint: string;
    empty: string;
    symbol: string;
    range: string;
    pastYears: string;
    pastYear: string;
    currentPriceOn: string;
    baseline: string;
  };
  table: {
    strategy: string;
    buyDays: string;
    totalShares: string;
    avgBuy: string;
    currentPrice: string;
    perShareReturn: string;
    vsDca: string;
    totalPnl: string;
  };
  strategies: {
    dca: string;
    rsiLt: string;
  };
  chart: {
    heading: string;
    title: string;
    noData: string;
    date: string;
    dailyDca: string;
    rsiLt: string;
    rsiThreshold: string;
    hint: string;
  };
  seo: {
    heading: string;
    intro: string;
    faq: { q: string; a: string }[];
  };
};

export const messages: Record<Locale, Messages> = {
  en: {
    meta: {
      title: "Strategy Compare — DCA vs RSI",
      description:
        "Compare daily dollar-cost averaging vs RSI(6) threshold buying for US stocks and ETFs.",
    },
    lang: {
      en: "EN",
      zh: "中文",
      switchTo: "Switch language",
    },
    page: {
      title: "Strategy Compare (DCA vs RSI)",
      subtitle:
        "Enter a US stock or ETF ticker and lookback years. We assume 1 share total split across buy days — same logic as the original compare page — and contrast daily DCA with RSI(6) threshold buying (RSI < 20 / 25 / 30).",
    },
    params: {
      heading: "Parameters",
      ticker: "Ticker",
      tickerPlaceholder: "SPY, AAPL, QQQ",
      years: "Lookback years",
      action: "Action",
      run: "Run compare",
      computing: "Computing…",
    },
    status: {
      enterSymbol: "Please enter a ticker symbol.",
      yearsRange: "Years must be between 1 and 10.",
      loading: "Loading bars & computing strategies…",
      cacheHit: "Updated (D1 cache hit).",
      cacheMiss: "Updated (fetched & cached to D1).",
      requestFailed: "Request failed",
      errorPrefix: "Error",
    },
    results: {
      heading: "Results",
      hint: "vs DCA (%) = strategy per-share return minus DCA return (percentage points). Positive beats DCA; negative underperforms.",
      empty: "Enter a ticker and years, then run compare.",
      symbol: "Symbol",
      range: "Range",
      pastYears: "past {years} years",
      pastYear: "past {years} year",
      currentPriceOn: "Close on",
      baseline: "baseline",
    },
    table: {
      strategy: "Strategy",
      buyDays: "Buy days",
      totalShares: "Total shares",
      avgBuy: "Avg buy price (USD)",
      currentPrice: "Current price (USD)",
      perShareReturn: "Per-share return (%)",
      vsDca: "vs DCA (pp)",
      totalPnl: "Total P&L (USD)",
    },
    strategies: {
      dca: "Daily DCA",
      rsiLt: "RSI < {thr}",
    },
    chart: {
      heading: "Portfolio chart",
      title: "Portfolio value ($100/day) — {symbol}",
      noData: "No chart data.",
      date: "Date",
      dailyDca: "Daily DCA",
      rsiLt: "RSI < {thr}",
      rsiThreshold: "RSI threshold",
      hint: "Both strategies deploy the same total amount into stock ($100 × trading days). DCA spreads it daily; RSI concentrates it on trigger days. Lines show stock value only (aligned with the table above).",
    },
    seo: {
      heading: "About DCA vs RSI(6) backtesting",
      intro:
        "Compare dollar-cost averaging (DCA) with RSI(6) oversold buy signals for US stocks and ETFs. Enter any ticker — SPY, QQQ, AAPL, NVDA — and backtest 1–10 years of history. See whether RSI threshold buying (RSI < 20 / 25 / 30) beats daily DCA on average cost and total return.",
      faq: [
        {
          q: "What is RSI(6)?",
          a: "RSI (Relative Strength Index) with a 6-day period — more responsive than RSI 14 for short-term oversold signals on US equities.",
        },
        {
          q: "How does this compare DCA and RSI strategies?",
          a: "Both assume 1 total share split across buy days: DCA buys every trading day; RSI strategies buy only when RSI(6) drops below 20, 25, or 30.",
        },
        {
          q: "Which tickers work?",
          a: "Any US stock or ETF with Yahoo Finance history: SPY, QQQ, VOO, AAPL, MSFT, TSLA, and more.",
        },
        {
          q: "Is this investment advice?",
          a: "No. Historical backtests for research only. Past performance does not guarantee future results.",
        },
      ],
    },
  },
  zh: {
    meta: {
      title: "策略对比 — 定投 vs RSI",
      description:
        "对比美股/ETF 的每日定投与 RSI(6) 阈值触发买入策略的历史表现。",
    },
    lang: {
      en: "EN",
      zh: "中文",
      switchTo: "切换语言",
    },
    page: {
      title: "策略对比（定投 vs RSI 触发买入）",
      subtitle:
        "输入美股/ETF 代码与回溯年数。假设区间内总共买入 1 股、均分到各买入日（与原系统 /compare 口径一致），对比「每日定投」与 RSI(6) 低于 20 / 25 / 30 时触发买入的策略表现。",
    },
    params: {
      heading: "参数",
      ticker: "股票代码",
      tickerPlaceholder: "SPY、AAPL、QQQ",
      years: "回溯年数",
      action: "操作",
      run: "运行对比",
      computing: "计算中…",
    },
    status: {
      enterSymbol: "请输入股票代码。",
      yearsRange: "回溯年数须在 1 到 10 之间。",
      loading: "正在加载 K 线并计算策略…",
      cacheHit: "已更新（D1 缓存命中）。",
      cacheMiss: "已更新（已抓取并写入 D1）。",
      requestFailed: "请求失败",
      errorPrefix: "错误",
    },
    results: {
      heading: "结果",
      hint: "对比定投（%）= 该策略每股涨跌幅减去定投涨跌幅（百分点）。正值表示优于定投；负值表示跑输定投。",
      empty: "输入代码与年数后，点击「运行对比」。",
      symbol: "标的",
      range: "区间",
      pastYears: "过去 {years} 年",
      pastYear: "过去 {years} 年",
      currentPriceOn: "收盘价日期",
      baseline: "基准",
    },
    table: {
      strategy: "策略",
      buyDays: "买入日数",
      totalShares: "总买入股数",
      avgBuy: "平均买入价（美元）",
      currentPrice: "当前价（美元）",
      perShareReturn: "每股涨跌幅（%）",
      vsDca: "对比定投（百分点）",
      totalPnl: "总盈亏（美元）",
    },
    strategies: {
      dca: "每日定投",
      rsiLt: "RSI < {thr}",
    },
    chart: {
      heading: "资产走势",
      title: "组合市值（每日 $100）— {symbol}",
      noData: "暂无图表数据。",
      date: "日期",
      dailyDca: "每日定投",
      rsiLt: "RSI < {thr}",
      rsiThreshold: "RSI 阈值",
      hint: "两条策略投入股票的总资金相同（$100 × 交易日数）。定投每天分散买入；RSI 在触发日集中买入。曲线为股票市值（与上方表格口径一致，不含闲置现金）。",
    },
    seo: {
      heading: "关于定投 vs RSI(6) 策略对比",
      intro:
        "免费美股/ETF 策略回测工具：对比每日定投（DCA）与 RSI(6) 超卖信号触发买入。输入 SPY、QQQ、AAPL、NVDA 等任意代码，回测 1–10 年历史，查看 RSI 低于 20/25/30 时买入是否优于定投的均价与收益。",
      faq: [
        {
          q: "RSI(6) 是什么？",
          a: "6 日周期的相对强弱指数（RSI），比常见的 RSI 14 更敏感，适合捕捉美股短期超卖信号。",
        },
        {
          q: "定投和 RSI 策略怎么对比？",
          a: "假设区间内总共买入 1 股、均分到各买入日：定投每个交易日买入；RSI 策略仅在 RSI(6) 低于 20、25 或 30 时买入。",
        },
        {
          q: "支持哪些标的？",
          a: "Yahoo Finance 有历史数据的任意美股或 ETF，如 SPY、QQQ、VOO、AAPL、MSFT、TSLA 等。",
        },
        {
          q: "这是投资建议吗？",
          a: "不是。仅为历史回测参考，过往表现不代表未来收益。",
        },
      ],
    },
  },
};

/** 简单占位符替换：t("pastYears", { years: "2" }) */
export function formatMsg(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`
  );
}

export function strategyLabel(
  locale: Locale,
  key: string,
  fallbackName: string
): string {
  if (key === "dca") return messages[locale].strategies.dca;
  const m = key.match(/^rsi_lt_(\d+)$/);
  if (m) {
    return formatMsg(messages[locale].strategies.rsiLt, { thr: m[1] });
  }
  return fallbackName;
}
