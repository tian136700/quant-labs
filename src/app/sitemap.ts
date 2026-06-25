import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { teacherReviewSitemapEntries } from "@/lib/etr-seo";
import { storeReviewSitemapEntries } from "@/lib/store-review-seo";
import { isStoreReviewSubdomainHost } from "@/lib/store-review-host";
import { isTrendBlogSubdomainHost } from "@/lib/trend-blog-host";
import { trendBlogSitemapEntries } from "@/lib/trend-blog-seo";
import { toolDotSitemapEntries } from "@/lib/tool-dot-seo";
import { sitemapEntries } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host");

  let entries: { url: string; lastModified: Date; priority: number }[];
  if (isTrendBlogSubdomainHost(host)) {
    entries = trendBlogSitemapEntries();
  } else if (isStoreReviewSubdomainHost(host)) {
    entries = storeReviewSitemapEntries();
  } else {
    entries = [
      ...sitemapEntries(),
      ...teacherReviewSitemapEntries(),
      ...storeReviewSitemapEntries(),
      ...trendBlogSitemapEntries(),
      ...toolDotSitemapEntries(),
    ];
  }

  return entries.map(({ url, lastModified, priority }) => ({
    url,
    lastModified,
    changeFrequency: "daily",
    priority,
  }));
}
