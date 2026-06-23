import {
  TREND_BLOG_HOST,
  TREND_BLOG_SITE_URL,
} from "@/lib/trend-blog-host";

/** blog 子域名站点根 URL（Google Search Console / canonical 用） */
export function trendBlogSiteUrl(): string {
  const configured = TREND_BLOG_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (TREND_BLOG_HOST) return `https://${TREND_BLOG_HOST}`;
  return "";
}

/** Google Trends 高热词 + 博客主题词（中英合并，便于 Google / 百度） */
export const TREND_BLOG_SEO_KEYWORDS_EN = [
  "AI trends 2026",
  "2026 AI news",
  "ChatGPT",
  "chat gpt",
  "GPT",
  "Gemini",
  "Google Gemini",
  "AI",
  "artificial intelligence",
  "LLM",
  "large language model",
  "GitHub trending",
  "GitHub hot repos",
  "open source AI",
  "prompt engineering",
  "AI tools",
  "Claude AI",
  "DeepSeek",
  "Hugging Face",
  "developer blog",
  "tech news",
] as const;

export const TREND_BLOG_SEO_KEYWORDS_ZH = [
  "AI趋势",
  "2026人工智能",
  "ChatGPT",
  "Gemini",
  "GPT",
  "大语言模型",
  "GitHub热门",
  "GitHub趋势",
  "提示词工程",
  "开源AI",
  "AI工具",
  "AI新闻",
  "开发者博客",
] as const;

export function trendBlogKeywords(): string[] {
  return [...TREND_BLOG_SEO_KEYWORDS_EN, ...TREND_BLOG_SEO_KEYWORDS_ZH];
}

export const TREND_BLOG_DEFAULT_META = {
  title: "AI Trend Digest 2026 — ChatGPT, Gemini & GitHub Trends Daily",
  description:
    "Daily 2026 AI trends and news: ChatGPT, Gemini, GPT updates, GitHub trending repos, prompt engineering tips, and open-source tools — for developers worldwide.",
  headline: "AI Trend Digest 2026: ChatGPT, Gemini & GitHub Trends",
  deck:
    "Daily coverage of ChatGPT, Gemini, GPT, and GitHub trending AI repos — your 2026 developer briefing.",
} as const;

/** sitemap：blog 子域名页面（提交 Google Search Console 用） */
export function trendBlogSitemapEntries(): {
  url: string;
  lastModified: Date;
  priority: number;
}[] {
  const now = new Date();
  const base = trendBlogSiteUrl();
  if (!base) return [];
  return [
    { url: `${base}/`, lastModified: now, priority: 1 },
    { url: `${base}/zh`, lastModified: now, priority: 0.8 },
  ];
}

/** FAQ 结构化数据（覆盖 Google 热搜 AI 相关查询） */
export function buildTrendBlogFaqJsonLd() {
  const base = trendBlogSiteUrl() || "https://blog.info-quests.com";
  const faq = [
    {
      q: "What are the top AI trends in 2026?",
      a: "AI Trend Digest tracks daily shifts in ChatGPT, Google Gemini, GPT models, open-source GitHub repos, and prompt engineering — updated every day for developers.",
    },
    {
      q: "Where can I find GitHub trending AI repositories?",
      a: "AI Trend Digest highlights hot open-source AI projects from GitHub Trending, with summaries, use cases, and copy-paste prompts for ChatGPT and Gemini.",
    },
    {
      q: "What's new with ChatGPT and Gemini?",
      a: "We cover ChatGPT, GPT, and Google Gemini updates alongside practical prompt tips so you can apply the latest AI tools in your workflow.",
    },
    {
      q: "2026 年 AI 趋势有哪些？",
      a: "AI Trend Digest 每日汇总 ChatGPT、Gemini、GPT 与 GitHub 热门 AI 开源项目，面向开发者提供 2026 年人工智能趋势解读（正文英文，可用浏览器翻译阅读）。",
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
    url: `${base}/`,
  };
}

export function buildTrendBlogWebSiteJsonLd() {
  const base = trendBlogSiteUrl() || "https://blog.info-quests.com";
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AI Trend Digest",
    description: TREND_BLOG_DEFAULT_META.description,
    url: `${base}/`,
    inLanguage: ["en", "zh-CN"],
    keywords: trendBlogKeywords().slice(0, 24).join(", "),
  };
}
