import type { MetadataRoute } from "next";
import { teacherReviewSitemapEntries } from "@/lib/etr-seo";
import { sitemapEntries } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const entries = [...sitemapEntries(), ...teacherReviewSitemapEntries()];
  return entries.map(({ url, lastModified, priority }) => ({
    url,
    lastModified,
    changeFrequency: "weekly",
    priority,
  }));
}
