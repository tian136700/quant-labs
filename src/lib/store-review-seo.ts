import type { Metadata } from "next";
import { STORE_REVIEW_HOST } from "@/lib/store-review-host";
import { SITE_URL } from "@/lib/site";
import type { SeoLocale } from "@/lib/seo";

export type StoreReviewSeoPage = "home" | "plaza";

/** food 子域名站点根 URL（Google 提交与 canonical 用） */
export function storeReviewSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_STORE_REVIEW_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (STORE_REVIEW_HOST) return `https://${STORE_REVIEW_HOST}`;
  return `${SITE_URL}/store-review`;
}

/** food 子域名下的 canonical 路径（短 URL） */
export function storeReviewCanonicalPath(
  locale: SeoLocale,
  page: StoreReviewSeoPage
): string {
  if (page === "plaza") {
    return locale === "zh" ? "/zh/plaza" : "/plaza";
  }
  return locale === "zh" ? "/zh" : "/";
}

export const SVR_SEO_KEYWORDS_ZH = [
  "外卖平台打分",
  "外卖商家打分",
  "外卖评价工具",
  "外卖店铺评分",
  "商家打分工具",
  "外卖平台管理",
  "外卖避雷",
  "外卖推荐菜",
  "Grab评分",
  "美团评价",
  "Uber Eats评价",
  "外卖评分记录",
  "餐厅打分",
  "店铺评价工具",
  "公开评价广场",
] as const;

export const SVR_SEO_KEYWORDS_EN = [
  "food delivery rating tool",
  "restaurant rating tracker",
  "delivery app review tool",
  "rate restaurants and dishes",
  "food delivery score tracker",
  "shop rating tool",
  "Grab review tracker",
  "Uber Eats restaurant rating",
  "Meituan review tool",
  "delivery platform rating",
  "restaurant score log",
  "food delivery review plaza",
  "track takeout quality",
  "avoid bad restaurants delivery",
  "recommended dishes tracker",
] as const;

/** 泰语长尾词（面向泰国 Grab / foodpanda 等用户） */
export const SVR_SEO_KEYWORDS_TH = [
  "ให้คะแนนร้านอาหาร",
  "รีวิวแอปส่งอาหาร",
  "เครื่องมือให้คะแนนร้านอาหาร",
  "บันทึกคะแนนร้านอาหาร",
  "Grab รีวิว",
  "foodpanda review",
  "ให้คะแนน Grab",
  "ร้านอาหารแนะนำ",
  "ร้านอาหารเลี่ยง",
  "เครื่องมือจัดการรีวิวร้านอาหาร",
  "แพลตฟอร์มส่งอาหาร",
  "ให้คะแนนร้านค้า",
] as const;

const HOME_META: Record<
  SeoLocale,
  { title: string; description: string; ogLocale: string }
> = {
  en: {
    title:
      "Food Delivery Rating Tool — Rate Restaurants, Dishes & Track Reviews | Grab, Uber Eats, Meituan",
    description:
      "Free food delivery & restaurant rating tool: score shops 1–10 on Grab, Uber Eats, Meituan, foodpanda and offline stores. Log recommended dishes and ones to avoid. Optionally share public reviews on the plaza.",
    ogLocale: "en_US",
  },
  zh: {
    title: "外卖平台打分工具 — 商家评分记录 | Grab 美团 Uber Eats 避雷推荐",
    description:
      "免费外卖/店铺评价工具：给 Grab、美团、Uber Eats、foodpanda 及线下店打 1～10 分，记录推荐菜与避雷菜，可选公开到评价广场，方便管理自己的外卖体验。",
    ogLocale: "zh_CN",
  },
};

const PLAZA_META: Record<
  SeoLocale,
  { title: string; description: string; ogLocale: string }
> = {
  en: {
    title:
      "Food Review Plaza — Public Delivery & Restaurant Ratings | Dishes to Try & Avoid",
    description:
      "Browse public food delivery and shop reviews: platform scores, recommended dishes, and dishes to avoid. Filter by Grab, Meituan, Uber Eats, and more.",
    ogLocale: "en_US",
  },
  zh: {
    title: "外卖评价广场 — 公开店铺评分与避雷推荐",
    description:
      "浏览公开分享的外卖/店铺评价：平台、评分、推荐菜与避雷菜。可按 Grab、美团、Uber Eats 等平台筛选。",
    ogLocale: "zh_CN",
  },
};

function metaFor(page: StoreReviewSeoPage, locale: SeoLocale) {
  return page === "plaza" ? PLAZA_META[locale] : HOME_META[locale];
}

function buildKeywords(locale: SeoLocale): string[] {
  const primary =
    locale === "zh"
      ? [...SVR_SEO_KEYWORDS_ZH, ...SVR_SEO_KEYWORDS_EN.slice(0, 8)]
      : [...SVR_SEO_KEYWORDS_EN, ...SVR_SEO_KEYWORDS_ZH.slice(0, 8)];
  return [...primary, ...SVR_SEO_KEYWORDS_TH];
}

export function buildStoreReviewMetadata(
  locale: SeoLocale,
  page: StoreReviewSeoPage = "home"
): Metadata {
  const meta = metaFor(page, locale);
  const base = storeReviewSiteUrl();
  const canonical = `${base}${storeReviewCanonicalPath(locale, page)}`;
  const altEn = `${base}${storeReviewCanonicalPath("en", page)}`;
  const altZh = `${base}${storeReviewCanonicalPath("zh", page)}`;

  return {
    title: meta.title,
    description: meta.description,
    keywords: buildKeywords(locale),
    category: "food",
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
      siteName: locale === "zh" ? "外卖评价工具" : "Food Delivery Review Tool",
      locale: meta.ogLocale,
      alternateLocale: ["en_US", "zh_CN", "th_TH"],
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

export function buildStoreReviewFaqJsonLd(
  locale: SeoLocale,
  page: StoreReviewSeoPage = "home"
) {
  const faq =
    locale === "zh"
      ? page === "plaza"
        ? [
            {
              q: "评价广场是什么？",
              a: "展示用户勾选「公开分享」的外卖/店铺评价，包含平台、评分、备注、推荐菜与避雷菜。用户名仅显示首尾各 1 个字符，其余打码。",
            },
            {
              q: "可以按平台筛选吗？",
              a: "可以。支持 Grab、美团、Uber Eats、foodpanda 等常见平台，也可按店名搜索。",
            },
          ]
        : [
            {
              q: "外卖平台打分工具是做什么的？",
              a: "用于记录您在 Grab、美团、Uber Eats、foodpanda 或线下店的用餐/外卖体验，给店铺打 1～10 分，并标注推荐菜与避雷菜，方便下次点餐参考。",
            },
            {
              q: "需要登录吗？",
              a: "浏览公开评价广场无需登录。保存、编辑、删除自己的评价记录需要先注册或登录，每人只能管理自己的评价。",
            },
            {
              q: "评价可以公开吗？",
              a: "可以。保存时可勾选「公开到广场」，其他人可看到您的评分与菜品建议；用户名会打码显示。不勾选则仅自己可见。",
            },
            {
              q: "支持哪些外卖平台？",
              a: "支持 Grab、Uber Eats、美团、饿了么、foodpanda、DoorDash 等国内外常见平台，也可选「其他」或「线下店」。",
            },
          ]
      : page === "plaza"
        ? [
            {
              q: "What is the Store Review Plaza?",
              a: "A public feed of shop reviews users chose to share — platform, score, notes, recommended dishes, and dishes to avoid. Usernames show only the first and last character.",
            },
            {
              q: "Can I filter by delivery platform?",
              a: "Yes. Filter by Grab, Meituan, Uber Eats, foodpanda, and other platforms, or search by store name.",
            },
          ]
        : [
            {
              q: "What is this food delivery rating tool?",
              a: "Log scores (1–10) for restaurants on Grab, Uber Eats, Meituan, foodpanda, or offline visits. Track recommended dishes and ones to avoid for your next order.",
            },
            {
              q: "Do I need to log in?",
              a: "Browsing the public plaza is open to everyone. Saving, editing, and deleting your own reviews requires an account — each user manages only their records.",
            },
            {
              q: "Can I share reviews publicly?",
              a: "Yes. Check “Share publicly on the plaza” when saving. Others see your score and dish tips with a masked username. Leave unchecked to keep reviews private.",
            },
            {
              q: "Which delivery platforms are supported?",
              a: "Grab, Uber Eats, Meituan, Ele.me, foodpanda, DoorDash, and more — plus Other and Offline store options.",
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

export function buildStoreReviewWebAppJsonLd(
  locale: SeoLocale,
  page: StoreReviewSeoPage = "home"
) {
  const meta = metaFor(page, locale);
  const base = storeReviewSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name:
      locale === "zh"
        ? page === "plaza"
          ? "外卖评价广场"
          : "外卖平台打分工具"
        : page === "plaza"
          ? "Food Review Plaza"
          : "Food Delivery Rating Tool",
    description: meta.description,
    url: `${base}${storeReviewCanonicalPath(locale, page)}`,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    inLanguage: ["en", "zh-CN", "th"],
    featureList:
      locale === "zh"
        ? "外卖/店铺1-10分打分, 推荐菜与避雷菜, 私人记录, 公开评价广场, Grab美团Uber Eats"
        : "Restaurant 1-10 scores, dish recommendations, private log, public plaza, Grab Meituan Uber Eats",
    keywords: buildKeywords(locale).slice(0, 20).join(", "),
  };
}

/** sitemap：food 子域名下的评价页（提交 Google Search Console 用） */
export function storeReviewSitemapEntries(): {
  url: string;
  lastModified: Date;
  priority: number;
}[] {
  const now = new Date();
  const base = storeReviewSiteUrl();
  return [
    { url: `${base}/`, lastModified: now, priority: 1 },
    { url: `${base}/zh`, lastModified: now, priority: 1 },
    { url: `${base}/plaza`, lastModified: now, priority: 0.9 },
    { url: `${base}/zh/plaza`, lastModified: now, priority: 0.9 },
  ];
}
