import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import type { SeoLocale } from "@/lib/seo";

const HOME_META: Record<
  SeoLocale,
  { title: string; description: string; ogLocale: string }
> = {
  en: {
    title: "Online Tools — PDF to Word, PDF to Excel, Word to PDF",
    description:
      "Simple online document converters. Enter your redemption code to convert PDF to Word, PDF to Excel, or Word to PDF once per code.",
    ogLocale: "en_US",
  },
  zh: {
    title: "在线工具 — PDF 转 Word、PDF 转 Excel、Word 转 PDF",
    description:
      "简单易用的文档转换工具。输入兑换码即可转换：PDF 转 Word、PDF 转 Excel、Word 转 PDF，一码一次。",
    ogLocale: "zh_CN",
  },
};

export function toolDotPath(locale: SeoLocale): string {
  return locale === "zh" ? "/zh/tool-dot" : "/tool-dot";
}

export function buildToolDotMetadata(locale: SeoLocale): Metadata {
  const meta = HOME_META[locale];
  const canonical = `${SITE_URL}${toolDotPath(locale)}`;
  const altEn = `${SITE_URL}/tool-dot`;
  const altZh = `${SITE_URL}/zh/tool-dot`;

  return {
    title: meta.title,
    description: meta.description,
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
      siteName: locale === "zh" ? "在线工具" : "Online Tools",
      locale: meta.ogLocale,
      alternateLocale: ["en_US", "zh_CN"],
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export function toolDotSitemapEntries(): {
  url: string;
  lastModified: Date;
  priority: number;
}[] {
  const now = new Date();
  return [
    { url: `${SITE_URL}/tool-dot`, lastModified: now, priority: 0.85 },
    { url: `${SITE_URL}/zh/tool-dot`, lastModified: now, priority: 0.85 },
    { url: `${SITE_URL}/tool-dot/pdf-to-word`, lastModified: now, priority: 0.8 },
    { url: `${SITE_URL}/zh/tool-dot/pdf-to-word`, lastModified: now, priority: 0.8 },
    { url: `${SITE_URL}/tool-dot/pdf-to-excel`, lastModified: now, priority: 0.8 },
    { url: `${SITE_URL}/zh/tool-dot/pdf-to-excel`, lastModified: now, priority: 0.8 },
    { url: `${SITE_URL}/tool-dot/word-to-pdf`, lastModified: now, priority: 0.8 },
    { url: `${SITE_URL}/zh/tool-dot/word-to-pdf`, lastModified: now, priority: 0.8 },
  ];
}
