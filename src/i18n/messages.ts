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
  teacherReview: {
    meta: { title: string; description: string };
    page: { title: string; subtitle: string };
    form: {
      heading: string;
      teacherName: string;
      teacherNamePlaceholder: string;
      classDate: string;
      score: string;
      scorePlaceholder: string;
      scoreUnit: string;
      remark: string;
      remarkPlaceholder: string;
      save: string;
      saving: string;
      reset: string;
      required: string;
    };
    history: {
      heading: string;
      refresh: string;
      sortHint: string;
      empty: string;
      id: string;
      teacherName: string;
      classDate: string;
      score: string;
      remark: string;
      updatedAt: string;
      actions: string;
      edit: string;
      delete: string;
      confirmDelete: string;
    };
    status: {
      saved: string;
      deleted: string;
      loadFailed: string;
      saveFailed: string;
      deleteFailed: string;
      editLoaded: string;
      resetDone: string;
    };
    auth: {
      gateSubtitle: string;
      loginTab: string;
      registerTab: string;
      loginHint: string;
      registerHint: string;
      saveCredentialsWarning: string;
      username: string;
      usernamePlaceholder: string;
      password: string;
      passwordPlaceholder: string;
      passwordConfirm: string;
      passwordConfirmPlaceholder: string;
      loginSubmit: string;
      registerSubmit: string;
      submitting: string;
      failed: string;
      logout: string;
      sessionExpires: string;
      showPassword: string;
      hidePassword: string;
      close: string;
    };
    demo: {
      banner: string;
      sampleTag: string;
      loginToManage: string;
      loginToSave: string;
      formPreviewHint: string;
    };
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
    teacherReview: {
      meta: {
        title: "English Teacher Review",
        description:
          "Record and review English teacher ratings after each class. Check history before booking to avoid poor matches.",
      },
      page: {
        title: "English Teacher Review",
        subtitle:
          "Log a score (0–10) after each lesson so you can pick better teachers before your next booking.",
      },
      form: {
        heading: "Add / Edit Review",
        teacherName: "Teacher name",
        teacherNamePlaceholder: "Enter teacher name",
        classDate: "Class date",
        score: "Score",
        scorePlaceholder: "Select score (0–10)",
        scoreUnit: "pts",
        remark: "Notes",
        remarkPlaceholder:
          "Optional: class experience, strengths, areas to improve…",
        save: "Save",
        saving: "Saving…",
        reset: "Clear form (new)",
        required: "*",
      },
      history: {
        heading: "Review history",
        refresh: "Refresh",
        sortHint:
          "Tip: click column headers to sort (toggle ascending / descending).",
        empty: "No reviews yet.",
        id: "ID",
        teacherName: "Teacher",
        classDate: "Class date",
        score: "Score",
        remark: "Notes",
        updatedAt: "Updated",
        actions: "Actions",
        edit: "Edit",
        delete: "Delete",
        confirmDelete: "Delete this review record?",
      },
      status: {
        saved: "Saved.",
        deleted: "Deleted.",
        loadFailed: "Failed to load records.",
        saveFailed: "Save failed.",
        deleteFailed: "Delete failed.",
        editLoaded: "Loaded for editing — change fields and save.",
        resetDone: "Form cleared for a new entry.",
      },
      auth: {
        gateSubtitle:
          "Log in to view and manage teacher reviews. New users can register to add records.",
        loginTab: "Log in",
        registerTab: "Register",
        loginHint: "Enter your username and password to sign in.",
        registerHint:
          "Register to add, edit, and delete reviews. Choose a username and password you will remember.",
        saveCredentialsWarning:
          "Important: save your username and password in a safe place. We cannot recover them if lost.",
        username: "Username",
        usernamePlaceholder: "Your username",
        password: "Password",
        passwordPlaceholder: "Your password",
        passwordConfirm: "Confirm password",
        passwordConfirmPlaceholder: "Enter password again",
        loginSubmit: "Log in",
        registerSubmit: "Register & enter",
        submitting: "Please wait…",
        failed: "Request failed. Please try again.",
        logout: "Log out",
        sessionExpires: "Session valid until",
        showPassword: "Show password",
        hidePassword: "Hide password",
        close: "Close",
      },
      demo: {
        banner:
          "Sample data below — log in or register to save and manage your own teacher reviews.",
        sampleTag: "Sample",
        loginToManage: "Log in / Register",
        loginToSave: "Please log in or register to save reviews.",
        formPreviewHint:
          "This is a preview of the form. Sign in to add your own records.",
      },
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
    teacherReview: {
      meta: {
        title: "英语老师评价",
        description:
          "记录每次上课对英语老师的评分，上课前查看历史评价，避免踩雷老师。",
      },
      page: {
        title: "英语老师评价",
        subtitle:
          "记录每次上课对英语老师的评分（0～10 分），便于根据历史数据选择合适的老师。",
      },
      form: {
        heading: "新增 / 编辑评价",
        teacherName: "英语老师姓名",
        teacherNamePlaceholder: "请输入老师姓名",
        classDate: "上课日期",
        score: "评分",
        scorePlaceholder: "请选择评分（0～10 分）",
        scoreUnit: "分",
        remark: "备注",
        remarkPlaceholder: "可选：记录本次上课体验、优缺点、需改进点等",
        save: "保存",
        saving: "保存中…",
        reset: "清空表单（新增）",
        required: "*",
      },
      history: {
        heading: "评价记录",
        refresh: "刷新",
        sortHint: "提示：点击表头可按列排序（升序 / 降序切换）。",
        empty: "暂无记录。",
        id: "ID",
        teacherName: "英语老师",
        classDate: "上课日期",
        score: "评分",
        remark: "备注",
        updatedAt: "更新时间",
        actions: "操作",
        edit: "编辑",
        delete: "删除",
        confirmDelete: "确认删除该条英语老师评价记录吗？",
      },
      status: {
        saved: "保存成功。",
        deleted: "已删除。",
        loadFailed: "加载记录失败，请重试。",
        saveFailed: "保存失败。",
        deleteFailed: "删除失败，请重试。",
        editLoaded: "已载入编辑，修改后点击保存。",
        resetDone: "已切换为新增。",
      },
      auth: {
        gateSubtitle:
          "登录后可查看与管理英语老师评价。新用户请先注册后再新增记录。",
        loginTab: "登录",
        registerTab: "注册",
        loginHint: "请输入用户名和密码登录。",
        registerHint:
          "注册后可新增、编辑、删除评价。请设置好用户名和密码并妥善保存。",
        saveCredentialsWarning:
          "重要提示：请务必保存好您的用户名和密码，遗失后无法找回。",
        username: "用户名",
        usernamePlaceholder: "请输入用户名",
        password: "密码",
        passwordPlaceholder: "请输入密码",
        passwordConfirm: "确认密码",
        passwordConfirmPlaceholder: "请再次输入密码",
        loginSubmit: "登录",
        registerSubmit: "注册并进入",
        submitting: "处理中…",
        failed: "请求失败，请重试。",
        logout: "退出登录",
        sessionExpires: "有效期至",
        showPassword: "显示密码",
        hidePassword: "隐藏密码",
        close: "关闭",
      },
      demo: {
        banner:
          "以下为示例数据，仅供了解功能用法。登录或注册后可保存并管理您自己的评价记录。",
        sampleTag: "示例",
        loginToManage: "登录 / 注册",
        loginToSave: "请先登录或注册后再保存评价。",
        formPreviewHint: "这是表单预览，登录后可新增您自己的记录。",
      },
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
