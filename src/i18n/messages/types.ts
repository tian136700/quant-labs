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
    jpLesson: string;
    jpLessonSchedule: string;
    jpVocab: string;
    jpVocabAdmin: string;
    jpVocabStudy: string;
    jpVocabReview: string;
    jpVocabCoach: string;
    enLesson: string;
    enVocab: string;
    enVocabAdmin: string;
    enVocabReview: string;
    enVocabStudy: string;
    koPron: string;
    koPronAdmin: string;
    koPronSelect: string;
    koPronReview: string;
    koPronStudy: string;
    storeReview: string;
    about: string;
    adminDashboard: string;
    adminWorkerTraffic: string;
    adminTrends: string;
    adminRbac: string;
    adminUsers: string;
    adminToolCodes: string;
    adminJpLessonTeachers: string;
    langJp: string;
    langEn: string;
    langKo: string;
    more: string;
    allFeatures: string;
    searchPlaceholder: string;
    searchResults: string;
    recent: string;
    favorites: string;
    noResults: string;
    closeMenu: string;
    favoriteAdd: string;
    favoriteRemove: string;
    categories: {
      jp: string;
      en: string;
      ko: string;
      admin: string;
      ai: string;
      data: string;
      system: string;
    };
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
      username: string;
      country: string;
      isp: string;
      url: string;
      eventType: string;
      eventDetail: string;
      locale: string;
      time: string;
      updatedAt: string;
      sortLabel: string;
      pagination: {
        prev: string;
        next: string;
        summaryMulti: string;
        summarySingle: string;
        pageSizeLabel: string;
        pageSizeOption: string;
        pageSizeAria: string;
      };
      filterLabel: string;
      filterAll: string;
      filterUnregistered: string;
      filterSearch: string;
    };
    traffic: {
      heading: string;
      refresh: string;
      dateLabel: string;
      quotaLabel: string;
      quotaUsed: string;
      anonymousLabel: string;
      anonymousHits: string;
      topRoutes: string;
      topUsers: string;
      topPairs: string;
      filterUserAll: string;
      filterUserHint: string;
      copyReport: string;
      copySuccess: string;
      copyFailed: string;
      reportTitle: string;
      route: string;
      kind: string;
      kindApi: string;
      kindPage: string;
      hits: string;
      username: string;
      anonymousUser: string;
      unregistered: string;
      empty: string;
      loadFailed: string;
      diagnoseHint: string;
      avgPerSec: string;
      peakPerSec: string;
      routeClickHint: string;
      routeIpsHeading: string;
      routeIpsHint: string;
      ip: string;
      close: string;
      hourlyHeading: string;
      dailyTrendHeading: string;
      hourlyHint: string;
      hourLabel: string;
      quotaResetLabel: string;
      dateShort: string;
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
      checking: string;
      currentUser: string;
      unregistered: string;
    };
    status: {
      loadFailed: string;
    };
  };
  adminWorkerTraffic: {
    meta: { title: string; description: string };
    page: {
      title: string;
      subtitle: string;
      backToAdmin: string;
    };
    auth: {
      required: string;
      login: string;
    };
  };
  adminTrends: {
    meta: { title: string; description: string };
    page: {
      title: string;
      subtitle: string;
      backToAdmin: string;
    };
    runs: {
      heading: string;
      refresh: string;
      fetch: string;
      fetching: string;
      empty: string;
      id: string;
      fetchedAt: string;
      github: string;
      reddit: string;
      selected: string;
      actions: string;
      view: string;
    };
    detail: {
      heading: string;
      selectedHint: string;
      fullPrompt: string;
      copy: string;
    };
    items: {
      rank: string;
      source: string;
      title: string;
      heat: string;
      actions: string;
      preview: string;
    };
    itemDetail: {
      heading: string;
      description: string;
      url: string;
      fullPrompt: string;
    };
    auth: {
      required: string;
      login: string;
    };
    status: {
      loadFailed: string;
      copied: string;
      fetchSuccess: string;
      fetchFailed: string;
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
      registerLink: string;
      switchToLogin: string;
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
  toolDot: {
    meta: { title: string; description: string };
    page: {
      title: string;
      subtitle: string;
      codeHint: string;
      toolsHeading: string;
      openTool: string;
      footerNote: string;
    };
    tools: {
      "pdf-to-word": { title: string; desc: string; pageTitle: string; fileHint: string };
      "pdf-to-excel": { title: string; desc: string; pageTitle: string; fileHint: string };
      "word-to-pdf": { title: string; desc: string; pageTitle: string; fileHint: string };
    };
    converter: {
      backHome: string;
      codeLabel: string;
      codePlaceholder: string;
      codeHint: string;
      codeRequired: string;
      fileLabel: string;
      fileRequired: string;
      fileTooLarge: string;
      convert: string;
      working: string;
      claiming: string;
      converting: string;
      claimFailed: string;
      convertFailed: string;
      done: string;
      disclaimer: string;
    };
    admin: {
      meta: { title: string };
      page: { title: string; subtitle: string };
      backHome: string;
      confirmDelete: string;
      auth: {
        checking: string;
        required: string;
        login: string;
      };
      generate: {
        heading: string;
        toolType: string;
        count: string;
        label: string;
        labelPlaceholder: string;
        submit: string;
        generating: string;
        result: string;
        copyAll: string;
      };
      list: {
        heading: string;
        filterAll: string;
        filterUnused: string;
        filterUsed: string;
        refresh: string;
        loading: string;
        empty: string;
        code: string;
        toolType: string;
        label: string;
        status: string;
        used: string;
        unused: string;
        usedAt: string;
        actions: string;
        delete: string;
      };
      toolTypes: Record<string, string>;
      status: {
        loadFailed: string;
        generateFailed: string;
        generated: string;
        copied: string;
        copyFailed: string;
        deleteFailed: string;
      };
    };
  };
};


