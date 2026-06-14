import type { MetadataRoute } from "next";
import { teacherReviewSitemapEntries } from "@/lib/etr-seo";
import { japaneseRecognitionSitemapEntries } from "@/lib/japanese-recognition-seo";
import { storeReviewSitemapEntries } from "@/lib/store-review-seo";
import { sitemapEntries } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const entries = [
    ...sitemapEntries(),
    ...teacherReviewSitemapEntries(),
    ...storeReviewSitemapEntries(),
    ...japaneseRecognitionSitemapEntries(),
  ];
  return entries.map(({ url, lastModified, priority }) => ({
    url,
    lastModified,
    changeFrequency: "weekly",
    priority,
  }));
}
