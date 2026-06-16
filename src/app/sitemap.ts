import type { MetadataRoute } from "next";
import { teacherReviewSitemapEntries } from "@/lib/etr-seo";
import { storeReviewSitemapEntries } from "@/lib/store-review-seo";
import { sitemapEntries } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const entries = [
    ...sitemapEntries(),
    ...teacherReviewSitemapEntries(),
    ...storeReviewSitemapEntries(),
  ];
  return entries.map(({ url, lastModified, priority }) => ({
    url,
    lastModified,
    changeFrequency: "weekly",
    priority,
  }));
}
