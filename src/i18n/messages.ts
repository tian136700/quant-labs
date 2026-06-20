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
  nav: {
    ariaLabel: string;
    strategyCompare: string;
    teacherReview: string;
    jpReview: string;
    jpVocab: string;
    storeReview: string;
    about: string;
    adminDashboard: string;
  };
  about: {
    meta: { title: string; description: string };
    page: { title: string; intro: string };
    form: {
      email: string;
      emailPlaceholder: string;
      content: string;
      contentPlaceholder: string;
      submit: string;
      submitting: string;
      required: string;
    };
    status: {
      submitted: string;
      submitFailed: string;
      emailRequired: string;
      emailInvalid: string;
      contentRequired: string;
    };
  };
  adminDashboard: {
    meta: { title: string; description: string };
    page: { title: string; subtitle: string };
    visits: {
      heading: string;
      refresh: string;
      empty: string;
      id: string;
      ip: string;
      ipVisitCount: string;
      country: string;
      url: string;
      eventType: string;
      eventDetail: string;
      locale: string;
      time: string;
      pagination: {
        prev: string;
        next: string;
        summary: string;
      };
    };
    feedback: {
      heading: string;
      refresh: string;
      empty: string;
      id: string;
      email: string;
      content: string;
      ip: string;
      country: string;
      url: string;
      locale: string;
      time: string;
    };
    auth: {
      required: string;
      login: string;
    };
    status: {
      loadFailed: string;
    };
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
    seo: {
      heading: string;
      intro: string;
      faq: { q: string; a: string }[];
    };
  };
  storeReview: {
    meta: { title: string; description: string };
    page: { title: string; subtitle: string; plazaLink: string };
    form: {
      heading: string;
      platform: string;
      platformPlaceholder: string;
      platformGroupIntl: string;
      platformGroupCn: string;
      platformGroupMisc: string;
      platformOther: string;
      platformOtherPlaceholder: string;
      platformRequired: string;
      platformOtherRequired: string;
      storeName: string;
      storeNamePlaceholder: string;
      storeNameRequired: string;
      score: string;
      scorePlaceholder: string;
      scoreRequired: string;
      scoreUnit: string;
      remark: string;
      remarkPlaceholder: string;
      publicLabel: string;
      publicHint: string;
      goodDishes: string;
      badDishes: string;
      addDish: string;
      removeDish: string;
      dishEmptyHint: string;
      dishNamePlaceholder: string;
      dishRemarkPlaceholder: string;
      badDishRemarkPlaceholder: string;
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
      loginHint: string;
      id: string;
      storeName: string;
      platform: string;
      score: string;
      remark: string;
      visibility: string;
      public: string;
      private: string;
      goodDishes: string;
      badDishes: string;
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
      loginTab: string;
      registerTab: string;
      logout: string;
    };
    demo: {
      banner: string;
      loginToSave: string;
    };
    plaza: {
      metaTitle: string;
      title: string;
      subtitle: string;
      myReviewsLink: string;
      filterHeading: string;
      platform: string;
      allPlatforms: string;
      storeSearch: string;
      storeSearchPlaceholder: string;
      search: string;
      listHeading: string;
      usernameHint: string;
      loading: string;
      empty: string;
      loadFailed: string;
      goodDishes: string;
      badDishes: string;
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
    nav: {
      ariaLabel: "Site navigation",
      strategyCompare: "DCA vs RSI",
      teacherReview: "Teacher Review",
      jpReview: "Japanese Review",
      jpVocab: "Japanese Vocab",
      storeReview: "Store Review",
      about: "About",
      adminDashboard: "Admin",
    },
    about: {
      meta: {
        title: "About & Feedback",
        description:
          "Share suggestions for Strategy Compare and English Teacher Review. Include page links so we can improve the right areas.",
      },
      page: {
        title: "About & Feedback",
        intro:
          "If you have any suggestions for this site, we'd love to hear from you. Please include links to the relevant section (e.g. Strategy Compare or Teacher Review) in your message so we know what to improve.",
      },
      form: {
        email: "Your email",
        emailPlaceholder: "you@example.com",
        content: "Your feedback",
        contentPlaceholder:
          "Describe your suggestion. Please paste the page URL or section name you are referring to…",
        submit: "Submit feedback",
        submitting: "Submitting…",
        required: "*",
      },
      status: {
        submitted: "Thank you! Your feedback has been submitted.",
        submitFailed: "Submission failed. Please try again.",
        emailRequired: "Please enter your email.",
        emailInvalid: "Please enter a valid email address.",
        contentRequired: "Please enter your feedback.",
      },
    },
    adminDashboard: {
      meta: {
        title: "Admin Dashboard",
        description: "View visit logs and user feedback submissions.",
      },
      page: {
        title: "Admin Dashboard",
        subtitle:
          "Monitor visitor activity and feedback submissions. Admin login required.",
      },
      visits: {
        heading: "Visit & action logs",
        refresh: "Refresh",
        empty: "No visit logs yet.",
        id: "ID",
        ip: "IP",
        ipVisitCount: "IP visits",
        country: "Country/Region",
        url: "URL",
        eventType: "Type",
        eventDetail: "Detail",
        locale: "Locale",
        time: "Time",
        pagination: {
          prev: "Previous",
          next: "Next",
          summary: "Page {page} of {totalPages} ({total} records)",
        },
      },
      feedback: {
        heading: "User feedback",
        refresh: "Refresh",
        empty: "No feedback yet.",
        id: "ID",
        email: "Email",
        content: "Feedback",
        ip: "IP",
        country: "Country/Region",
        url: "From page",
        locale: "Locale",
        time: "Time",
      },
      auth: {
        required: "Please log in as admin to view this page.",
        login: "Log in",
      },
      status: {
        loadFailed: "Failed to load data. Please try again.",
      },
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
        title: "English Teacher Review Tool — Rate & Track Online Tutors",
        description:
          "Free English teacher review tool: log scores (0–10), class dates, and notes after each online lesson. Check history before booking to avoid poor tutors.",
      },
      page: {
        title: "English Teacher Review Tool",
        subtitle:
          "Log a score (0–10) after each online English lesson — track tutor quality on iTalki, Preply, and more before your next booking.",
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
      seo: {
        heading: "About this English teacher review tool",
        intro:
          "Use this free online tutor rating tracker to record English teacher reviews after every lesson. Score each tutor from 0 to 10, add class dates and notes, then sort your history before booking on iTalki, Preply, Cambly, or any ESL platform. Avoid bad teachers by checking your private review log first — works on phone and desktop.",
        faq: [
          {
            q: "Why keep an English teacher review log?",
            a: "Online platforms show public ratings, but your own notes capture what mattered to you — accent, patience, punctuality, materials. A personal tracker helps you compare tutors you've actually tried.",
          },
          {
            q: "Can I use this for iTalki or Preply tutors?",
            a: "Yes. Enter any tutor name from iTalki, Preply, Verbling, Cambly, or offline teachers. The tool is platform-agnostic.",
          },
          {
            q: "Is my data private?",
            a: "Yes. Register to save records under your account. Sample rows on the page are demos only; your real reviews are not public.",
          },
          {
            q: "What should I write in the notes field?",
            a: "Pronunciation clarity, grammar corrections, conversation flow, homework, cancellations, or whether you'd book again — anything that helps you decide next time.",
          },
        ],
      },
    },
    storeReview: {
      meta: {
        title: "Store & Delivery Review — Rate Shops, Dishes & Share Tips",
        description:
          "Log scores for Grab, Meituan, Uber Eats and offline stores. Mark good dishes and ones to avoid. Share public reviews on the plaza.",
      },
      page: {
        title: "Store & Delivery Review",
        subtitle:
          "Rate shops on delivery apps or offline — score 1–10, note good dishes and ones to skip, optionally share on the public plaza.",
        plazaLink: "Browse public reviews on the plaza →",
      },
      form: {
        heading: "Add / Edit Review",
        platform: "Platform",
        platformPlaceholder: "Select platform",
        platformGroupIntl: "International",
        platformGroupCn: "China",
        platformGroupMisc: "Other / Offline",
        platformOther: "Platform name",
        platformOtherPlaceholder: "Enter platform name",
        platformRequired: "Please select a platform.",
        platformOtherRequired: "Please enter the platform name.",
        storeName: "Store name",
        storeNamePlaceholder: "Enter store or restaurant name",
        storeNameRequired: "Please enter the store name.",
        score: "Score",
        scorePlaceholder: "Select score (1–10)",
        scoreRequired: "Please select a score.",
        scoreUnit: "pts",
        remark: "Notes",
        remarkPlaceholder:
          "Overall experience, delivery speed, packaging, service…",
        publicLabel: "Share publicly on the plaza",
        publicHint:
          "When checked, others can see this review (username partially masked). Unchecked = private to you only.",
        goodDishes: "Recommended dishes",
        badDishes: "Dishes to avoid",
        addDish: "+ Add dish",
        removeDish: "Remove",
        dishEmptyHint: "Click “+ Add dish” to list items.",
        dishNamePlaceholder: "Dish name",
        dishRemarkPlaceholder: "Optional note",
        badDishRemarkPlaceholder: "Why to avoid (optional)",
        save: "Save",
        saving: "Saving…",
        reset: "Clear form (new)",
        required: "*",
      },
      history: {
        heading: "My review history",
        refresh: "Refresh",
        sortHint:
          "Tip: click column headers to sort (toggle ascending / descending).",
        empty: "No reviews yet.",
        loginHint: "Log in to view and manage your review history.",
        id: "ID",
        storeName: "Store",
        platform: "Platform",
        score: "Score",
        remark: "Notes",
        visibility: "Visibility",
        public: "Public",
        private: "Private",
        goodDishes: "Good dishes",
        badDishes: "Avoid",
        updatedAt: "Updated",
        actions: "Actions",
        edit: "Edit",
        delete: "Delete",
        confirmDelete: "Delete this review?",
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
        loginTab: "Log in",
        registerTab: "Register",
        logout: "Log out",
      },
      demo: {
        banner:
          "Log in or register to save reviews. Public reviews appear on the plaza with a masked username.",
        loginToSave: "Please log in or register to save reviews.",
      },
      plaza: {
        metaTitle: "Store Review Plaza — Public Delivery & Shop Ratings",
        title: "Store Review Plaza",
        subtitle:
          "Browse public shop reviews from delivery apps and offline stores — see scores, recommended dishes, and ones to avoid.",
        myReviewsLink: "← Add or manage my reviews",
        filterHeading: "Filter",
        platform: "Platform",
        allPlatforms: "All platforms",
        storeSearch: "Store name",
        storeSearchPlaceholder: "Search by store name…",
        search: "Search",
        listHeading: "Public reviews",
        usernameHint:
          "Usernames are partially masked (first and last character only). Registration requires at least 6 characters.",
        loading: "Loading…",
        empty: "No public reviews match your filters yet.",
        loadFailed: "Failed to load public reviews.",
        goodDishes: "Recommended",
        badDishes: "Avoid",
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
    nav: {
      ariaLabel: "站点导航",
      strategyCompare: "定投 vs RSI",
      teacherReview: "英语老师评价",
      jpReview: "日语口语复习",
      jpVocab: "日语单词抽问",
      storeReview: "商店评价",
      about: "关于",
      adminDashboard: "后台管理",
    },
    about: {
      meta: {
        title: "关于与反馈",
        description:
          "对本站（策略对比、英语老师评价等）提出建议。请尽量附上相关页面链接，便于我们改进。",
      },
      page: {
        title: "关于与反馈",
        intro:
          "如果您对本系统有任何建议，欢迎告诉我们。请尽量在建议中填入相关板块的链接（例如策略对比页或英语老师评价页），方便我们定位问题。",
      },
      form: {
        email: "您的邮箱",
        emailPlaceholder: "you@example.com",
        content: "您的建议",
        contentPlaceholder:
          "请描述您的建议，并尽量附上相关页面链接或板块名称…",
        submit: "提交建议",
        submitting: "提交中…",
        required: "*",
      },
      status: {
        submitted: "感谢您的反馈，我们已收到您的建议。",
        submitFailed: "提交失败，请稍后重试。",
        emailRequired: "请输入您的邮箱。",
        emailInvalid: "请输入有效的邮箱格式。",
        contentRequired: "请填写您的建议内容。",
      },
    },
    adminDashboard: {
      meta: {
        title: "后台管理",
        description: "查看访问日志与用户反馈。",
      },
      page: {
        title: "后台管理",
        subtitle: "查看访客操作记录与用户提交的建议。需管理员登录。",
      },
      visits: {
        heading: "访问与操作日志",
        refresh: "刷新",
        empty: "暂无访问记录。",
        id: "ID",
        ip: "IP 地址",
        ipVisitCount: "IP 访问总次数",
        country: "国家/地区",
        url: "访问网址",
        eventType: "类型",
        eventDetail: "操作详情",
        locale: "语言",
        time: "时间",
        pagination: {
          prev: "上一页",
          next: "下一页",
          summary: "第 {page} / {totalPages} 页，共 {total} 条",
        },
      },
      feedback: {
        heading: "用户反馈",
        refresh: "刷新",
        empty: "暂无反馈。",
        id: "ID",
        email: "邮箱",
        content: "建议内容",
        ip: "IP 地址",
        country: "国家/地区",
        url: "来源页面",
        locale: "语言",
        time: "时间",
      },
      auth: {
        required: "请使用管理员账号登录后查看。",
        login: "去登录",
      },
      status: {
        loadFailed: "加载失败，请重试。",
      },
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
        title: "英语老师评价工具 — 在线外教评分记录 | 上课前查评价",
        description:
          "免费英语老师评价工具：记录每次在线外教课评分（0～10 分）、上课日期与备注，上课预约前查看历史评价，避开不合适的外教老师。",
      },
      page: {
        title: "英语老师评价工具",
        subtitle:
          "记录每次在线英语课/外教私教评分（0～10 分），上课前查看历史评价，适用于 italki、Preply 等平台，帮你避开踩雷老师。",
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
      seo: {
        heading: "关于英语老师评价工具",
        intro:
          "这是一款免费的在线外教评价工具，帮助您记录每次英语课后的老师评分。按 0～10 分打分，填写上课日期与备注，支持按老师、日期、分数排序。在 italki、Preply、Cambly 等平台预约新课之前，先查自己的评价记录，避开不合适的外教老师。手机与电脑均可使用，注册后数据保存在您的账户下。",
        faq: [
          {
            q: "为什么要自己做英语老师评价记录？",
            a: "平台公开展示的评分往往不够个性化。您自己的记录能记下发音、耐心、准时、课件质量等细节，方便对比上过的不同外教。",
          },
          {
            q: "可以用于 italki、Preply 上的外教吗？",
            a: "可以。填写任意平台或线下英语老师的姓名即可，本工具不绑定特定平台。",
          },
          {
            q: "我的评价会公开吗？",
            a: "不会。注册登录后，您的评价仅保存在个人账户中。页面上未登录时看到的示例数据仅供了解功能。",
          },
          {
            q: "备注里可以写什么？",
            a: "例如：发音是否清晰、纠错是否及时、对话引导如何、是否经常取消、是否愿意再约等，任何有助于下次选课的信息都可以写。",
          },
        ],
      },
    },
    storeReview: {
      meta: {
        title: "商店 / 外卖评价 — 打分、避雷菜品、公开分享",
        description:
          "记录 Grab、美团、Uber Eats 及线下店铺评分，标注好吃与避雷菜品，可选公开到评价广场。",
      },
      page: {
        title: "商店 / 外卖评价",
        subtitle:
          "给外卖平台或线下店铺打分（1～10 分），记录推荐菜与避雷菜，可选择公开到评价广场。",
        plazaLink: "去评价广场看看大家的公开评价 →",
      },
      form: {
        heading: "新增 / 编辑评价",
        platform: "平台",
        platformPlaceholder: "请选择平台",
        platformGroupIntl: "国外平台",
        platformGroupCn: "国内平台",
        platformGroupMisc: "其他 / 线下",
        platformOther: "平台名称",
        platformOtherPlaceholder: "请输入平台名称",
        platformRequired: "请选择平台。",
        platformOtherRequired: "选择「其他平台」时请填写平台名称。",
        storeName: "商店名称",
        storeNamePlaceholder: "请输入店铺或餐厅名称",
        storeNameRequired: "请输入商店名称。",
        score: "评分",
        scorePlaceholder: "请选择评分（1～10 分）",
        scoreRequired: "请选择评分。",
        scoreUnit: "分",
        remark: "备注",
        remarkPlaceholder: "整体体验、配送速度、包装、服务等…",
        publicLabel: "公开到评价广场",
        publicHint:
          "勾选后其他人可在广场看到（用户名部分打码）；不勾选则仅自己可见。",
        goodDishes: "推荐菜品",
        badDishes: "避雷菜品",
        addDish: "+ 添加菜品",
        removeDish: "删除",
        dishEmptyHint: "点击「+ 添加菜品」填写菜名。",
        dishNamePlaceholder: "菜名",
        dishRemarkPlaceholder: "备注（可选）",
        badDishRemarkPlaceholder: "避雷原因（可选）",
        save: "保存",
        saving: "保存中…",
        reset: "清空表单（新增）",
        required: "*",
      },
      history: {
        heading: "我的评价记录",
        refresh: "刷新",
        sortHint: "提示：点击表头可按列排序（升序 / 降序切换）。",
        empty: "暂无记录。",
        loginHint: "登录后可查看与管理您的评价记录。",
        id: "ID",
        storeName: "商店",
        platform: "平台",
        score: "评分",
        remark: "备注",
        visibility: "可见性",
        public: "公开",
        private: "私密",
        goodDishes: "推荐菜",
        badDishes: "避雷",
        updatedAt: "更新时间",
        actions: "操作",
        edit: "编辑",
        delete: "删除",
        confirmDelete: "确认删除该条评价吗？",
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
        loginTab: "登录",
        registerTab: "注册",
        logout: "退出登录",
      },
      demo: {
        banner:
          "登录或注册后可保存评价。勾选公开的评价会出现在广场，用户名会部分打码显示。",
        loginToSave: "请先登录或注册后再保存评价。",
      },
      plaza: {
        metaTitle: "评价广场 — 公开的外卖 / 店铺评价",
        title: "评价广场",
        subtitle:
          "浏览大家公开分享的店铺评价：平台、评分、推荐菜与避雷菜。",
        myReviewsLink: "← 去新增或管理我的评价",
        filterHeading: "筛选",
        platform: "平台",
        allPlatforms: "全部平台",
        storeSearch: "商店名称",
        storeSearchPlaceholder: "按店名搜索…",
        search: "搜索",
        listHeading: "公开评价",
        usernameHint:
          "用户名仅显示首尾各 1 个字符，中间用星号代替；注册时用户名至少 6 个字符。",
        loading: "加载中…",
        empty: "暂无符合条件的公开评价。",
        loadFailed: "加载公开评价失败。",
        goodDishes: "推荐",
        badDishes: "避雷",
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
