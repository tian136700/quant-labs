import type { Metadata } from "next";
import { SITE_URL } from "./site";
import type { SeoLocale } from "./seo";

/** 中文：用户可能搜索的长尾词 */
export const ETR_SEO_KEYWORDS_ZH = [
  "英语老师评价",
  "英语老师评价工具",
  "在线外教评价",
  "外教老师评分",
  "外教评价工具",
  "英语老师评分记录",
  "在线英语课老师评价",
  "上课老师评价",
  "外教打分",
  "英语老师打分",
  "italki老师评价",
  "在线外教评分",
  "外教上课体验记录",
  "英语私教评价",
  "外教避雷",
] as const;

/** English: likely search terms */
export const ETR_SEO_KEYWORDS_EN = [
  "English teacher review",
  "English teacher review tool",
  "online English tutor review",
  "tutor rating tracker",
  "ESL teacher evaluation",
  "record teacher ratings",
  "teacher review before booking",
  "online tutor score tracker",
  "English lesson review",
  "iTalki teacher review",
  "private English tutor rating",
  "track tutor quality",
  "avoid bad English teachers",
  "tutor feedback log",
] as const;

const META: Record<
  SeoLocale,
  { title: string; description: string; ogLocale: string }
> = {
  zh: {
    title: "英语老师评价工具 — 在线外教评分记录 | 上课前查评价避雷",
    description:
      "免费英语老师评价工具：记录每次在线外教/英语课评分（0～10 分）、上课日期与备注，支持排序与历史查询。上课预约前查看评价，避开不合适的外教老师。适用于 italki、Preply 等平台私教课。",
    ogLocale: "zh_CN",
  },
  en: {
    title: "English Teacher Review Tool — Rate & Track Online Tutors",
    description:
      "Free English teacher review tool: log scores (0–10), class dates, and notes after each online lesson. Sort and browse history before your next booking to avoid poor tutors on iTalki, Preply, and other platforms.",
    ogLocale: "en_US",
  },
};

const PATH: Record<SeoLocale, string> = {
  en: "/english-teacher-review",
  zh: "/zh/english-teacher-review",
};

export function teacherReviewPath(locale: SeoLocale): string {
  return PATH[locale];
}

export function buildTeacherReviewMetadata(locale: SeoLocale): Metadata {
  const meta = META[locale];
  const canonical = `${SITE_URL}${PATH[locale]}`;
  const altEn = `${SITE_URL}${PATH.en}`;
  const altZh = `${SITE_URL}${PATH.zh}`;
  const keywords =
    locale === "zh"
      ? [...ETR_SEO_KEYWORDS_ZH, ...ETR_SEO_KEYWORDS_EN.slice(0, 6)]
      : [...ETR_SEO_KEYWORDS_EN, ...ETR_SEO_KEYWORDS_ZH.slice(0, 6)];

  return {
    title: meta.title,
    description: meta.description,
    keywords,
    category: "education",
    alternates: {
      canonical,
      languages: {
        en: altEn,
        "zh-CN": altZh,
        "x-default": altEn,
      },
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: canonical,
      locale: meta.ogLocale,
      alternateLocale: locale === "en" ? ["zh_CN"] : ["en_US"],
      type: "website",
    },
    twitter: {
      card: "summary",
      title: meta.title,
      description: meta.description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export function buildTeacherReviewFaqJsonLd(locale: SeoLocale) {
  const faq =
    locale === "zh"
      ? [
          {
            q: "英语老师评价工具是做什么的？",
            a: "用于记录每次在线英语课或外教私教课后的评分与备注。按老师姓名、上课日期、分数（0～10）保存，上课预约前可查看历史评价，帮助避开不合适的老师。",
          },
          {
            q: "适合哪些在线英语平台的外教？",
            a: "适用于 italki、Preply、Cambly、Verbling 等任意在线外教平台。工具不绑定平台，只需填写老师姓名、上课日期和您的主观评分即可。",
          },
          {
            q: "评价记录是公开的吗？",
            a: "不是。注册登录后，您的评价记录仅保存在您的账户下，不会公开展示给其他用户。页面上的示例数据仅供未登录访客了解功能。",
          },
          {
            q: "如何给英语老师打分？",
            a: "登录或注册后，填写英语老师姓名、上课日期，选择 0～10 分评分，并可添加备注（如发音、耐心、课件质量等），点击保存即可。支持编辑、删除与按列排序。",
          },
          {
            q: "手机和电脑都能用吗？",
            a: "可以。本工具支持响应式布局，手机端以卡片展示记录，电脑端以表格展示，增删改查功能一致。",
          },
        ]
      : [
          {
            q: "What is this English teacher review tool?",
            a: "It lets you log a score (0–10), class date, and notes after each online English lesson. Browse sorted history before booking your next tutor to avoid poor matches.",
          },
          {
            q: "Which tutoring platforms does it work with?",
            a: "Any platform — iTalki, Preply, Cambly, Verbling, etc. Enter the tutor name, date, and your rating; no platform integration required.",
          },
          {
            q: "Are my reviews public?",
            a: "No. After you register and log in, your records are private to your account. Sample data on the page is for demo only.",
          },
          {
            q: "How do I rate an English teacher?",
            a: "Sign in, enter the teacher name and class date, pick a score from 0 to 10, add optional notes, and save. You can edit, delete, and sort entries anytime.",
          },
          {
            q: "Does it work on mobile and desktop?",
            a: "Yes. The layout adapts: card view on phones, table view on desktop, with the same CRUD features on both.",
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

export function buildTeacherReviewWebAppJsonLd(locale: SeoLocale) {
  const meta = META[locale];
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name:
      locale === "zh"
        ? "英语老师评价工具"
        : "English Teacher Review Tool",
    description: meta.description,
    url: `${SITE_URL}${PATH[locale]}`,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    inLanguage: locale === "zh" ? "zh-CN" : "en",
    featureList:
      locale === "zh"
        ? "外教评分记录, 0-10分打分, 上课日期, 备注, 历史排序, 手机电脑通用"
        : "Tutor rating log, 0-10 scores, class dates, notes, sortable history, mobile & desktop",
  };
}

/** sitemap 条目（英语老师评价页） */
export function teacherReviewSitemapEntries(): {
  url: string;
  lastModified: Date;
  priority: number;
}[] {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}${PATH.en}`,
      lastModified: now,
      priority: 0.9,
    },
    {
      url: `${SITE_URL}${PATH.zh}`,
      lastModified: now,
      priority: 0.9,
    },
  ];
}
